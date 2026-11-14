import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ApprovalStatus, AuditActionType, AuditTargetType, LeaveType, Prisma, UserRole, UserStatus } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { diffChanges } from "src/common/util/audit-detail.util";
import { kstDateString } from "src/common/util/date.util";
import { PaginatePage } from "src/common/util/pagination.util";
import { PrismaService } from "src/prisma/prisma.service";
import { AdjustLeaveGrantDto, LeaveGrantListQueryDto } from "./dto/leave.dto";
import { calcBaseQuarters, daysToQuarters, quartersToDays, recalcYears } from "./util/leave-grant.calc";

type Tx = Prisma.TransactionClient;

const IN_PROGRESS: ApprovalStatus[] = [ ApprovalStatus.REQUESTED, ApprovalStatus.IN_PROGRESS ];

//! 연차 부여 (docs/design/leave_calculate_manual.md, 2026-11-10 · 11-12 사용자 결정)
// - LeaveGrant(회원, 연도) = baseDays(규칙 계산, 배치만 씀) + adjustDays(관리자 ±). 둘을 나눠 재계산이 조정을 지우지 않는다.
// - 사용·진행 중은 저장하지 않고 LeaveRequest(연차) 합계로 계산한다. 잔여 = 부여 − 사용 − 진행 중
// - 배치·재계산·조정은 올해 행(12월에는 다음 해 행도)만 바꾼다. 지난 연도 행은 연차수당 근거로 그대로 남는다.
@Injectable()
export class LeaveGrantsService {

    private readonly logger = new Logger( LeaveGrantsService.name );
    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.LEAVE );
    }

    //! 부여 재계산

    //* 매월 1일 00:00 (KST) - 1년 미만 월 단위 연차가 매달 늘고, 연도 중 입사자는 행이 없으므로 1/1 한 번으로는 부족하다.
    // 실행이 한 번 빠져도 다음 실행에서 맞춰진다(멱등). 휴가 옵션이 꺼져 있으면 모듈이 없어 돌지 않는다.
    @Cron( '0 0 0 1 * *', { name: 'leave-grant-monthly', timeZone: 'Asia/Seoul' } )
    async monthlyRecalculate(){
        try {
            const result = await this.recalculate( null );
            this.logger.log( `연차 재계산 완료: ${result.years.map( ( y ) => `${y.year}년 ${y.count}명` ).join( ', ' )} (기준일 ${result.asOf})` );
        } catch ( error ) {
            this.logger.error( '연차 재계산 실패', error instanceof Error ? error.stack : error );
        }
    }

    //* 올해(12월이면 다음 해도) baseDays 재계산 (배치·관리자 "지금 재계산" 공용) - adjustDays는 건드리지 않는다
    // 대상: 삭제·퇴사가 아닌 USER/ADMIN 중 입사일이 있는 회원 (휴직 포함, 2026-11-12 사용자 결정)
    // 12월에 만든 다음 해 행은 1/1 배치가 같은 행을 다시 계산한다(값이 같고, 그사이 넣은 조정값은 유지).
    async recalculate( actorId: number | null, asOf = kstDateString( new Date() ) ){
        const years = recalcYears( asOf );
        const users = await this.prisma.users.findMany({
            where: {
                deleted: false,
                status: { in: [ UserStatus.ACTIVE, UserStatus.INACTIVE ] },
                role: { in: [ UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN ] },
                joinAt: { not: null },
            },
            select: { id: true, joinAt: true, leaveSetting: { select: { permanentDays: true } } },
        });

        // 계산값 + 그해에 적용할 영구 조정값(입사한 해는 0)을 함께 쓴다. 매년 조정값(adjustDays)은 건드리지 않는다.
        const rows = years.flatMap( ( year ) => users.flatMap( ( u ) => {
            const joinAt = u.joinAt!.toISOString().slice( 0, 10 );
            const quarters = calcBaseQuarters( joinAt, year, asOf );
            if ( quarters === null ) return [];
            const permanent = permanentFor( joinAt, year, daysToQuarters( u.leaveSetting?.permanentDays ) );
            return [ { userId: u.id, year, baseDays: quartersToDays( quarters ), permanentDays: quartersToDays( permanent ) } ];
        }) );
        const counts = years.map( ( year ) => ({ year, count: rows.filter( ( r ) => r.year === year ).length }) );
        const summaryText = counts.map( ( c ) => `${c.year}년 ${c.count}명` ).join( ', ' );

        await this.prisma.$transaction( async ( tx ) => {
            for ( const row of rows ) {
                await tx.leaveGrant.upsert({
                    where: { userId_year: { userId: row.userId, year: row.year } },
                    create: { userId: row.userId, year: row.year, baseDays: row.baseDays, permanentDays: row.permanentDays },
                    update: { baseDays: row.baseDays, permanentDays: row.permanentDays },
                });
            }
            await this.audit.log({
                actionType: AuditActionType.UPDATE,
                content: `연차 재계산: ${summaryText} (기준일 ${asOf}${actorId === null ? ', 월 배치' : ''})`,
                detail: { asOf, counts },
                actorId,
            }, tx );
        }, { timeout: 60_000 });

        // year·count = 올해, years = 계산한 연도별 인원 (12월이면 다음 해 포함)
        return { year: years[0], count: counts[0].count, asOf, years: counts };
    }

    //! 관리자 조정

    //* 조정 저장 (2026-11-12 사용자 결정) - 한 창에서 두 가지를 함께 저장한다
    // - 매년 조정값(adjustDays): 그 연도 행에만 (올해, 또는 12월에 미리 만든 다음 해). 새해 행은 0으로 시작
    // - 영구 조정값(permanentDays): 회원 설정에 저장하고 올해·(있으면) 내년 행에 바로 반영, 이후 재계산이 매년 복사
    //   입사한 해 행에는 적용하지 않는다(월 단위 연차는 매년 조정값으로만). 지난 연도 행은 바꾸지 않는다.
    // - 부여 합계(계산값 + 영구 + 매년) ≥ 0만 막는다(25일 한도 없음). 조정 후 잔여가 음수가 되는 것은 허용.
    async adjust( userId: number, body: AdjustLeaveGrantDto ){
        const adjust = toQuarters( body.adjustDays, '매년 조정값' );
        const permanent = toQuarters( body.permanentDays, '영구 조정값' );
        body.adjustReason = body.adjustReason?.trim() || null;
        body.permanentReason = body.permanentReason?.trim() || null;
        if ( adjust !== 0 && !body.adjustReason ) throw new BadRequestException( '매년 조정 사유를 입력하세요.' );
        if ( permanent !== 0 && !body.permanentReason ) throw new BadRequestException( '영구 조정 사유를 입력하세요.' );

        const thisYear = this.thisYear();
        const year = body.year ?? thisYear;
        if ( year !== thisYear && year !== thisYear + 1 ) {
            throw new BadRequestException( '올해와 다음 해 연차만 조정할 수 있습니다. 지난 연도 기록은 바꾸지 않습니다.' );
        }
        const grant = await this.prisma.leaveGrant.findUnique({ where: { userId_year: { userId, year } } });
        if ( !grant ) {
            throw new NotFoundException( year === thisYear
                ? `${year}년 연차 부여 행이 없습니다. 입사일을 확인하고 재계산한 뒤 조정하세요.`
                : `${year}년 연차는 12월 재계산 때 만들어집니다. 그 뒤에 조정하세요.` );
        }

        const user = await this.prisma.users.findUniqueOrThrow({
            where: { id: userId },
            select: { joinAt: true, leaveSetting: true },
        });
        const joinAt = user.joinAt?.toISOString().slice( 0, 10 ) ?? null;
        const before = user.leaveSetting;

        // 영구값을 반영할 행: 올해부터 (지난 연도 제외) - 편집 중인 연도 행 포함
        const targets = await this.prisma.leaveGrant.findMany({ where: { userId, year: { gte: thisYear } } });
        for ( const row of targets ) {
            const rowPermanent = joinAt ? permanentFor( joinAt, row.year, permanent ) : 0;
            const rowAdjust = row.year === year ? adjust : daysToQuarters( row.adjustDays );
            if ( daysToQuarters( row.baseDays ) + rowPermanent + rowAdjust < 0 ) {
                throw new BadRequestException( `${row.year}년 부여 합계(계산값 + 영구 조정 + 매년 조정)가 0보다 작아질 수 없습니다.` );
            }
        }

        await this.prisma.$transaction( async ( tx ) => {
            await tx.leaveUserSetting.upsert({
                where: { userId },
                create: { userId, permanentDays: quartersToDays( permanent ), permanentReason: body.permanentReason ?? null },
                update: { permanentDays: quartersToDays( permanent ), permanentReason: body.permanentReason ?? null },
            });
            for ( const row of targets ) {
                await tx.leaveGrant.update({
                    where: { id: row.id },
                    data: {
                        permanentDays: quartersToDays( joinAt ? permanentFor( joinAt, row.year, permanent ) : 0 ),
                        ...( row.year === year && { adjustDays: quartersToDays( adjust ), adjustReason: body.adjustReason ?? null } ),
                    },
                });
            }
            await this.audit.updated( tx, grant.id, `연차 조정: 회원 ${userId}, ${year}년`, diffChanges(
                {
                    permanentDays: daysToQuarters( before?.permanentDays ) / 4, permanentReason: before?.permanentReason ?? null,
                    adjustDays: daysToQuarters( grant.adjustDays ) / 4, adjustReason: grant.adjustReason,
                },
                {
                    permanentDays: permanent / 4, permanentReason: body.permanentReason ?? null,
                    adjustDays: adjust / 4, adjustReason: body.adjustReason ?? null,
                },
            ), { userId, year } );
        });

        return this.summary( userId, year );
    }

    //! 조회

    //* 관리자 연차 현황 (그 연도 부여 행이 있는 회원, 이름 순)
    async findList( query: LeaveGrantListQueryDto ){
        const year = query.year ?? this.thisYear();
        const search = query.search?.trim();
        const where: Prisma.LeaveGrantWhereInput = {
            year,
            user: {
                deleted: false,
                ...( search && { OR: [ { name: { contains: search } }, { empNo: { contains: search } } ] } ),
            },
        };

        const result = await PaginatePage( query,
            ( page ) => this.prisma.leaveGrant.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true, empNo: true, name: true, joinAt: true, status: true,
                            leaveSetting: { select: { permanentDays: true, permanentReason: true } },
                        },
                    },
                },
                orderBy: [ { user: { name: 'asc' } }, { id: 'asc' } ],
                ...page,
            }),
            () => this.prisma.leaveGrant.count({ where }),
        );

        const usage = await this.usageByUser( result.data.map( ( g ) => g.userId ), year );
        return {
            ...result,
            data: result.data.map( ( { user: { leaveSetting, ...user }, ...g } ) => ({
                user: { ...user, joinAt: user.joinAt?.toISOString().slice( 0, 10 ) ?? null },
                ...this.toSummary( year, g, usage.get( g.userId ) ),
                // 회원 설정의 영구 조정값 (조정 창 기본값). 그해 행에 적용된 값은 permanentDays
                permanentSetting: { days: daysToQuarters( leaveSetting?.permanentDays ) / 4, reason: leaveSetting?.permanentReason ?? null },
            }) ),
        };
    }

    //* 한 회원의 연차 현황 (행이 없으면 부여 0)
    async summary( userId: number, year: number ){
        const grant = await this.prisma.leaveGrant.findUnique({ where: { userId_year: { userId, year } } });
        const usage = await this.usageByUser( [ userId ], year );
        return this.toSummary( year, grant, usage.get( userId ) );
    }

    //* 부여 합계 (quarter, 행이 없으면 0) - 상신·승인 검사용 (결재 tx 안)
    async grantedQuarters( tx: Tx, userId: number, year: number ){
        const grant = await tx.leaveGrant.findUnique({ where: { userId_year: { userId, year } } });
        return grant ? daysToQuarters( grant.baseDays ) + daysToQuarters( grant.permanentDays ) + daysToQuarters( grant.adjustDays ) : 0;
    }

    //! 내부

    // 회원별 사용(승인)·진행 중 연차 합계 (quarter)
    private async usageByUser( userIds: number[], year: number ){
        const usage = new Map<number, { used: number; inProgress: number }>();
        if ( userIds.length === 0 ) return usage;

        const sum = ( statuses: ApprovalStatus[] ) => this.prisma.leaveRequest.groupBy({
            by: [ 'userId' ],
            _sum: { days: true },
            where: {
                userId: { in: userIds },
                type: LeaveType.ANNUAL,
                startDate: { gte: new Date( `${year}-01-01T00:00:00Z` ), lte: new Date( `${year}-12-31T00:00:00Z` ) },
                approvalDocument: { status: { in: statuses }, deleted: false },
            },
        });
        const [ used, inProgress ] = await Promise.all([ sum( [ ApprovalStatus.APPROVED ] ), sum( IN_PROGRESS ) ]);

        for ( const id of userIds ) usage.set( id, { used: 0, inProgress: 0 } );
        for ( const r of used ) usage.get( r.userId )!.used = daysToQuarters( r._sum.days );
        for ( const r of inProgress ) usage.get( r.userId )!.inProgress = daysToQuarters( r._sum.days );
        return usage;
    }

    private toSummary(
        year: number,
        grant: { baseDays: Prisma.Decimal; permanentDays: Prisma.Decimal; adjustDays: Prisma.Decimal; adjustReason: string | null } | null,
        usage = { used: 0, inProgress: 0 },
    ){
        const base = daysToQuarters( grant?.baseDays );
        const permanent = daysToQuarters( grant?.permanentDays );
        const adjust = daysToQuarters( grant?.adjustDays );
        const granted = base + permanent + adjust; // 25일 한도 없음 (2026-11-12 사용자 결정)
        return {
            year,
            hasGrant: grant !== null,
            baseDays: base / 4,
            permanentDays: permanent / 4, // 그해에 적용된 영구 조정값
            adjustDays: adjust / 4,        // 매년 조정값
            adjustReason: grant?.adjustReason ?? null,
            grantedDays: granted / 4,
            usedDays: usage.used / 4,
            inProgressDays: usage.inProgress / 4,
            remainingDays: ( granted - usage.used - usage.inProgress ) / 4, // 음수 가능 (관리자 조정으로 줄인 경우)
        };
    }

    private thisYear(){
        return Number( kstDateString( new Date() ).slice( 0, 4 ) );
    }
}

//* 그해 행에 적용할 영구 조정값 (quarter) - 입사한 해는 0 (월 단위 연차는 매년 조정값으로만, 2026-11-12 사용자 결정)
function permanentFor( joinAt: string, year: number, permanent: number ){
    return year === Number( joinAt.slice( 0, 4 ) ) ? 0 : permanent;
}

//* 입력 일수 → quarter (0.25 단위가 아니면 400)
function toQuarters( days: number, label: string ){
    const quarters = Math.round( days * 4 );
    if ( quarters / 4 !== days ) {
        throw new BadRequestException( `${label}은 0.25일 단위로 입력하세요.` );
    }
    return quarters;
}
