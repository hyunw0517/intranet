// 휴가 mock 데이터 seed (개발용) - 올해 1월 1일 ~ 12월 31일, 실제 회사처럼 회원마다 연차·병가·공가 신청 + 결재 이력
// 실행: npx tsx prisma/seed-leaves.ts              (회원 seed·조직·올해 연차 부여(LeaveGrant)가 있어야 한다)
// 미리 보기: npx tsx prisma/seed-leaves.ts --dry-run  (저장하지 않고 건수·상태·월별 분포만 출력)
// 다시 만들기: npx tsx prisma/seed-leaves.ts --reset  (제외 회원을 뺀 모든 회원의 휴가 결재 문서를 지우고 새로 생성)
//
// - 대상: 재직(ACTIVE) USER/ADMIN, 입사일·주 소속이 있는 회원. 기안자에서 제외할 계정은 EXCLUDE_EMP_NOS (결재자로는 들어간다)
// - 휴가 규칙은 서비스와 같은 순수 함수로 검사한다: buildLeavePeriod(기간·일수), findTimeConflict(시간 겹침),
//   findOverbookedDate(하루 합계 1일), 연차 잔여(부여 = 계산값 + 영구 조정 + 그해 조정, 진행 중 포함)
// - 날짜는 평일만 (주말·아래 HOLIDAYS 제외), 입사일 이후만. 종일 여러 날은 월~금 안에서만 잡는다(종일 = 달력 일수 규칙이라 주말을 끼우지 않는다).
// - 결재라인: 팀원 → 팀장(2일 이하·반차·반반차) / 팀장 → 본부장(3일 이상), 팀장 → 본부장, 본부장 → 대표이사, 대표이사·부대표 → 회장.
//   스냅샷(결재 당시 이름·부서·직급·직책)은 ApproversService로 채운다.
// - 상태: 지난 휴가는 대부분 승인(일부 반려·회수, 사후 신청 결재 대기), 앞으로의 휴가는 승인·결재중·결재요청·임시저장 섞음.
//   결재 이력(ApprovalDocumentHistory)과 단계별 처리 시각은 서비스 흐름과 같은 순서로 만든다.
// - 알림·감사 로그는 만들지 않는다. (지난 일을 한꺼번에 넣는 데이터라 알림함이 넘치지 않게)
// - --reset은 제외 회원을 뺀 모든 회원의 LEAVE 문서를 물리 삭제한다. (화면에서 직접 만든 휴가 문서도 지워진다)
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
    ApprovalDocumentType, ApprovalStatus, ApprovalStepStatus, LeaveType, LeaveUnit, PrismaClient, UserRole, UserStatus,
} from '../src/generated/prisma/client';
import { ApproversService } from '../src/approvals/approvers.service';
import { kstDateString } from '../src/common/util/date.util';
import type { PrismaService } from '../src/prisma/prisma.service';
import { daysToQuarters, quartersToDays } from '../src/approvals/leaves/util/leave-grant.calc';
import {
    buildLeavePeriod, findOverbookedDate, findTimeConflict, LeavePeriod, leaveTitle,
} from '../src/approvals/leaves/util/leave-request.util';

const DRY_RUN = process.argv.includes('--dry-run');
const RESET = process.argv.includes('--reset');

// 기안자에서 제외: 2611001(휴가 화면 확인용 데이터가 있는 회원), 2610001·2610002(관리자 테스트 계정)
const EXCLUDE_EMP_NOS = ['2611001', '2610001', '2610002'];

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const approversService = new ApproversService( prisma as unknown as PrismaService );

// ── 난수 (고정 시드: 실행할 때마다 같은 배정) ───────────────────────────────
let randomState = 20261112;
function random(){
    randomState = ( randomState * 1103515245 + 12345 ) % 2147483648;
    return randomState / 2147483648;
}
const randInt = ( min: number, max: number ) => min + Math.floor( random() * ( max - min + 1 ) );
const chance = ( p: number ) => random() < p;
const pick = <T>( list: readonly T[] ): T => list[ Math.floor( random() * list.length ) ];

// ── 날짜 (KST "YYYY-MM-DD") ──────────────────────────────────────────────
const NOW = new Date();
const TODAY = kstDateString( NOW );
const YEAR = Number( TODAY.slice( 0, 4 ) );
const HOUR = 60 * 60 * 1000;

// 2026년 공휴일·대체공휴일 (주말과 겹치는 날은 생략) - 다른 해에 실행하면 이 목록을 바꾼다
const HOLIDAYS = new Set([
    '2026-01-01',
    '2026-02-16', '2026-02-17', '2026-02-18', // 설날
    '2026-03-02', // 삼일절 대체
    '2026-05-05', // 어린이날
    '2026-05-25', // 부처님오신날 대체
    '2026-06-03', // 지방선거
    '2026-08-17', // 광복절 대체
    '2026-09-24', '2026-09-25', '2026-09-28', // 추석 + 대체
    '2026-10-05', // 개천절 대체
    '2026-10-09', // 한글날
    '2026-12-25',
]);

const pad = ( n: number ) => String( n ).padStart( 2, '0' );
function addDays( date: string, n: number ){
    const [ y, m, d ] = date.split( '-' ).map( Number );
    const next = new Date( Date.UTC( y, m - 1, d + n ) );
    return `${next.getUTCFullYear()}-${pad( next.getUTCMonth() + 1 )}-${pad( next.getUTCDate() )}`;
}
const weekday = ( date: string ) => new Date( `${date}T00:00:00Z` ).getUTCDay(); // 0 = 일
const isWorkday = ( date: string ) => weekday( date ) !== 0 && weekday( date ) !== 6 && !HOLIDAYS.has( date );

const WORKDAYS: string[] = [];
for ( let d = `${YEAR}-01-01`; d <= `${YEAR}-12-31`; d = addDays( d, 1 ) ) if ( isWorkday( d ) ) WORKDAYS.push( d );

// KST 날짜 + 시각 → Date
const kst = ( date: string, minutes: number ) => new Date( `${date}T${pad( Math.floor( minutes / 60 ) )}:${pad( minutes % 60 )}:00+09:00` );
// 업무 시간(09:00~18:30) 중 임의 시각
const workTime = ( date: string ) => kst( date, randInt( 9 * 60, 18 * 60 + 30 ) );
// 앞선 평일 n번째 (기준일 제외)
function workdayBefore( date: string, n: number ){
    let d = date;
    for ( let i = 0; i < n; ) { d = addDays( d, -1 ); if ( isWorkday( d ) ) i++; }
    return d;
}

// ── 사유 ────────────────────────────────────────────────────────────────
const REASONS: Record<'annual' | 'summer' | 'bridge' | 'yearEnd' | 'sick' | 'official', readonly ( string | null )[]> = {
    annual: [ '개인 사유', '개인 용무', '가족 행사', '병원 진료', '이사', '관공서 업무', '자녀 학교 행사', '은행 업무', '휴식', null, null ],
    summer: [ '하계 휴가', '여름 휴가 (가족 여행)', '하계 휴가 - 해외 여행', '여름 휴가' ],
    bridge: [ '징검다리 연휴', '연휴 연결 휴가', '가족 여행' ],
    yearEnd: [ '연말 잔여 연차 소진', '연말 휴가', '잔여 연차 사용', '가족 여행' ],
    sick: [ '감기 몸살', '장염으로 병원 진료', '독감 확진', '허리 통증으로 병원 진료', '치과 치료', '발열' ],
    official: [ '예비군 훈련', '건강검진', '민방위 교육', '법원 증인 출석', '국가 자격시험 응시' ],
};
const REJECT_COMMENTS = [
    '프로젝트 마감 주간입니다. 일정 조정 부탁드립니다.',
    '같은 날 팀 내 휴가자가 많습니다. 다른 날로 다시 신청해 주세요.',
    '월말 결산 기간이라 어렵습니다. 다음 주로 조정 부탁드립니다.',
    '고객사 미팅이 잡혀 있는 날입니다. 일정 확인 후 다시 상신해 주세요.',
];
const APPROVE_COMMENTS = [ null, null, null, null, '승인합니다.', '잘 다녀오세요.', '확인했습니다.', '푹 쉬세요.' ];

// ── 회원·조직 ───────────────────────────────────────────────────────────
// 부서장 직책 (이 직책으로 주 소속된 사람이 그 부서의 결재자)
const LEADER_TITLES = [ '회장', '대표이사', '본부장', '팀장' ];

interface Member {
    id: number;
    empNo: string;
    name: string;
    joinAt: string;
    departmentId: number;
    isLeader: boolean;
    grantQuarters: number | null; // 올해 연차 부여 (행이 없으면 null → 연차 신청 안 함)
}

async function loadOrganization(){
    const departments = await prisma.department.findMany({ where: { deleted: false }, select: { id: true, name: true, parentDepartmentId: true } });
    const leaders = await prisma.userDepartment.findMany({
        where: { deleted: false, isPrimary: true, jobTitle: { name: { in: LEADER_TITLES }, deleted: false }, user: { deleted: false, status: UserStatus.ACTIVE, role: { in: [ UserRole.USER, UserRole.ADMIN ] } } },
        select: { departmentId: true, userId: true, jobTitle: { select: { name: true } } },
    });
    // 부서 → 부서장 (한 부서에 여럿이면 직책 순서가 높은 사람: 대표이사실의 대표이사 > 부대표)
    const leaderOf = new Map<number, number>();
    for ( const l of [ ...leaders ].sort( ( a, b ) => LEADER_TITLES.indexOf( a.jobTitle!.name ) - LEADER_TITLES.indexOf( b.jobTitle!.name ) ) ) {
        if ( !leaderOf.has( l.departmentId ) ) leaderOf.set( l.departmentId, l.userId );
    }
    // 상위 부서: 팀 → 본부, 최상위 본부 → 대표이사실, 대표이사실 → 회장실
    const byName = new Map( departments.map( ( d ) => [ d.name, d.id ] ) );
    const ceoOffice = byName.get( '대표이사실' );
    const chairOffice = byName.get( '회장실' );
    const parentOf = ( id: number ): number | null => {
        const d = departments.find( ( x ) => x.id === id );
        if ( !d ) return null;
        if ( d.parentDepartmentId ) return d.parentDepartmentId;
        if ( id === chairOffice ) return null;
        if ( id === ceoOffice ) return chairOffice ?? null;
        return ceoOffice ?? null;
    };
    return { leaderOf, parentOf };
}

// 기안자의 결재자 후보 (가까운 순): 자기 부서장(본인 제외) → 상위 부서장들
function approverChain( member: Member, org: Awaited<ReturnType<typeof loadOrganization>> ){
    const chain: number[] = [];
    for ( let dept: number | null = member.departmentId; dept !== null && chain.length < 2; dept = org.parentOf( dept ) ) {
        const leader = org.leaderOf.get( dept );
        if ( leader && leader !== member.id && !chain.includes( leader ) ) chain.push( leader );
    }
    return chain;
}

// ── 신청 계획 ───────────────────────────────────────────────────────────
type Category = keyof typeof REASONS;
interface Plan {
    member: Member;
    period: LeavePeriod;
    category: Category;
    status: ApprovalStatus;
    approverIds: number[]; // 단계 순서 (단계마다 1명)
    rejectAtStep?: number;
}

// 회원별로 이미 잡은(결재 진행 중·승인) 휴가 - 서비스의 assertCanUse와 같은 검사
class MemberBook {
    counted: LeavePeriod[] = [];
    annualQuarters = 0;
    constructor( readonly member: Member ){}

    canUse( p: LeavePeriod ){
        if ( p.startDate < this.member.joinAt ) return false;
        const others = this.counted.filter( ( o ) => o.startDate <= p.endDate && p.startDate <= o.endDate );
        if ( findTimeConflict( p, others ) ) return false;
        if ( findOverbookedDate( p, others ) ) return false;
        if ( p.type === LeaveType.ANNUAL && this.annualQuarters + p.quarters > ( this.member.grantQuarters ?? 0 ) ) return false;
        return true;
    }

    add( p: LeavePeriod ){
        this.counted.push( p );
        if ( p.type === LeaveType.ANNUAL ) this.annualQuarters += p.quarters;
    }

    // 진행 중·승인 상태로 들어가는 신청만 장부에 넣는다 (임시저장·반려·회수는 검사·잔여에 안 들어감)
    tryAdd( p: LeavePeriod, status: ApprovalStatus ){
        const counted = status === ApprovalStatus.REQUESTED || status === ApprovalStatus.IN_PROGRESS || status === ApprovalStatus.APPROVED;
        if ( counted && !this.canUse( p ) ) return false;
        if ( !counted && p.startDate < this.member.joinAt ) return false;
        if ( counted ) this.add( p );
        return true;
    }
}

function period( type: LeaveType, unit: LeaveUnit, startDate: string, endDate?: string, startTime?: string ){
    const result = buildLeavePeriod({ type, unit, startDate, endDate, startTime });
    if ( 'error' in result ) throw new Error( `${startDate}: ${result.error}` );
    return result.period;
}

// 월~금 안에서 연속 평일 n일 (시작 후보: from~to 사이)
function consecutiveWorkdays( from: string, to: string, n: number ): [ string, string ] | null {
    const starts = WORKDAYS.filter( ( d ) => d >= from && d <= to );
    for ( let tries = 0; tries < 20 && starts.length > 0; tries++ ) {
        const start = pick( starts );
        let end = start;
        let ok = true;
        for ( let i = 1; i < n; i++ ) {
            end = addDays( end, 1 );
            if ( !isWorkday( end ) ) { ok = false; break; }
        }
        if ( ok ) return [ start, end ];
    }
    return null;
}

const HALF_STARTS = [ '09:00', '09:00', '14:00', '14:00', '13:00' ];
const QUARTER_STARTS = [ '09:00', '09:00', '16:00', '16:00', '11:00' ];

// 날짜에 따라 상태를 고른다 (오늘 이후 = 앞으로의 휴가)
function pickStatus( startDate: string, steps: number ): ApprovalStatus {
    const future = startDate > TODAY;
    const r = random();
    if ( !future ) {
        // 최근 2주 안의 지난 휴가 일부는 아직 결재 대기(사후 신청·결재자 미처리)
        if ( startDate >= addDays( TODAY, -14 ) && r < 0.08 ) return steps > 1 && chance( 0.5 ) ? ApprovalStatus.IN_PROGRESS : ApprovalStatus.REQUESTED;
        if ( r < 0.04 ) return ApprovalStatus.REJECTED;
        if ( r < 0.07 ) return ApprovalStatus.CANCELLED;
        return ApprovalStatus.APPROVED;
    }
    const near = startDate <= addDays( TODAY, 14 );
    if ( r < ( near ? 0.6 : 0.35 ) ) return ApprovalStatus.APPROVED;
    if ( r < ( near ? 0.72 : 0.5 ) && steps > 1 ) return ApprovalStatus.IN_PROGRESS;
    if ( r < 0.88 ) return ApprovalStatus.REQUESTED;
    if ( r < 0.94 ) return ApprovalStatus.DRAFT;
    return chance( 0.5 ) ? ApprovalStatus.CANCELLED : ApprovalStatus.REJECTED;
}

function buildPlans( members: Member[], org: Awaited<ReturnType<typeof loadOrganization>> ){
    const plans: Plan[] = [];

    for ( const member of members ) {
        const book = new MemberBook( member );
        const chain = approverChain( member, org );
        if ( chain.length === 0 ) continue;

        // 결재라인: 부서장 1단계, 팀원의 3일 이상 휴가는 상위 부서장까지 2단계
        const stepsFor = ( p: LeavePeriod ) => ( !member.isLeader && p.quarters >= 12 && chain.length > 1 ? chain.slice( 0, 2 ) : chain.slice( 0, 1 ) );

        const push = ( p: LeavePeriod, category: Category, forced?: ApprovalStatus ) => {
            const approverIds = stepsFor( p );
            let status = forced ?? pickStatus( p.startDate, approverIds.length );
            if ( status === ApprovalStatus.IN_PROGRESS && approverIds.length < 2 ) status = ApprovalStatus.REQUESTED;
            if ( !book.tryAdd( p, status ) ) return false;
            plans.push({
                member, period: p, category, status, approverIds,
                rejectAtStep: status === ApprovalStatus.REJECTED ? randInt( 1, approverIds.length ) : undefined,
            });
            // 반려·회수된 지난 휴가는 대부분 다른 날로 다시 신청해 승인받는다
            if ( ( status === ApprovalStatus.REJECTED || status === ApprovalStatus.CANCELLED ) && p.startDate <= TODAY && chance( 0.7 ) ) {
                for ( let tries = 0; tries < 5; tries++ ) {
                    const shift = randInt( 3, 12 );
                    const start = WORKDAYS[ WORKDAYS.indexOf( p.startDate ) + shift ];
                    if ( !start || start > TODAY ) break;
                    const again = p.unit === LeaveUnit.FULL
                        ? consecutiveWorkdays( start, start, daysOf( p ) )
                        : [ start, start ] as [ string, string ];
                    if ( !again ) continue;
                    const retry = p.unit === LeaveUnit.FULL ? period( p.type, p.unit, again[0], again[1] ) : period( p.type, p.unit, start, undefined, p.startTime! );
                    if ( book.tryAdd( retry, ApprovalStatus.APPROVED ) ) {
                        plans.push({ member, period: retry, category, status: ApprovalStatus.APPROVED, approverIds: stepsFor( retry ) });
                        break;
                    }
                }
            }
            return true;
        };

        const grant = member.grantQuarters ?? 0;
        // 올해 연차 목표 사용량: 부여의 60~95% (연말 소진 포함), 신입은 거의 다 쓴다
        const target = Math.floor( grant * ( 0.6 + random() * 0.35 ) );
        const annual = ( unit: LeaveUnit, start: string, end?: string ) =>
            unit === LeaveUnit.FULL ? period( LeaveType.ANNUAL, unit, start, end ) : period( LeaveType.ANNUAL, unit, start, undefined, pick( unit === LeaveUnit.HALF ? HALF_STARTS : QUARTER_STARTS ) );

        // ① 하계 휴가 (7/13 ~ 8/21, 월~금 3~5일) - 부여 10일 이상인 회원의 70%
        if ( grant >= 40 && chance( 0.7 ) ) {
            const n = pick( [ 3, 4, 5, 5 ] );
            const range = consecutiveWorkdays( `${YEAR}-07-13`, `${YEAR}-08-21`, n );
            if ( range ) push( annual( LeaveUnit.FULL, range[0], range[1] ), 'summer' );
        }
        // ② 징검다리 연휴 (5/4 월, 2/19~20 설 뒤, 9/29~30 추석 뒤, 10/2 금)
        if ( chance( 0.35 ) ) push( annual( LeaveUnit.FULL, `${YEAR}-05-04` ), 'bridge' );
        if ( chance( 0.15 ) ) push( annual( LeaveUnit.FULL, `${YEAR}-02-19`, `${YEAR}-02-20` ), 'bridge' );
        if ( chance( 0.15 ) ) push( annual( LeaveUnit.FULL, `${YEAR}-09-29`, `${YEAR}-09-30` ), 'bridge' );
        if ( chance( 0.2 ) ) push( annual( LeaveUnit.FULL, `${YEAR}-10-02` ), 'bridge' );

        // ③ 연말 (12/24, 12/28~31) - 남은 연차 소진
        if ( chance( 0.4 ) ) push( annual( LeaveUnit.FULL, `${YEAR}-12-24` ), 'yearEnd' );
        if ( chance( 0.3 ) ) {
            const n = randInt( 2, 4 );
            push( annual( LeaveUnit.FULL, `${YEAR}-12-28`, addDays( `${YEAR}-12-28`, n - 1 ) ), 'yearEnd' );
        }

        // ④ 나머지: 하루·이틀·반차·반반차를 연중 고르게 (목표 사용량까지)
        for ( let tries = 0; tries < 80 && book.annualQuarters < target; tries++ ) {
            const r = random();
            const unit = r < 0.55 ? LeaveUnit.FULL : r < 0.9 ? LeaveUnit.HALF : LeaveUnit.QUARTER;
            const candidates = WORKDAYS.filter( ( d ) => d >= member.joinAt );
            if ( candidates.length === 0 ) break;
            const start = pick( candidates );
            // 금요일·월요일 연차가 많도록
            if ( unit === LeaveUnit.FULL && ![ 1, 5 ].includes( weekday( start ) ) && chance( 0.4 ) ) continue;
            if ( unit === LeaveUnit.FULL && chance( 0.15 ) ) {
                const range = consecutiveWorkdays( start, start, 2 );
                if ( range ) { push( annual( unit, range[0], range[1] ), 'annual' ); continue; }
            }
            const p = annual( unit, start );
            if ( book.annualQuarters + p.quarters > target ) continue;
            push( p, 'annual' );
        }

        // ⑤ 병가 (회원의 20%, 하루~이틀 또는 반차) - 대부분 당일·사후 신청
        if ( chance( 0.2 ) ) {
            const start = pick( WORKDAYS.filter( ( d ) => d >= member.joinAt && d <= TODAY ) );
            if ( start ) {
                const p = chance( 0.3 ) ? period( LeaveType.SICK, LeaveUnit.HALF, start, undefined, '14:00' )
                    : period( LeaveType.SICK, LeaveUnit.FULL, start, chance( 0.3 ) && isWorkday( addDays( start, 1 ) ) ? addDays( start, 1 ) : start );
                push( p, 'sick' );
            }
        }
        // ⑥ 공가 (회원의 25%: 예비군·건강검진·민방위 등, 종일 또는 오전 반차)
        if ( chance( 0.25 ) ) {
            const start = pick( WORKDAYS.filter( ( d ) => d >= member.joinAt ) );
            if ( start ) push( chance( 0.5 ) ? period( LeaveType.OFFICIAL, LeaveUnit.FULL, start ) : period( LeaveType.OFFICIAL, LeaveUnit.HALF, start, undefined, '09:00' ), 'official' );
        }
    }
    return plans;
}

const daysOf = ( p: LeavePeriod ) => p.quarters / 4;

// ── 문서·단계·이력 만들기 ───────────────────────────────────────────────
function timeline( plan: Plan ){
    const { period: p, status, category } = plan;
    // 상신 시각: 보통 1~3주 전, 병가는 당일·다음 날(사후 신청), 앞으로의 휴가는 지금보다 앞서게
    let requestedAt = category === 'sick'
        ? workTime( chance( 0.5 ) ? p.startDate : ( WORKDAYS.find( ( d ) => d > p.startDate ) ?? p.startDate ) )
        : workTime( workdayBefore( p.startDate, randInt( 3, 15 ) ) );
    if ( requestedAt > NOW ) requestedAt = new Date( NOW.getTime() - randInt( 1, 72 ) * HOUR );
    // 결재 대기 중인 문서는 최근에 올린 것
    if ( ( status === ApprovalStatus.REQUESTED || status === ApprovalStatus.IN_PROGRESS ) && NOW.getTime() - requestedAt.getTime() > 10 * 24 * HOUR ) {
        requestedAt = new Date( NOW.getTime() - randInt( 2, 96 ) * HOUR );
    }
    const createdAt = new Date( requestedAt.getTime() - randInt( 2, 90 ) * 60 * 1000 );

    // 단계 처리 시각: 앞 단계 처리 후 1~30시간 (지금을 넘지 않게)
    const acted: Date[] = [];
    let last = requestedAt;
    for ( let i = 0; i < plan.approverIds.length; i++ ) {
        const next = new Date( Math.min( last.getTime() + randInt( 1, 30 ) * HOUR + randInt( 0, 59 ) * 60 * 1000, NOW.getTime() - 60 * 1000 ) );
        acted.push( next < last ? last : next );
        last = acted[i];
    }
    return { createdAt, requestedAt, acted };
}

type StepRow = { approverId: number; stepOrder: number; status: ApprovalStepStatus; comment: string | null; actedAt: Date | null };

function buildDocument( plan: Plan ){
    const { status, approverIds, member } = plan;
    const { createdAt, requestedAt, acted } = timeline( plan );
    const steps: StepRow[] = approverIds.map( ( approverId, i ) => ({ approverId, stepOrder: i + 1, status: ApprovalStepStatus.WAITING, comment: null, actedAt: null }) );
    const histories: { actorId: number; fromStatus: ApprovalStatus | null; toStatus: ApprovalStatus; comment: string | null; createdAt: Date }[] = [
        { actorId: member.id, fromStatus: null, toStatus: ApprovalStatus.DRAFT, comment: null, createdAt },
    ];
    let currentStepOrder: number | null = null;
    let completedAt: Date | null = null;
    let updatedAt = createdAt;
    let updatedId = member.id;

    if ( status !== ApprovalStatus.DRAFT ) {
        histories.push({ actorId: member.id, fromStatus: ApprovalStatus.DRAFT, toStatus: ApprovalStatus.REQUESTED, comment: null, createdAt: requestedAt });
        updatedAt = requestedAt;
    }

    if ( status === ApprovalStatus.REQUESTED ) {
        currentStepOrder = 1;
        steps[0].status = ApprovalStepStatus.PENDING;
    } else if ( status === ApprovalStatus.CANCELLED ) {
        // 아무도 승인하기 전 회수
        const at = new Date( Math.min( requestedAt.getTime() + randInt( 1, 20 ) * HOUR, NOW.getTime() - 60 * 1000 ) );
        histories.push({ actorId: member.id, fromStatus: ApprovalStatus.REQUESTED, toStatus: ApprovalStatus.CANCELLED, comment: null, createdAt: at });
        updatedAt = at;
    } else {
        // 승인·결재중·반려: 단계별로 진행
        const lastStep = status === ApprovalStatus.IN_PROGRESS ? 1 : status === ApprovalStatus.REJECTED ? plan.rejectAtStep! : steps.length;
        let docStatus: ApprovalStatus = ApprovalStatus.REQUESTED;
        for ( let i = 0; i < lastStep; i++ ) {
            const step = steps[i];
            const at = acted[i];
            const rejectHere = status === ApprovalStatus.REJECTED && i === lastStep - 1;
            if ( rejectHere ) {
                const comment = pick( REJECT_COMMENTS );
                Object.assign( step, { status: ApprovalStepStatus.REJECTED, comment, actedAt: at } );
                histories.push({ actorId: step.approverId, fromStatus: docStatus, toStatus: ApprovalStatus.REJECTED, comment, createdAt: at });
                completedAt = at;
            } else {
                const comment = pick( APPROVE_COMMENTS );
                const final = i === steps.length - 1;
                const toStatus = final ? ApprovalStatus.APPROVED : ApprovalStatus.IN_PROGRESS;
                Object.assign( step, { status: ApprovalStepStatus.APPROVED, comment, actedAt: at } );
                histories.push({ actorId: step.approverId, fromStatus: docStatus, toStatus, comment, createdAt: at });
                docStatus = toStatus;
                if ( final ) completedAt = at;
            }
            updatedAt = at;
            updatedId = step.approverId;
        }
        if ( status === ApprovalStatus.IN_PROGRESS ) {
            currentStepOrder = 2;
            steps[1].status = ApprovalStepStatus.PENDING;
        }
    }

    return { createdAt, requestedAt: status === ApprovalStatus.DRAFT ? null : requestedAt, completedAt, currentStepOrder, updatedAt, updatedId, steps, histories };
}

// ── 실행 ────────────────────────────────────────────────────────────────
async function main(){
    console.log( `기준일 ${TODAY} (KST), 대상 연도 ${YEAR}` );

    const excluded = await prisma.users.findMany({ where: { empNo: { in: EXCLUDE_EMP_NOS } }, select: { id: true } });
    const excludedIds = excluded.map( ( u ) => u.id );

    const existing = await prisma.approvalDocument.count({ where: { documentType: ApprovalDocumentType.LEAVE, requesterId: { notIn: excludedIds } } });
    if ( existing > 0 && !RESET && !DRY_RUN ) {
        console.log( `제외 회원 밖의 휴가 문서가 이미 ${existing}건 있어 중단합니다. 다시 만들려면 --reset` );
        return;
    }

    const users = await prisma.users.findMany({
        where: {
            deleted: false, status: UserStatus.ACTIVE, role: { in: [ UserRole.USER, UserRole.ADMIN ] },
            joinAt: { not: null }, id: { notIn: excludedIds },
        },
        select: {
            id: true, empNo: true, name: true, joinAt: true,
            departments: { where: { isPrimary: true, deleted: false, department: { deleted: false } }, select: { departmentId: true, jobTitle: { select: { name: true } } }, take: 1 },
            leaveGrants: { where: { year: YEAR }, select: { baseDays: true, permanentDays: true, adjustDays: true } },
        },
        orderBy: { empNo: 'asc' },
    });

    const members: Member[] = users
        .filter( ( u ) => u.departments.length > 0 )
        .map( ( u ) => {
            const g = u.leaveGrants[0];
            const joinAt = u.joinAt!.toISOString().slice( 0, 10 );
            return {
                id: u.id, empNo: u.empNo, name: u.name,
                joinAt: joinAt < `${YEAR}-01-01` ? `${YEAR}-01-01` : joinAt,
                departmentId: u.departments[0].departmentId,
                isLeader: LEADER_TITLES.includes( u.departments[0].jobTitle?.name ?? '' ),
                grantQuarters: g ? daysToQuarters( g.baseDays ) + daysToQuarters( g.permanentDays ) + daysToQuarters( g.adjustDays ) : null,
            };
        });
    const noGrant = members.filter( ( m ) => m.grantQuarters === null );
    if ( noGrant.length > 0 ) console.log( `올해 연차 부여 행이 없는 회원 ${noGrant.length}명은 연차 없이 병가·공가만 만든다: ${noGrant.map( ( m ) => m.empNo ).join( ', ' )}` );

    const org = await loadOrganization();
    const plans = buildPlans( members, org );

    // 집계 출력
    const byStatus = new Map<string, number>();
    const byType = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for ( const p of plans ) {
        byStatus.set( p.status, ( byStatus.get( p.status ) ?? 0 ) + 1 );
        byType.set( `${p.period.type}/${p.period.unit}`, ( byType.get( `${p.period.type}/${p.period.unit}` ) ?? 0 ) + 1 );
        if ( p.status === ApprovalStatus.APPROVED ) byMonth.set( p.period.startDate.slice( 0, 7 ), ( byMonth.get( p.period.startDate.slice( 0, 7 ) ) ?? 0 ) + daysOf( p.period ) );
    }
    console.log( `대상 회원 ${members.length}명, 휴가 문서 ${plans.length}건` );
    console.log( '상태별', Object.fromEntries( byStatus ) );
    console.log( '유형/단위별', Object.fromEntries( byType ) );
    console.log( '월별 승인 일수', Object.fromEntries( [ ...byMonth ].sort() ) );
    const usage = members.map( ( m ) => ({ m, used: plans.filter( ( p ) => p.member === m && p.period.type === LeaveType.ANNUAL && p.status === ApprovalStatus.APPROVED ).reduce( ( s, p ) => s + p.period.quarters, 0 ) }) );
    const rate = usage.filter( ( u ) => u.m.grantQuarters ).map( ( u ) => u.used / u.m.grantQuarters! );
    console.log( `연차 사용률(승인 기준) 평균 ${( rate.reduce( ( s, r ) => s + r, 0 ) / rate.length * 100 ).toFixed( 1 )}%` );

    if ( DRY_RUN ) {
        console.log( '--dry-run: 저장하지 않았습니다.' );
        for ( const p of plans.slice( 0, 8 ) ) console.log( ' ', p.member.empNo, p.member.name, leaveTitle( p.period ), p.status, p.approverIds );
        return;
    }

    if ( RESET ) {
        const docs = await prisma.approvalDocument.findMany({ where: { documentType: ApprovalDocumentType.LEAVE, requesterId: { notIn: excludedIds } }, select: { id: true } });
        const ids = docs.map( ( d ) => d.id );
        await prisma.$transaction([
            prisma.leaveRequest.deleteMany({ where: { approvalDocumentId: { in: ids } } }),
            prisma.approvalDocumentStep.deleteMany({ where: { approvalDocumentId: { in: ids } } }),
            prisma.approvalDocumentHistory.deleteMany({ where: { approvalDocumentId: { in: ids } } }),
            prisma.approvalDocument.deleteMany({ where: { id: { in: ids } } }),
        ]);
        console.log( `--reset: 휴가 문서 ${ids.length}건 삭제` );
    }

    // 결재자 스냅샷 (현재 이름·부서·직급·직책)
    const approverInfo = await approversService.load( [ ...new Set( plans.flatMap( ( p ) => p.approverIds ) ) ] );

    let saved = 0;
    for ( const plan of plans ) {
        const doc = buildDocument( plan );
        const p = plan.period;
        await prisma.$transaction( async ( tx ) => {
            const created = await tx.approvalDocument.create({
                data: {
                    requesterId: plan.member.id,
                    documentType: ApprovalDocumentType.LEAVE,
                    title: leaveTitle( p ),
                    status: plan.status,
                    currentStepOrder: doc.currentStepOrder,
                    requestedAt: doc.requestedAt,
                    completedAt: doc.completedAt,
                    createdAt: doc.createdAt,
                    createdId: plan.member.id,
                    updatedAt: doc.updatedAt,
                    updatedId: doc.updatedId,
                    steps: {
                        create: doc.steps.map( ( s ) => ({ ...s, ...ApproversService.snapshot( approverInfo.get( s.approverId )! ) }) ),
                    },
                    histories: { create: doc.histories },
                },
                select: { id: true },
            });
            await tx.leaveRequest.create({
                data: {
                    userId: plan.member.id,
                    approvalDocumentId: created.id,
                    type: p.type,
                    unit: p.unit,
                    startDate: new Date( `${p.startDate}T00:00:00Z` ),
                    endDate: new Date( `${p.endDate}T00:00:00Z` ),
                    startTime: p.startTime ? new Date( `1970-01-01T${p.startTime}:00Z` ) : null,
                    endTime: p.endTime ? new Date( `1970-01-01T${p.endTime}:00Z` ) : null,
                    days: quartersToDays( p.quarters ),
                    reason: pick( REASONS[plan.category] ),
                    createdAt: doc.createdAt,
                },
            });
        });
        saved++;
        if ( saved % 300 === 0 ) console.log( `  ${saved}/${plans.length}` );
    }
    console.log( `저장 완료: 휴가 문서 ${saved}건` );
}

main()
    .catch( ( e ) => { console.error( e ); process.exitCode = 1; } )
    .finally( () => prisma.$disconnect() );
