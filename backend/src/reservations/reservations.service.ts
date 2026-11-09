import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditActionType, AuditTargetType, FacilityReservation, FacilityReservationStatus, Prisma, UserRole, Users } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { batchChanges, diffChanges } from "src/common/util/audit-detail.util";
import { kstDateAt, kstDateString } from "src/common/util/date.util";
import { PaginatePage } from "src/common/util/pagination.util";
import { PrismaService } from "src/prisma/prisma.service";
import { SCHEDULE_MAX_DAYS } from "./const/reservation.const";
import { CreateRecurringReservationDto } from "./dto/create-recurring-reservation.dto";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { AdminReservationListQueryDto, MyReservationListQueryDto } from "./dto/reservation-list-query.dto";
import { ReservationIdsDto } from "./dto/reservation-ids.dto";
import { ScheduleQueryDto } from "./dto/schedule-query.dto";
import { UpdateReservationDto } from "./dto/update-reservation.dto";
import { ReservationNotifier } from "./reservation-notifier";
import { isReservationOverlapError } from "./util/overlap-error.util";
import { checkReservationTime, formatReservationTime, lastBookableDate, listRecurringDates, parseHm, ReservationRuleCode } from "./util/reservation-rules.util";

type Actor = Pick<Users, 'id' | 'role'>;
type Tx = Prisma.TransactionClient;

// 반복 예약에서 건너뛴 이유
export type RecurringSkipReason = 'RESERVED' | 'UNAVAILABLE' | Extract<ReservationRuleCode, 'NOT_OPERATING_DAY' | 'PAST'>;

const OVERLAP_MESSAGE = '같은 시간에 이미 다른 예약이 있습니다.';
const UNAVAILABLE_MESSAGE = '사용 불가 기간과 겹쳐 예약할 수 없습니다.';

// 목록·상세 응답에 함께 주는 정보
const reservationInclude = {
    facility: { select: { id: true, name: true, category: { select: { id: true, name: true } } } },
    user: { select: { id: true, name: true } },
} satisfies Prisma.FacilityReservationInclude;

//! 시설 예약 (features.md 6장, 2026-11-09 사용자 결정)
// - 범위는 [시작, 종료). 예약 시간 규칙(단위·운영 시간·요일·예약 가능 기간)은 시설의 분류가 정한다.
// - 겹침 방지는 이중: ① 트랜잭션 안에서 겹치는 예약·사용 불가 기간을 검사해 메시지를 만들고
//   ② 검사와 저장 사이에 끼어든 동시 요청은 DB exclusion constraint가 막는다 → 409로 바꿔 응답
// - 권한: 예약자 본인·관리자. 시작한 예약(지난 예약)은 본인 불가, 관리자는 삭제만.
// - 취소 = status CANCELLED(기록이 남고 그 시간은 다시 예약 가능), 삭제 = soft delete(목록에서 숨김)
// - 관리자가 남의 예약을 취소·삭제하면 커밋 후 예약자에게 알림 (ReservationNotifier)
@Injectable()
export class ReservationsService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        private readonly notifier: ReservationNotifier,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.FACILITY_RESERVATION );
    }

    //! 조회

    //* 시간표: 시설 하나 또는 분류 하나의 [from, to) 유효한 예약 + 사용 불가 기간
    // 예약 제목·예약자 이름은 모든 회원에게 공개한다. (2026-11-09 사용자 결정)
    async schedule( user: Actor, query: ScheduleQueryDto ) {
        if ( ( query.facilityId === undefined ) === ( query.categoryId === undefined ) ) {
            throw new BadRequestException( 'facilityId와 categoryId 중 하나만 보내야 합니다.' );
        }
        if ( query.to.getTime() <= query.from.getTime() ) {
            throw new BadRequestException( '조회 종료 시각은 시작 시각보다 뒤여야 합니다.' );
        }
        if ( query.to.getTime() - query.from.getTime() > SCHEDULE_MAX_DAYS * 24 * 60 * 60 * 1000 ) {
            throw new BadRequestException( `시간표는 한 번에 ${SCHEDULE_MAX_DAYS}일까지 조회할 수 있습니다.` );
        }

        const facilities = await this.prisma.facility.findMany({
            where: { id: query.facilityId, categoryId: query.categoryId, deleted: false, isActive: true, category: { deleted: false } },
            select: { id: true, name: true, location: true, capacity: true, categoryId: true },
            orderBy: [ { name: 'asc' }, { id: 'asc' } ],
        });
        if ( query.facilityId !== undefined && facilities.length === 0 ) {
            throw new NotFoundException( '존재하지 않거나 사용하지 않는 시설입니다.' );
        }

        const facilityIds = facilities.map( ( f ) => f.id );
        const overlap = { startAt: { lt: query.to }, endAt: { gt: query.from } };

        const [ reservations, unavailable ] = await Promise.all([
            this.prisma.facilityReservation.findMany({
                where: { facilityId: { in: facilityIds }, status: FacilityReservationStatus.RESERVED, deleted: false, ...overlap },
                select: { id: true, facilityId: true, startAt: true, endAt: true, title: true, user: { select: { id: true, name: true } } },
                orderBy: { startAt: 'asc' },
            }),
            this.prisma.facilityUnavailable.findMany({
                where: { facilityId: { in: facilityIds }, deleted: false, ...overlap },
                select: { id: true, facilityId: true, startAt: true, endAt: true, reason: true },
                orderBy: { startAt: 'asc' },
            }),
        ]);

        return {
            facilities,
            reservations: reservations.map( ( r ) => ({ ...r, isMine: r.user.id === user.id }) ),
            unavailable,
        };
    }

    //* 내 예약 (취소 포함, 삭제 제외)
    findMine( user: Actor, query: MyReservationListQueryDto ) {
        return this.paginate( query, { userId: user.id } );
    }

    //* 전체 예약 (관리자)
    findAllForAdmin( query: AdminReservationListQueryDto ) {
        return this.paginate( query, { facilityId: query.facilityId, userId: query.userId } );
    }

    //* 상세
    async findOne( id: number ) {
        const reservation = await this.prisma.facilityReservation.findFirst({ where: { id, deleted: false }, include: reservationInclude });
        if ( !reservation ) {
            throw new NotFoundException( '존재하지 않는 예약입니다.' );
        }
        return reservation;
    }

    //! 예약

    //* 단건 예약
    async create( user: Actor, body: CreateReservationDto ) {
        const facility = await this.findBookableFacility( body.facilityId );
        this.assertRule( checkReservationTime( body.startAt, body.endAt, facility.category, new Date() ) );

        return this.withOverlapGuard( () => this.prisma.$transaction( async ( tx ) => {
            await this.assertNoConflict( tx, facility.id, body.startAt, body.endAt );

            const reservation = await tx.facilityReservation.create({
                data: {
                    facilityId: facility.id,
                    userId: user.id,
                    startAt: body.startAt,
                    endAt: body.endAt,
                    title: body.title,
                    description: body.description,
                    createdId: user.id,
                    updatedId: user.id,
                },
                include: reservationInclude,
            });

            await this.audit.created( tx, reservation.id,
                `시설 예약: ${facility.name} ${formatReservationTime( reservation.startAt, reservation.endAt )}`,
                { facilityId: facility.id, startAt: reservation.startAt, endAt: reservation.endAt },
            );

            return reservation;
        }) );
    }

    //* 반복 예약 → { created, skipped }
    // - 기간 중 고른 요일마다 같은 시간대로 예약을 하나씩 만든다. (묶음 정보 없음 - 취소는 날짜별·일괄 취소)
    // - 건너뜀: 운영하지 않는 요일·이미 지난 시각(규칙 검사) / 이미 예약됨·사용 불가 기간(트랜잭션 안 조회)
    // - 시간대 자체가 규칙에 안 맞으면(운영 시간 밖·단위) 모든 날짜가 같으므로 요청 전체를 400으로 거부한다.
    // - 검사와 저장 사이에 다른 요청이 같은 시간을 잡으면 DB 제약으로 요청 전체가 409 (다시 시도하면 그 날짜는 건너뜀)
    async createRecurring( user: Actor, body: CreateRecurringReservationDto ) {
        const facility = await this.findBookableFacility( body.facilityId );
        const rules = facility.category;
        const now = new Date();

        const startMinute = parseHm( body.startTime );
        const endMinute = parseHm( body.endTime );
        if ( startMinute === null || endMinute === null ) {
            throw new BadRequestException( '시간은 00:00 ~ 24:00 사이의 HH:mm 형식이어야 합니다.' );
        }
        if ( body.endDate < body.startDate ) {
            throw new BadRequestException( '종료일은 시작일과 같거나 뒤여야 합니다.' );
        }
        if ( body.startDate < kstDateString( now ) ) {
            throw new BadRequestException( '시작일은 오늘 이후여야 합니다.' );
        }
        if ( body.endDate > lastBookableDate( rules, now ) ) {
            throw new BadRequestException( `오늘부터 ${rules.maxAdvanceDays}일 뒤(${lastBookableDate( rules, now )})까지만 예약할 수 있습니다.` );
        }

        const dates = listRecurringDates( body.startDate, body.endDate, body.weekdays );
        if ( dates.length === 0 ) {
            throw new BadRequestException( '기간 안에 고른 요일이 없습니다.' );
        }

        // 1) 규칙 검사: 요일·과거는 건너뛰고, 나머지 위반은 전체 거부
        const skipped: { date: string; reason: RecurringSkipReason }[] = [];
        const candidates: { date: string; startAt: Date; endAt: Date }[] = [];

        for ( const date of dates ) {
            const startAt = kstDateAt( date, startMinute );
            const endAt = kstDateAt( date, endMinute );
            const error = checkReservationTime( startAt, endAt, rules, now );

            if ( error?.code === 'NOT_OPERATING_DAY' || error?.code === 'PAST' ) {
                skipped.push({ date, reason: error.code });
            } else if ( error ) {
                this.assertRule( error );
            } else {
                candidates.push({ date, startAt, endAt });
            }
        }

        const created = await this.withOverlapGuard( () => this.prisma.$transaction( async ( tx ) => {
            if ( candidates.length === 0 ) return [];

            // 2) 기간 전체의 기존 예약·사용 불가 기간을 한 번에 읽어 날짜별로 메모리에서 비교한다. (날짜 수만큼 쿼리하지 않음)
            const range = { startAt: { lt: candidates[ candidates.length - 1 ].endAt }, endAt: { gt: candidates[0].startAt } };
            const [ reserved, unavailable ] = await Promise.all([
                tx.facilityReservation.findMany({
                    where: { facilityId: facility.id, status: FacilityReservationStatus.RESERVED, deleted: false, ...range },
                    select: { startAt: true, endAt: true },
                }),
                tx.facilityUnavailable.findMany({
                    where: { facilityId: facility.id, deleted: false, ...range },
                    select: { startAt: true, endAt: true },
                }),
            ]);

            const overlaps = ( c: { startAt: Date; endAt: Date } ) => ( p: { startAt: Date; endAt: Date } ) => p.startAt < c.endAt && p.endAt > c.startAt;

            const toCreate = candidates.filter( ( c ) => {
                if ( reserved.some( overlaps( c ) ) ) {
                    skipped.push({ date: c.date, reason: 'RESERVED' });
                    return false;
                }
                if ( unavailable.some( overlaps( c ) ) ) {
                    skipped.push({ date: c.date, reason: 'UNAVAILABLE' });
                    return false;
                }
                return true;
            });

            if ( toCreate.length === 0 ) return [];

            const rows = await tx.facilityReservation.createManyAndReturn({
                data: toCreate.map( ( c ) => ({
                    facilityId: facility.id,
                    userId: user.id,
                    startAt: c.startAt,
                    endAt: c.endAt,
                    title: body.title,
                    description: body.description,
                    createdId: user.id,
                    updatedId: user.id,
                }) ),
            });

            await this.audit.logBatch({
                targetIds: rows.map( ( r ) => r.id ),
                actionType: AuditActionType.CREATE,
                content: `시설 반복 예약: ${facility.name} ${body.startDate}~${body.endDate} ${body.startTime}~${body.endTime} (${rows.length}건)`,
                extra: { facilityId: facility.id, weekdays: body.weekdays, skipped },
            }, tx );

            return rows;
        }) );

        skipped.sort( ( a, b ) => a.date.localeCompare( b.date ) );

        return { created, skipped };
    }

    //* 예약 수정 (시간·제목·설명, 시설은 바꿀 수 없음) - 본인·관리자, 시작 전만
    async update( user: Actor, id: number, body: UpdateReservationDto ) {
        const before = await this.findOne( id );
        this.assertCanChange( user, before, '수정' );

        const startAt = body.startAt ?? before.startAt;
        const endAt = body.endAt ?? before.endAt;
        const timeChanged = startAt.getTime() !== before.startAt.getTime() || endAt.getTime() !== before.endAt.getTime();

        // 시간을 바꿀 때만 규칙을 다시 본다. (분류 규칙이 바뀐 뒤에도 제목만 고치는 건 막지 않기 위해)
        if ( timeChanged ) {
            const facility = await this.findBookableFacility( before.facilityId );
            this.assertRule( checkReservationTime( startAt, endAt, facility.category, new Date() ) );
        }

        const data = { startAt: body.startAt, endAt: body.endAt, title: body.title, description: body.description };

        const updated = await this.withOverlapGuard( () => this.prisma.$transaction( async ( tx ) => {
            if ( timeChanged ) {
                await this.assertNoConflict( tx, before.facilityId, startAt, endAt, id );
            }

            // 검사한 상태(유효·시작 전)일 때만 바꾼다. (그 사이 취소·삭제되면 0건 → 409)
            const { count } = await tx.facilityReservation.updateMany({
                where: { id, deleted: false, status: FacilityReservationStatus.RESERVED, startAt: { gt: new Date() } },
                data: { ...data, updatedId: user.id },
            });
            if ( count === 0 ) {
                throw new ConflictException( '예약 상태가 바뀌었습니다. 새로고침 후 다시 시도하세요.' );
            }

            await this.audit.updated( tx, id,
                `시설 예약 수정: ${before.facility.name} ${formatReservationTime( startAt, endAt )}`,
                diffChanges( before, data ),
            );

            return tx.facilityReservation.findUniqueOrThrow({ where: { id }, include: reservationInclude });
        }) );

        // 관리자가 남의 예약 시간을 바꿨으면 커밋 후 예약자에게 알림 (2026-11-09 사용자 결정)
        if ( timeChanged && this.isAdmin( user ) ) {
            await this.notifier.timeChangedByAdmin( before, updated, user.id );
        }

        return updated;
    }

    //* 예약 취소 - 본인·관리자, 시작 전만
    async cancel( user: Actor, id: number ) {
        return this.cancelMany( user, [ id ] );
    }

    //* 일괄 취소 (반복 예약 여러 건 등) - 한 건이라도 취소할 수 없으면 전체 실패 (기존 일괄 처리 규칙)
    async bulkCancel( user: Actor, body: ReservationIdsDto ) {
        return this.cancelMany( user, body.ids );
    }

    //* 예약 삭제 (soft delete) - 본인은 시작 전만, 관리자는 언제나
    async delete( user: Actor, id: number ) {
        const reservation = await this.findOne( id );
        const isAdmin = this.isAdmin( user );

        if ( !isAdmin && reservation.userId !== user.id ) {
            throw new ForbiddenException( '본인 예약만 삭제할 수 있습니다.' );
        }
        if ( !isAdmin && reservation.startAt <= new Date() ) {
            throw new ForbiddenException( '시작된 예약은 삭제할 수 없습니다.' );
        }

        await this.prisma.$transaction( async ( tx ) => {
            await tx.facilityReservation.update({
                where: { id, deleted: false },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id },
            });

            await this.audit.deleted( tx, id,
                `시설 예약 삭제: ${reservation.facility.name} ${formatReservationTime( reservation.startAt, reservation.endAt )}`,
                { userId: reservation.userId, status: reservation.status },
            );
        });

        if ( isAdmin ) {
            await this.notifier.deletedByAdmin( [ reservation ], user.id );
        }

        return true;
    }

    //! 내부

    private isAdmin( user: Actor ) {
        return user.role === UserRole.ADMIN;
    }

    //* 수정·취소 공통 권한: 본인·관리자, 유효한 예약, 시작 전 (관리자도 시작 후에는 삭제만)
    private assertCanChange( user: Actor, reservation: Pick<FacilityReservation, 'userId' | 'status' | 'startAt'>, action: string ) {
        if ( !this.isAdmin( user ) && reservation.userId !== user.id ) {
            throw new ForbiddenException( `본인 예약만 ${action}할 수 있습니다.` );
        }
        if ( reservation.status === FacilityReservationStatus.CANCELLED ) {
            throw new BadRequestException( `취소된 예약은 ${action}할 수 없습니다.` );
        }
        if ( reservation.startAt <= new Date() ) {
            throw new ForbiddenException( `시작된 예약은 ${action}할 수 없습니다.` );
        }
    }

    private async cancelMany( user: Actor, ids: number[] ) {
        const reservations = await this.prisma.facilityReservation.findMany({
            where: { id: { in: ids }, deleted: false },
            include: reservationInclude,
        });
        if ( reservations.length !== ids.length ) {
            throw new NotFoundException( '존재하지 않는 예약이 있습니다.' );
        }
        for ( const r of reservations ) {
            this.assertCanChange( user, r, '취소' );
        }

        const isAdmin = this.isAdmin( user );

        await this.prisma.$transaction( async ( tx ) => {
            // 검사 조건을 WHERE에 다시 걸고, 바뀐 건수가 요청 수와 다르면 전체 롤백 (검사와 수정 사이 경쟁 상태 대비)
            const { count } = await tx.facilityReservation.updateMany({
                where: {
                    id: { in: ids },
                    deleted: false,
                    status: FacilityReservationStatus.RESERVED,
                    startAt: { gt: new Date() },
                    userId: isAdmin ? undefined : user.id,
                },
                data: { status: FacilityReservationStatus.CANCELLED, updatedId: user.id },
            });
            if ( count !== ids.length ) {
                throw new ConflictException( '예약 상태가 바뀌었습니다. 새로고침 후 다시 시도하세요.' );
            }

            if ( reservations.length === 1 ) {
                const r = reservations[0];
                await this.audit.log({
                    targetId: r.id,
                    actionType: AuditActionType.STATUS_CHANGE,
                    content: `시설 예약 취소: ${r.facility.name} ${formatReservationTime( r.startAt, r.endAt )}`,
                    detail: { changes: { status: { before: r.status, after: FacilityReservationStatus.CANCELLED } }, userId: r.userId },
                }, tx );
            } else {
                await this.audit.logBatch({
                    targetIds: ids,
                    actionType: AuditActionType.STATUS_CHANGE,
                    content: `시설 예약 일괄 취소 (${ids.length}건)`,
                    changes: batchChanges( reservations, 'status', FacilityReservationStatus.CANCELLED ),
                }, tx );
            }
        });

        if ( isAdmin ) {
            await this.notifier.cancelledByAdmin( reservations, user.id );
        }

        return true;
    }

    //* 예약할 수 있는 시설 + 분류 규칙 (없음 404, 사용 안 함 400)
    private async findBookableFacility( facilityId: number ) {
        const facility = await this.prisma.facility.findFirst({
            where: { id: facilityId, deleted: false, category: { deleted: false } },
            include: { category: true },
        });
        if ( !facility ) {
            throw new NotFoundException( '존재하지 않는 시설입니다.' );
        }
        if ( !facility.isActive ) {
            throw new BadRequestException( '사용하지 않는 시설은 예약할 수 없습니다.' );
        }
        return facility;
    }

    //* 트랜잭션 안의 겹침 검사 (사용자에게 보여 줄 메시지용, 동시 요청은 DB 제약이 최종 방어)
    private async assertNoConflict( tx: Tx, facilityId: number, startAt: Date, endAt: Date, exceptId?: number ) {
        const overlap = { startAt: { lt: endAt }, endAt: { gt: startAt } };

        const reserved = await tx.facilityReservation.findFirst({
            where: { facilityId, status: FacilityReservationStatus.RESERVED, deleted: false, id: exceptId ? { not: exceptId } : undefined, ...overlap },
            select: { id: true },
        });
        if ( reserved ) {
            throw new ConflictException( OVERLAP_MESSAGE );
        }

        const unavailable = await tx.facilityUnavailable.findFirst({
            where: { facilityId, deleted: false, ...overlap },
            select: { id: true },
        });
        if ( unavailable ) {
            throw new ConflictException( UNAVAILABLE_MESSAGE );
        }
    }

    //* DB 겹침 제약 위반(동시 요청) → 409
    private async withOverlapGuard<T>( fn: () => Promise<T> ): Promise<T> {
        try {
            return await fn();
        } catch ( e ) {
            if ( isReservationOverlapError( e ) ) {
                throw new ConflictException( OVERLAP_MESSAGE );
            }
            throw e;
        }
    }

    private assertRule( error: { message: string } | null ) {
        if ( error ) {
            throw new BadRequestException( error.message );
        }
    }

    private paginate( query: MyReservationListQueryDto, filter: { userId?: number; facilityId?: number } ) {
        const where: Prisma.FacilityReservationWhereInput = {
            ...filter,
            deleted: false,
            status: query.status,
            startAt: query.from || query.to ? { gte: query.from, lt: query.to } : undefined,
        };

        return PaginatePage( query,
            ( page ) => this.prisma.facilityReservation.findMany({
                where,
                include: reservationInclude,
                orderBy: [ { startAt: query.order }, { id: query.order } ],
                ...page,
            }),
            () => this.prisma.facilityReservation.count({ where }),
        );
    }
}
