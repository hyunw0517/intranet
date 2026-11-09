import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditActionType, AuditTargetType, FacilityReservationStatus, Users } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { diffChanges } from "src/common/util/audit-detail.util";
import { PaginatePage } from "src/common/util/pagination.util";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateUnavailableDto } from "./dto/create-unavailable.dto";
import { UpdateUnavailableDto } from "./dto/update-unavailable.dto";
import { UnavailableListQueryDto } from "./dto/unavailable-list-query.dto";
import { formatReservationTime } from "./util/reservation-rules.util";

//! 시설 사용 불가 기간 (점검 등, 관리자)
// - 등록·수정할 때 겹치는 기존 예약이 있어도 저장하고, 응답의 conflicts로 관리자 화면에 경고만 보여 준다.
//   기존 예약은 그대로 두고 예약자에게 알림도 보내지 않는다. (2026-11-09 사용자 결정)
// - 그 기간의 새 예약은 예약 서비스가 막는다.
// - 감사 로그 대상은 시설(FACILITY) - 사용 불가 기간 전용 enum 값을 따로 두지 않는다.
@Injectable()
export class FacilityUnavailableService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.FACILITY );
    }

    //* 목록 (시작 시각 정렬, 기본 최신순)
    async findAll( facilityId: number, query: UnavailableListQueryDto ) {
        await this.findFacilityOrThrow( facilityId );

        const where = {
            facilityId,
            deleted: false,
            startAt: query.to ? { lt: query.to } : undefined,
            endAt: query.from ? { gt: query.from } : undefined,
        };

        return PaginatePage( query,
            ( page ) => this.prisma.facilityUnavailable.findMany({ where, orderBy: [ { startAt: query.order }, { id: query.order } ], ...page }),
            () => this.prisma.facilityUnavailable.count({ where }),
        );
    }

    //* 등록 → { unavailable, conflicts }
    async create( user: Pick<Users, 'id'>, facilityId: number, body: CreateUnavailableDto ) {
        const facility = await this.findFacilityOrThrow( facilityId );
        this.assertRange( body.startAt, body.endAt );

        const unavailable = await this.prisma.$transaction( async ( tx ) => {
            const row = await tx.facilityUnavailable.create({
                data: {
                    facilityId,
                    startAt: body.startAt,
                    endAt: body.endAt,
                    reason: body.reason,
                    createdId: user.id,
                    updatedId: user.id,
                },
            });

            await this.audit.log({
                targetId: facilityId,
                actionType: AuditActionType.CREATE,
                content: `사용 불가 기간 등록: ${facility.name} ${formatReservationTime( row.startAt, row.endAt )}`,
                detail: { unavailableId: row.id, startAt: row.startAt, endAt: row.endAt, reason: row.reason },
            }, tx );

            return row;
        });

        return { unavailable, conflicts: await this.findConflicts( facilityId, unavailable.startAt, unavailable.endAt ) };
    }

    //* 수정 → { unavailable, conflicts }
    async update( user: Pick<Users, 'id'>, facilityId: number, id: number, body: UpdateUnavailableDto ) {
        const facility = await this.findFacilityOrThrow( facilityId );
        const before = await this.findOrThrow( facilityId, id );

        const startAt = body.startAt ?? before.startAt;
        const endAt = body.endAt ?? before.endAt;
        this.assertRange( startAt, endAt );

        const data = { startAt: body.startAt, endAt: body.endAt, reason: body.reason };

        const unavailable = await this.prisma.$transaction( async ( tx ) => {
            const row = await tx.facilityUnavailable.update({
                where: { id, deleted: false },
                data: { ...data, updatedId: user.id },
            });

            await this.audit.log({
                targetId: facilityId,
                actionType: AuditActionType.UPDATE,
                content: `사용 불가 기간 수정: ${facility.name}`,
                detail: { unavailableId: id, changes: diffChanges( before, data ) },
            }, tx );

            return row;
        });

        return { unavailable, conflicts: await this.findConflicts( facilityId, unavailable.startAt, unavailable.endAt ) };
    }

    //* 삭제 (soft delete)
    async delete( user: Pick<Users, 'id'>, facilityId: number, id: number ) {
        const facility = await this.findFacilityOrThrow( facilityId );
        const row = await this.findOrThrow( facilityId, id );

        await this.prisma.$transaction( async ( tx ) => {
            await tx.facilityUnavailable.update({
                where: { id, deleted: false },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id },
            });

            await this.audit.log({
                targetId: facilityId,
                actionType: AuditActionType.DELETE,
                content: `사용 불가 기간 삭제: ${facility.name} ${formatReservationTime( row.startAt, row.endAt )}`,
                detail: { unavailableId: id },
            }, tx );
        });

        return true;
    }

    //* 기간과 겹치는 유효한 예약 (경고용) - [시작, 종료) 겹침: 예약 시작 < 기간 종료 AND 예약 종료 > 기간 시작
    private findConflicts( facilityId: number, startAt: Date, endAt: Date ) {
        return this.prisma.facilityReservation.findMany({
            where: {
                facilityId,
                status: FacilityReservationStatus.RESERVED,
                deleted: false,
                startAt: { lt: endAt },
                endAt: { gt: startAt },
            },
            select: { id: true, startAt: true, endAt: true, title: true, user: { select: { id: true, name: true } } },
            orderBy: { startAt: 'asc' },
        });
    }

    private async findFacilityOrThrow( facilityId: number ) {
        const facility = await this.prisma.facility.findFirst({ where: { id: facilityId, deleted: false } });
        if ( !facility ) {
            throw new NotFoundException( '존재하지 않는 시설입니다.' );
        }
        return facility;
    }

    private async findOrThrow( facilityId: number, id: number ) {
        const row = await this.prisma.facilityUnavailable.findFirst({ where: { id, facilityId, deleted: false } });
        if ( !row ) {
            throw new NotFoundException( '존재하지 않는 사용 불가 기간입니다.' );
        }
        return row;
    }

    private assertRange( startAt: Date, endAt: Date ) {
        if ( endAt.getTime() <= startAt.getTime() ) {
            throw new BadRequestException( '종료 시각은 시작 시각보다 뒤여야 합니다.' );
        }
    }
}
