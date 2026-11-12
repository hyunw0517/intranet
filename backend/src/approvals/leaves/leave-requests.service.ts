import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalDocumentType, ApprovalStatus, LeaveRequest, LeaveType, Prisma, Users } from "src/generated/prisma/client";
import { kstDateString } from "src/common/util/date.util";
import { PrismaService } from "src/prisma/prisma.service";
import { ApprovalDocumentsService } from "../approval-documents.service";
import { CreateLeaveDto, UpdateLeaveDto } from "./dto/leave.dto";
import { LeaveGrantsService } from "./leave-grants.service";
import { daysInclusive, daysToQuarters, quartersToDays } from "./util/leave-grant.calc";
import { buildLeavePeriod, findOverbookedDate, findTimeConflict, groupLeavesByDate, LEAVE_TYPE_LABEL, LeavePeriod, leaveTitle, periodLabel } from "./util/leave-request.util";

type Actor = Pick<Users, 'id' | 'role'>;
type Tx = Prisma.TransactionClient;

// 하루 합계·잔여 계산에 넣는 휴가: 결재 진행 중 + 승인 (임시저장·반려·회수·삭제는 제외)
const COUNTED_STATUSES: ApprovalStatus[] = [ ApprovalStatus.REQUESTED, ApprovalStatus.IN_PROGRESS, ApprovalStatus.APPROVED ];

// 캘린더 조회 최대 기간 (달력 한 화면 = 6주 42일, 여유를 둔다)
const CALENDAR_MAX_DAYS = 62;

//! 휴가 신청 (결재의 옵션 'leaves', features.md 7.4 "휴가 신청 규칙", 2026-11-12 사용자 결정)
// - 신청 = 결재 문서(LEAVE) + LeaveRequest 1:1. 둘은 같은 트랜잭션에서 만든다(결재 서비스가 tx를 넘겨 준다).
// - 상신·회수·승인·반려·삭제·다시 기안은 결재 문서 API를 그대로 쓰고, 휴가 규칙은 처리기(LeaveDocumentHandler)가 같은 tx에서 검사한다.
// - LeaveRequest에는 상태가 없다. 진행 중·승인 여부는 결재 문서 상태로 판단한다.
@Injectable()
export class LeaveRequestsService {

    constructor(
        private readonly prisma: PrismaService,
        private readonly documents: ApprovalDocumentsService,
        private readonly grants: LeaveGrantsService,
    ){}

    //! 신청 (임시저장)

    async create( user: Actor, body: CreateLeaveDto ){
        const period = this.toPeriod( body );

        const id = await this.documents.createWithData( user, {
            documentType: ApprovalDocumentType.LEAVE,
            title: leaveTitle( period ),
            steps: body.steps,
            approvalLineTemplateId: body.approvalLineTemplateId,
            attachmentIds: body.attachmentIds,
        }, '휴가 신청 임시저장', ( tx, documentId ) => tx.leaveRequest.create({
            data: { ...this.toColumns( period ), userId: user.id, approvalDocumentId: documentId, reason: body.reason ?? null },
        }) );

        return this.findByDocument( user, id );
    }

    async update( user: Actor, documentId: number, body: UpdateLeaveDto ){
        await this.documents.assertVisible( user, documentId ); // 남의 문서면 입력 검사보다 먼저 404 (기안자 확인은 updateWithData)
        const leave = await this.findLeave( documentId );
        const saved = this.fromRow( leave );

        // 유형(종일 ↔ 반차)을 바꾸면 그 유형에 맞지 않는 저장값(종료일·시각)은 버린다
        const unitChanged = body.unit !== undefined && body.unit !== saved.unit;
        const period = this.toPeriod({
            type: body.type ?? saved.type,
            unit: body.unit ?? saved.unit,
            startDate: body.startDate ?? saved.startDate,
            endDate: body.endDate !== undefined ? body.endDate : ( unitChanged ? null : saved.endDate ),
            startTime: body.startTime !== undefined ? body.startTime : ( unitChanged ? null : saved.startTime ),
        });

        await this.documents.updateWithData( user, documentId, ApprovalDocumentType.LEAVE, {
            title: leaveTitle( period ),
            steps: body.steps,
            approvalLineTemplateId: body.approvalLineTemplateId,
            attachmentIds: body.attachmentIds,
        }, ( tx ) => tx.leaveRequest.update({
            where: { id: leave.id },
            data: { ...this.toColumns( period ), ...( body.reason !== undefined && { reason: body.reason } ) },
        }) );

        return this.findByDocument( user, documentId );
    }

    //! 조회

    //* 결재 문서에 딸린 휴가 정보 (문서 열람 권한과 같다: 기안자·결재라인·관리자)
    async findByDocument( user: Actor, documentId: number ){
        const doc = await this.documents.assertVisible( user, documentId );
        const leave = await this.findLeave( documentId );
        return { ...this.toResponse( leave ), documentStatus: doc.status };
    }

    //* 내 휴가 신청 목록 (그 연도, 임시저장·반려·회수 포함, 삭제 제외) - 시작일 최신 순
    async findMine( user: Actor, year = this.thisYear() ){
        const rows = await this.prisma.leaveRequest.findMany({
            where: { userId: user.id, startDate: this.yearRange( year ), approvalDocument: { deleted: false } },
            include: { approvalDocument: { select: { status: true, title: true } } },
            orderBy: [ { startDate: 'desc' }, { id: 'desc' } ],
        });
        return rows.map( ( r ) => ({ ...this.toResponse( r ), documentStatus: r.approvalDocument.status, title: r.approvalDocument.title }) );
    }

    //* 내 연차 현황 (부여·사용·진행 중·잔여)
    mySummary( user: Actor, year = this.thisYear() ){
        return this.grants.summary( user.id, year );
    }

    //* 캘린더 휴가자 (2026-11-12 사용자 결정): 전 직원, 최종 승인된 휴가만, 날짜별로 묶어서
    // - 화면은 하루에 "휴가 N명" 항목 하나만 그리고, 마우스를 올리면 명단(이름(소속/직급): 종일 또는 시각)을 보여 준다.
    // - 휴가 유형(병가·공가 등)은 민감할 수 있어 응답에 넣지 않는다.
    // - 캘린더는 핵심(게시판)이라 휴가를 모른다 → 화면이 게시판 일정 API와 이 API를 따로 불러 합친다.
    async calendar( start: Date, end: Date ){
        if ( end <= start ) {
            throw new BadRequestException( '종료가 시작보다 늦어야 합니다.' );
        }
        // start 이상 ~ end 미만 → KST 날짜 범위 (양 끝 포함)
        const from = kstDateString( start );
        const to = kstDateString( new Date( end.getTime() - 1 ) );
        if ( daysInclusive( from, to ) > CALENDAR_MAX_DAYS ) {
            throw new BadRequestException( `캘린더 조회 기간은 최대 ${CALENDAR_MAX_DAYS}일입니다.` );
        }

        const rows = await this.prisma.leaveRequest.findMany({
            where: {
                startDate: { lte: new Date( `${to}T00:00:00Z` ) },
                endDate: { gte: new Date( `${from}T00:00:00Z` ) },
                approvalDocument: { status: ApprovalStatus.APPROVED, deleted: false },
                user: { deleted: false },
            },
            include: {
                user: {
                    select: {
                        id: true, name: true,
                        position: { select: { name: true } },
                        departments: {
                            where: { isPrimary: true, deleted: false, department: { deleted: false } },
                            select: { department: { select: { name: true } } },
                            take: 1,
                        },
                    },
                },
            },
        });

        // 기간(묶기용)과 응답에 내보낼 사람 정보를 나눠 둔다
        const entries = rows
            .map( ( r ) => {
                const p = this.fromRow( r );
                return {
                    startDate: p.startDate,
                    endDate: p.endDate,
                    person: {
                        leaveId: r.id,
                        userId: r.user.id,
                        name: r.user.name,
                        departmentName: r.user.departments[0]?.department.name ?? null,
                        positionName: r.user.position?.name ?? null,
                        unit: p.unit,
                        startTime: p.startTime, // 종일이면 null
                        endTime: p.endTime,
                    },
                };
            })
            .sort( ( a, b ) => a.person.name.localeCompare( b.person.name, 'ko' ) || ( a.person.startTime ?? '' ).localeCompare( b.person.startTime ?? '' ) );

        return groupLeavesByDate( entries, from, to ).map( ( d ) => ({
            date: d.date,
            count: new Set( d.items.map( ( i ) => i.person.userId ) ).size, // 같은 날 오전·오후 반차 두 건이어도 1명
            people: d.items.map( ( i ) => i.person ),
        }) );
    }

    //! 처리기에서 호출 (결재 트랜잭션 안)

    //* 상신·최종 승인 검사: 시간 겹침 + 하루 합계 1일 + 연차 잔여 (features.md 7.4)
    // ⭐ 같은 회원이 동시에 두 건을 상신(또는 두 문서가 동시에 최종 승인)하면 둘 다 "아직 다른 신청이 없다"고 볼 수 있다.
    //    회원 행을 잠가 같은 회원의 검사를 한 줄로 세운다. 뒤의 요청은 앞 요청이 커밋된 뒤의 합계로 검사한다.
    //    FOR NO KEY UPDATE: 서로는 막지만, 다른 테이블이 이 회원을 FK로 참조하며 INSERT할 때 거는 KEY SHARE 잠금과는 충돌하지 않는다.
    //    잠금 순서는 항상 결재 문서 행(결재 서비스) → 회원 행이라 교착이 생기지 않는다.
    async assertCanUse( tx: Tx, documentId: number ){
        const leave = await tx.leaveRequest.findUnique({ where: { approvalDocumentId: documentId } });
        if ( !leave ) {
            throw new BadRequestException( '휴가 신청 정보가 없는 문서입니다.' );
        }

        await tx.$queryRaw`SELECT id FROM users_model WHERE id = ${leave.userId} FOR NO KEY UPDATE`;

        const mine = this.fromRow( leave );

        // 같은 회원의 결재 진행 중·승인된 휴가 중 날짜가 겹치는 것 (유형 무관)
        const others = ( await tx.leaveRequest.findMany({
            where: {
                userId: leave.userId,
                id: { not: leave.id },
                startDate: { lte: leave.endDate },
                endDate: { gte: leave.startDate },
                approvalDocument: { status: { in: COUNTED_STATUSES }, deleted: false },
            },
        }) ).map( ( o ) => this.fromRow( o ) );

        // ① 시간 겹침 (2026-11-12 사용자 결정)
        const conflict = findTimeConflict( mine, others );
        if ( conflict ) {
            throw new BadRequestException( `이미 신청한 휴가(${LEAVE_TYPE_LABEL[conflict.other.type]} ${periodLabel( conflict.other )})와 ${conflict.date}에 시간이 겹칩니다.` );
        }

        // ② 하루 합계 1일
        const date = findOverbookedDate( mine, others );
        if ( date ) {
            throw new BadRequestException( `${date}에 이미 신청한 휴가와 합쳐 하루 1일을 넘습니다.` );
        }

        // 연차 잔여 (연차만)
        if ( leave.type !== LeaveType.ANNUAL ) return;

        const year = Number( mine.startDate.slice( 0, 4 ) );
        const granted = await this.grants.grantedQuarters( tx, leave.userId, year );
        const counted = await tx.leaveRequest.aggregate({
            _sum: { days: true },
            where: {
                userId: leave.userId,
                id: { not: leave.id },
                type: LeaveType.ANNUAL,
                startDate: this.yearRange( year ),
                approvalDocument: { status: { in: COUNTED_STATUSES }, deleted: false },
            },
        });
        const remaining = granted - daysToQuarters( counted._sum.days );

        if ( mine.quarters > remaining ) {
            throw new BadRequestException( granted === 0
                ? `${year}년 부여된 연차가 없습니다. 관리자에게 문의하세요.`
                : `연차가 부족합니다. (신청 ${mine.quarters / 4}일, 남은 연차 ${Math.max( 0, remaining ) / 4}일 - 결재 진행 중 포함)` );
        }
    }

    //* 다시 기안: 휴가 항목을 새 DRAFT 문서로 복사
    async copy( tx: Tx, sourceDocumentId: number, newDocumentId: number ){
        const source = await tx.leaveRequest.findUnique({ where: { approvalDocumentId: sourceDocumentId } });
        if ( !source ) {
            throw new BadRequestException( '휴가 신청 정보가 없는 문서입니다.' );
        }
        await tx.leaveRequest.create({
            data: {
                userId: source.userId, approvalDocumentId: newDocumentId,
                type: source.type, unit: source.unit,
                startDate: source.startDate, endDate: source.endDate, startTime: source.startTime, endTime: source.endTime,
                days: source.days, reason: source.reason,
            },
        });
    }

    //! 내부

    private async findLeave( documentId: number ){
        const leave = await this.prisma.leaveRequest.findUnique({ where: { approvalDocumentId: documentId } });
        if ( !leave ) {
            throw new NotFoundException( '존재하지 않는 휴가 신청입니다.' );
        }
        return leave;
    }

    private toPeriod( input: Parameters<typeof buildLeavePeriod>[0] ): LeavePeriod {
        const result = buildLeavePeriod( input );
        if ( 'error' in result ) throw new BadRequestException( result.error );
        return result.period;
    }

    // 계산한 기간 → DB 컬럼 (@db.Date는 UTC 자정, @db.Time은 1970-01-01 UTC 시각으로 넣는다)
    private toColumns( p: LeavePeriod ){
        return {
            type: p.type,
            unit: p.unit,
            startDate: new Date( `${p.startDate}T00:00:00Z` ),
            endDate: new Date( `${p.endDate}T00:00:00Z` ),
            startTime: p.startTime ? new Date( `1970-01-01T${p.startTime}:00Z` ) : null,
            endTime: p.endTime ? new Date( `1970-01-01T${p.endTime}:00Z` ) : null,
            days: quartersToDays( p.quarters ),
        };
    }

    // DB 행 → 문자열 날짜·시각 + quarter
    private fromRow( row: LeaveRequest ): LeavePeriod {
        return {
            type: row.type,
            unit: row.unit,
            startDate: row.startDate.toISOString().slice( 0, 10 ),
            endDate: row.endDate.toISOString().slice( 0, 10 ),
            startTime: row.startTime ? row.startTime.toISOString().slice( 11, 16 ) : null,
            endTime: row.endTime ? row.endTime.toISOString().slice( 11, 16 ) : null,
            quarters: daysToQuarters( row.days ),
        };
    }

    private toResponse( row: LeaveRequest ){
        const p = this.fromRow( row );
        return {
            id: row.id,
            documentId: row.approvalDocumentId,
            type: p.type,
            typeLabel: LEAVE_TYPE_LABEL[p.type],
            unit: p.unit,
            startDate: p.startDate,
            endDate: p.endDate,
            startTime: p.startTime,
            endTime: p.endTime,
            days: p.quarters / 4,
            reason: row.reason,
        };
    }

    private thisYear(){
        return Number( kstDateString( new Date() ).slice( 0, 4 ) );
    }

    // 그 연도에 시작하는 휴가 (한 신청은 한 연도 안이라 시작일로 충분)
    private yearRange( year: number ){
        return { gte: new Date( `${year}-01-01T00:00:00Z` ), lte: new Date( `${year}-12-31T00:00:00Z` ) };
    }
}
