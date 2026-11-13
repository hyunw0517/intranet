import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditTargetType, FacilityReservationStatus, Prisma, Users } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { diffChanges } from "src/common/util/audit-detail.util";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateFacilityDto } from "./dto/create-facility.dto";
import { UpdateFacilityDto } from "./dto/update-facility.dto";
import { FacilityListQueryDto } from "./dto/facility-list-query.dto";

// 목록·상세 응답에 함께 주는 분류 정보 (예약 화면이 규칙을 알아야 입력을 제한할 수 있다)
const categorySelect = {
    id: true, name: true, sortOrder: true,
    slotMinutes: true, openMinute: true, closeMinute: true, operatingDays: true, maxAdvanceDays: true,
} satisfies Prisma.FacilityCategorySelect;

const facilityOrder: Prisma.FacilityOrderByWithRelationInput[] = [ { category: { sortOrder: 'asc' } }, { name: 'asc' }, { id: 'asc' } ];

//! 시설 (회의실·차량·장비 …) - 관리는 관리자, 목록은 모든 회원
@Injectable()
export class FacilitiesService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.FACILITY );
    }

    //* 예약 가능한 시설 목록 (사용 중인 것만)
    findActive( query: FacilityListQueryDto ) {
        return this.prisma.facility.findMany({
            where: { deleted: false, isActive: true, categoryId: query.categoryId, category: { deleted: false } },
            include: { category: { select: categorySelect } },
            orderBy: facilityOrder,
        });
    }

    //* 관리자 목록 (사용 안 함 포함)
    findAllForAdmin( query: FacilityListQueryDto ) {
        return this.prisma.facility.findMany({
            where: { deleted: false, categoryId: query.categoryId, category: { deleted: false } },
            include: { category: { select: categorySelect } },
            orderBy: facilityOrder,
        });
    }

    //* 상세 (사용 안 함인 시설도 볼 수 있다 - 기존 예약 화면에서 들어올 수 있으므로)
    async findOne( id: number ) {
        const facility = await this.prisma.facility.findFirst({
            where: { id, deleted: false },
            include: { category: { select: categorySelect } },
        });
        if ( !facility ) {
            throw new NotFoundException( '존재하지 않는 시설입니다.' );
        }
        return facility;
    }

    //* 시설 생성
    async create( user: Pick<Users, 'id'>, body: CreateFacilityDto ) {
        await this.assertCategoryExists( body.categoryId );
        await this.assertNameAvailable( body.categoryId, body.name );

        return this.prisma.$transaction( async ( tx ) => {
            const facility = await tx.facility.create({
                data: {
                    categoryId: body.categoryId,
                    name: body.name,
                    location: body.location,
                    capacity: body.capacity,
                    description: body.description,
                    isActive: body.isActive,
                    createdId: user.id,
                    updatedId: user.id,
                },
            });

            await this.audit.created( tx, facility.id, `시설 생성: ${facility.name}`, { categoryId: facility.categoryId } );

            return facility;
        });
    }

    //* 시설 수정 - 사용 안 함(isActive: false)으로 바꾸면 새 예약만 막고 기존 예약은 유지한다. (2026-11-09 사용자 결정)
    async update( user: Pick<Users, 'id'>, id: number, body: UpdateFacilityDto ) {
        const before = await this.findOne( id );

        const categoryId = body.categoryId ?? before.categoryId;
        if ( body.categoryId !== undefined && body.categoryId !== before.categoryId ) {
            await this.assertCategoryExists( body.categoryId );
        }
        if ( body.name !== undefined || categoryId !== before.categoryId ) {
            await this.assertNameAvailable( categoryId, body.name ?? before.name, id );
        }

        const data = {
            categoryId: body.categoryId,
            name: body.name,
            location: body.location,
            capacity: body.capacity,
            description: body.description,
            isActive: body.isActive,
        };

        return this.prisma.$transaction( async ( tx ) => {
            const facility = await tx.facility.update({
                where: { id, deleted: false },
                data: { ...data, updatedId: user.id },
            });

            await this.audit.updated( tx, id, `시설 수정: ${facility.name}`, diffChanges( before, data ) );

            return facility;
        });
    }

    //* 시설 삭제 - 앞으로의 예약(아직 끝나지 않은 유효한 예약)이 있으면 409 (2026-11-09 사용자 결정)
    async delete( user: Pick<Users, 'id'>, id: number ) {
        const facility = await this.findOne( id );

        const upcoming = await this.prisma.facilityReservation.count({
            where: { facilityId: id, status: FacilityReservationStatus.RESERVED, deleted: false, endAt: { gt: new Date() } },
        });
        if ( upcoming > 0 ) {
            throw new ConflictException( `앞으로의 예약이 ${upcoming}건 있어 삭제할 수 없습니다. 사용 안 함으로 바꾸거나 예약을 정리한 뒤 삭제하세요.` );
        }

        await this.prisma.$transaction( async ( tx ) => {
            await tx.facility.update({
                where: { id, deleted: false },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id },
            });

            await this.audit.deleted( tx, id, `시설 삭제: ${facility.name}` );
        });

        return true;
    }

    private async assertCategoryExists( categoryId: number ) {
        const category = await this.prisma.facilityCategory.findFirst({ where: { id: categoryId, deleted: false } });
        if ( !category ) {
            throw new BadRequestException( '존재하지 않는 시설 분류입니다.' );
        }
    }

    // 같은 분류 안에서만 이름이 겹치지 않게 한다. (분류가 다르면 같은 이름 허용: "1호" 회의실 / "1호" 차량)
    private async assertNameAvailable( categoryId: number, name: string, exceptId?: number ) {
        const exists = await this.prisma.facility.findFirst({
            where: { categoryId, name, deleted: false, id: exceptId ? { not: exceptId } : undefined },
        });
        if ( exists ) {
            throw new BadRequestException( '같은 분류에 같은 이름의 시설이 있습니다.' );
        }
    }
}
