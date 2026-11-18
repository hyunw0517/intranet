// 과제 관리 mock 데이터 seed (개발용) - IT 중견기업의 2025~2026년 수주·수행 이력처럼 거래처·프로젝트·과제·참여자·협력사·견적·매출·예산을 만든다
// 실행: npx tsx prisma/seed-projects.ts              (회원 seed·조직·비용 항목이 있어야 한다)
// 미리 보기: npx tsx prisma/seed-projects.ts --dry-run  (저장하지 않고 건수·금액만 출력)
// 다시 만들기: npx tsx prisma/seed-projects.ts --reset  (이 파일이 만든 프로젝트·거래처만 지우고 새로 생성)
//
// - 기존 데이터는 건드리지 않는다. 이 파일의 프로젝트 이름·사업자번호와 일치하는 행만 --reset 대상이다.
// - 회사·담당자는 모두 가상이다: 사업자번호는 999로 시작, 전화는 0000 국번, 이메일은 .example 도메인.
// - 금액은 서비스와 같은 순수 함수(calcQuote, calcSaleAmounts)로 계산한다. 청구 합계 ≤ 확정 견적 합계, 수금 합계 ≤ 청구 금액을 지킨다.
// - 날짜는 실행일 기준: 지난 일정은 청구·수금·완료, 앞으로의 일정은 청구 예정·할 일로 만든다.
// - 결재 문서는 만들지 않는다(견적은 직접 확정 상태). 알림·감사 로그도 만들지 않는다. (지난 일을 한꺼번에 넣는 데이터라 알림함이 넘치지 않게)
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
    Prisma, PrismaClient, ProjectMemberRole, ProjectQuoteStatus, ProjectQuoteTaxType, ProjectSaleStatus, ProjectStatus, ProjectTaskStatus, UserRole, UserStatus,
} from '../src/generated/prisma/client';
import { kstDateString } from '../src/common/util/date.util';
import { calcQuote, QuoteItemInput } from '../src/projects/quotes/quote-rules.util';
import { calcSaleAmounts } from '../src/projects/sales/sale-rules.util';

const DRY_RUN = process.argv.includes( '--dry-run' );
const RESET = process.argv.includes( '--reset' );

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ── 난수 (고정 시드: 실행할 때마다 같은 배정) ───────────────────────────────
let randomState = 20261119;
function random(){
    randomState = ( randomState * 1103515245 + 12345 ) % 2147483648;
    return randomState / 2147483648;
}
const randInt = ( min: number, max: number ) => min + Math.floor( random() * ( max - min + 1 ) );
const chance = ( p: number ) => random() < p;
const pick = <T>( list: readonly T[] ): T => list[ Math.floor( random() * list.length ) ];
function shuffled<T>( list: readonly T[] ){
    const copy = [ ...list ];
    for ( let i = copy.length - 1; i > 0; i-- ) {
        const j = Math.floor( random() * ( i + 1 ) );
        [ copy[i], copy[j] ] = [ copy[j], copy[i] ];
    }
    return copy;
}

// ── 날짜 (KST "YYYY-MM-DD") ──────────────────────────────────────────────
const TODAY = kstDateString( new Date() );
const pad = ( n: number, size = 2 ) => String( n ).padStart( size, '0' );
function addDays( date: string, n: number ){
    const [ y, m, d ] = date.split( '-' ).map( Number );
    const next = new Date( Date.UTC( y, m - 1, d + n ) );
    return `${next.getUTCFullYear()}-${pad( next.getUTCMonth() + 1 )}-${pad( next.getUTCDate() )}`;
}
const dayDiff = ( a: string, b: string ) => Math.round( ( Date.parse( `${b}T00:00:00Z` ) - Date.parse( `${a}T00:00:00Z` ) ) / 86400000 );
const minDate = ( a: string, b: string ) => ( a < b ? a : b );
const dateOnly = ( date: string ) => new Date( `${date}T00:00:00Z` );
const kstAt = ( date: string, time = '10:00' ) => new Date( `${date}T${time}:00+09:00` );

const HOLIDAYS = new Set([
    '2025-01-01', '2025-01-27', '2025-01-28', '2025-01-29', '2025-01-30', '2025-03-03', '2025-05-05', '2025-05-06', '2025-06-03', '2025-06-06',
    '2025-08-15', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-08', '2025-10-09', '2025-12-25',
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02', '2026-05-05', '2026-05-25', '2026-06-03', '2026-08-17',
    '2026-09-24', '2026-09-25', '2026-09-28', '2026-10-05', '2026-10-09', '2026-12-25',
    '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-01',
]);
const isWorkday = ( date: string ) => {
    const day = new Date( `${date}T00:00:00Z` ).getUTCDay();
    return day !== 0 && day !== 6 && !HOLIDAYS.has( date );
};
// 그날이 쉬는 날이면 앞선 평일로
function workdayOnOrBefore( date: string ){
    let d = date;
    while ( !isWorkday( d ) ) d = addDays( d, -1 );
    return d;
}
function monthsBetween( start: string, end: string ){
    const months: string[] = [];
    for ( let m = start.slice( 0, 7 ); m <= end.slice( 0, 7 ); ) {
        months.push( m );
        const [ y, mo ] = m.split( '-' ).map( Number );
        m = mo === 12 ? `${y + 1}-01` : `${y}-${pad( mo + 1 )}`;
    }
    return months;
}

const floorTo = ( value: number, unit: number ) => Math.floor( value / unit ) * unit;
const MILLION = 1_000_000;

// ── 거래처 (가상 회사) ──────────────────────────────────────────────────
interface ContactSeed { name: string; department: string; jobTitle: string }
interface ClientSeed { key: string; name: string; ceo: string; address: string; memo: string; contacts: ContactSeed[]; deleted?: boolean }

const CLIENTS: ClientSeed[] = [
    // 발주처
    { key: 'nurion', name: '누리온저축은행', ceo: '배정훈', address: '서울특별시 영등포구 국제금융로 901', memo: '금융권 레퍼런스 고객. 전자금융감독규정 준수 필수.', contacts: [ { name: '문성호', department: 'IT기획부', jobTitle: '부장' }, { name: '양혜진', department: '디지털금융팀', jobTitle: '차장' } ] },
    { key: 'seon', name: '세온라이프생명보험', ceo: '권오석', address: '서울특별시 중구 세종대로 912', memo: '차세대 시스템 주사업자 계약.', contacts: [ { name: '남기태', department: '차세대추진단', jobTitle: '단장' }, { name: '하윤정', department: '정보시스템팀', jobTitle: '과장' } ] },
    { key: 'hangyeol', name: '한결정밀공업', ceo: '송재만', address: '경기도 안산시 단원구 산단로 903', memo: '안산·아산 2개 공장 운영. 스마트공장 지원사업 연계.', contacts: [ { name: '장동민', department: '생산기술팀', jobTitle: '팀장' }, { name: '곽수빈', department: '전산팀', jobTitle: '대리' } ] },
    { key: 'greenroad', name: '그린로드물류', ceo: '유상철', address: '인천광역시 중구 공항동로 905', memo: '수도권 물류센터 4곳 운영.', contacts: [ { name: '탁재현', department: '물류혁신팀', jobTitle: '팀장' }, { name: '변지아', department: 'IT운영팀', jobTitle: '과장' } ] },
    { key: 'mir', name: '미르마켓', ceo: '함지수', address: '서울특별시 송파구 올림픽로 908', memo: '이커머스. 11월 대규모 할인 행사 기간 배포 금지.', contacts: [ { name: '엄태경', department: '플랫폼개발실', jobTitle: '실장' }, { name: '노은채', department: '서비스기획팀', jobTitle: '매니저' } ] },
    { key: 'cheongram', name: '청람에너지', ceo: '석민호', address: '울산광역시 남구 산업로 910', memo: 'ESG 공시 대응 사업.', contacts: [ { name: '편경수', department: 'ESG경영팀', jobTitle: '팀장' }, { name: '소은비', department: '정보전략팀', jobTitle: '대리' } ] },
    { key: 'seorin', name: '서린의료재단', ceo: '기영준', address: '대전광역시 서구 둔산대로 906', memo: '병원 3개소. 개인정보·의료정보 보안 요건 엄격.', contacts: [ { name: '육상현', department: '의료정보팀', jobTitle: '팀장' }, { name: '도민정', department: '정보보호파트', jobTitle: '파트장' } ] },
    { key: 'daon', name: '다온에듀', ceo: '왕소라', address: '서울특별시 구로구 디지털로 904', memo: '온라인 교육 플랫폼 운영사.', contacts: [ { name: '마준혁', department: '서비스개발팀', jobTitle: '팀장' }, { name: '길나래', department: '사업전략팀', jobTitle: '매니저' } ] },
    { key: 'garam', name: '가람시설공단', ceo: '추현식', address: '세종특별자치시 한누리대로 907', memo: '공공기관. 조달 계약, 웹 접근성 인증 필수.', contacts: [ { name: '제갈현', department: '정보화팀', jobTitle: '팀장' }, { name: '선우림', department: '정보화팀', jobTitle: '주임' } ] },
    { key: 'ara', name: '아라항만운영공단', ceo: '독고훈', address: '부산광역시 중구 충장대로 909', memo: '공공 클라우드 전환 사업.', contacts: [ { name: '사공민', department: '디지털전환부', jobTitle: '부장' }, { name: '황보연', department: '정보운영과', jobTitle: '과장' } ] },
    { key: 'rowoon', name: '로운모빌리티', ceo: '어진우', address: '경기도 성남시 분당구 판교역로 911', memo: '투자 유치 지연으로 사업 일정 재협의 중.', contacts: [ { name: '봉태식', department: '플랫폼사업부', jobTitle: '이사' }, { name: '천하람', department: '개발팀', jobTitle: '팀장' } ] },
    { key: 'haneulbit', name: '하늘빛항공서비스', ceo: '단유경', address: '서울특별시 강서구 하늘길 902', memo: '2026년 3월 발주처 사정으로 사업 취소.', contacts: [ { name: '인수호', department: '디지털혁신팀', jobTitle: '팀장' } ] },
    { key: 'onsaemiro', name: '온새미로테크', ceo: '피정우', address: '경기도 수원시 영통구 광교로 913', memo: '2026년 2월 폐업으로 거래 종료.', contacts: [ { name: '국진아', department: '경영지원팀', jobTitle: '과장' } ], deleted: true },
    // 협력사 (코드브릿지는 유지보수 발주처이기도 하다)
    { key: 'codebridge', name: '코드브릿지', ceo: '모세현', address: '서울특별시 금천구 가산디지털1로 914', memo: '백엔드·프론트엔드 개발 협력사. 자사 ERP 유지보수는 우리가 수행.', contacts: [ { name: '반승우', department: '사업관리팀', jobTitle: '팀장' }, { name: '시은호', department: '개발1팀', jobTitle: '수석' } ] },
    { key: 'devwave', name: '데브웨이브', ceo: '여도현', address: '서울특별시 마포구 월드컵북로 915', memo: '모바일·프론트엔드 전문.', contacts: [ { name: '진하늘', department: '개발본부', jobTitle: '이사' } ] },
    { key: 'cloudforest', name: '클라우드포레스트', ceo: '채원빈', address: '서울특별시 강남구 테헤란로 916', memo: '클라우드 MSP 파트너.', contacts: [ { name: '방규민', department: '기술영업팀', jobTitle: '팀장' } ] },
    { key: 'securenode', name: '시큐어노드', ceo: '표진석', address: '서울특별시 서초구 강남대로 917', memo: '모의해킹·보안 컨설팅 전문.', contacts: [ { name: '현다솜', department: '컨설팅팀', jobTitle: '책임' } ] },
    { key: 'pixelhouse', name: '픽셀하우스', ceo: '탁민아', address: '서울특별시 성동구 성수이로 918', memo: 'UI/UX 디자인·웹 접근성.', contacts: [ { name: '류은결', department: '디자인팀', jobTitle: '팀장' } ] },
    { key: 'qalab', name: '큐에이랩', ceo: '설동하', address: '경기도 성남시 수정구 창업로 919', memo: '테스트 전문 업체.', contacts: [ { name: '라윤서', department: 'QA팀', jobTitle: '팀장' } ] },
    { key: 'netflowsys', name: '넷플로우시스템', ceo: '범상우', address: '대전광역시 유성구 테크노로 920', memo: '네트워크·서버 장비 공급 및 설치.', contacts: [ { name: '견우진', department: '기술지원팀', jobTitle: '차장' } ] },
    { key: 'dataroot', name: '데이터루트', ceo: '은지후', address: '서울특별시 영등포구 선유로 921', memo: '데이터 이관·정제 전문.', contacts: [ { name: '담소율', department: '데이터팀', jobTitle: '팀장' } ] },
];

const businessNoOf = ( index: number ) => `99981${pad( index + 1, 5 )}`;
const contactHp = ( clientIndex: number, contactIndex: number ) => `010-0000-${pad( clientIndex + 10, 2 )}${pad( contactIndex + 1, 2 )}`;
const clientTel = ( index: number ) => `02-0000-${pad( index + 1000, 4 )}`;
const mailOf = ( key: string, index: number ) => `contact${index + 1}@${key}.example`;

// 협력사 담당자 (직접 기재)
const PARTNER_STAFF: Record<string, [ string, string ][]> = {
    codebridge: [ [ '반승우', 'PM' ], [ '시은호', '개발 리드' ], [ '우가람', '정산' ] ],
    devwave: [ [ '진하늘', 'PM' ], [ '금새롬', '프론트엔드 리드' ] ],
    cloudforest: [ [ '방규민', 'PM' ], [ '옥지석', '클라우드 아키텍트' ], [ '복예린', '정산' ] ],
    securenode: [ [ '현다솜', 'PM' ], [ '연태오', '모의해킹' ] ],
    pixelhouse: [ [ '류은결', 'PM' ], [ '맹서아', 'UI 디자인' ] ],
    qalab: [ [ '라윤서', 'PM' ], [ '빈도하', '테스트 엔지니어' ] ],
    netflowsys: [ [ '견우진', 'PM' ], [ '좌민규', '현장 설치' ] ],
    dataroot: [ [ '담소율', 'PM' ], [ '승아린', '데이터 엔지니어' ] ],
};

// ── 프로젝트 ────────────────────────────────────────────────────────────
type ProjectKind = 'si' | 'infra' | 'security' | 'ai' | 'maintenance' | 'internal';
interface PartnerSeed { client: string; scope: string; amount: number; removedAt?: string }
interface ExtraQuoteSeed {
    title: string; amount: number; date: string; status: 'CONFIRMED' | 'DRAFT'; exempt?: boolean;
    sales?: { title: string; percent: number; date: string }[];
}
interface ProjectSeed {
    name: string; client: string | null; status: ProjectStatus; start: string; end: string; kind: ProjectKind;
    teams: string[]; size: number; amount: number; modules: string[]; summary: string;
    partners?: PartnerSeed[];
    holdDate?: string;          // 보류·취소 시점 (이후 일정은 멈춘다)
    extras?: ExtraQuoteSeed[];  // 추가 견적
    overCategory?: string;      // 예산을 넘긴 비용 항목
    removedMember?: boolean;    // 중간에 빠진 참여자 (담당자 부재 과제)
    unquotedSale?: { title: string; amount: number; date: string; memo: string };
}

const { PLANNED, IN_PROGRESS, ON_HOLD, COMPLETED, CLOSED, CANCELLED } = ProjectStatus;

const PROJECTS: ProjectSeed[] = [
    { name: '누리온저축은행 인터넷뱅킹 고도화', client: 'nurion', status: CLOSED, start: '2025-01-06', end: '2025-09-30', kind: 'si', teams: [ '개발1팀', '정보보안팀' ], size: 9, amount: 480 * MILLION,
        modules: [ '계좌 조회', '이체', '예적금', '대출 신청', '공인인증 대체' ], summary: '노후화된 인터넷뱅킹을 웹 표준 기반으로 재구축하고 간편 인증을 도입하는 사업',
        partners: [ { client: 'pixelhouse', scope: '인터넷뱅킹 UI/UX 설계 및 퍼블리싱', amount: 42 * MILLION }, { client: 'securenode', scope: '오픈 전 모의해킹 및 취약점 진단', amount: 18 * MILLION } ] },
    { name: '미르마켓 통합 주문관리시스템(OMS) 구축', client: 'mir', status: CLOSED, start: '2025-02-03', end: '2025-10-31', kind: 'si', teams: [ '개발2팀', '인프라팀' ], size: 8, amount: 360 * MILLION,
        modules: [ '주문 수집', '재고 할당', '배송 연동', '클레임 처리' ], summary: '판매 채널별로 흩어진 주문을 한곳에서 처리하는 통합 주문관리시스템 구축',
        partners: [ { client: 'codebridge', scope: '택배사·오픈마켓 연동 모듈 개발', amount: 55 * MILLION } ] },
    { name: '온새미로테크 사내 포털 구축', client: 'onsaemiro', status: CLOSED, start: '2025-03-03', end: '2025-08-29', kind: 'si', teams: [ '개발2팀' ], size: 4, amount: 80 * MILLION,
        modules: [ '공지사항', '전자결재 연동', '조직도' ], summary: '임직원 대상 사내 포털 구축 (거래처는 2026년 폐업)' },
    { name: '한결정밀공업 MES 고도화', client: 'hangyeol', status: COMPLETED, start: '2025-06-02', end: '2026-02-27', kind: 'si', teams: [ '개발2팀', '인프라팀' ], size: 10, amount: 520 * MILLION,
        modules: [ '작업 지시', '공정 실적', '품질 검사', '설비 모니터링', '생산 리포트' ], summary: '안산·아산 공장의 생산 실적을 실시간으로 수집하는 MES 고도화 사업', overCategory: '장비비',
        partners: [ { client: 'netflowsys', scope: '공장 네트워크 및 산업용 단말 공급·설치', amount: 68 * MILLION }, { client: 'qalab', scope: '통합 테스트 및 현장 인수 테스트 지원', amount: 24 * MILLION } ] },
    { name: '서린의료재단 EMR 연계 플랫폼 구축', client: 'seorin', status: COMPLETED, start: '2025-07-01', end: '2026-03-31', kind: 'si', teams: [ '개발1팀', '정보보안팀' ], size: 11, amount: 640 * MILLION,
        modules: [ '환자 정보 연계', '진료 예약', '검사 결과 조회', '처방 연계', '통합 로그인' ], summary: '병원 3개소의 EMR을 표준 인터페이스로 연계하는 플랫폼 구축',
        partners: [ { client: 'dataroot', scope: '병원별 환자 마스터 데이터 정제 및 이관', amount: 62 * MILLION }, { client: 'devwave', scope: '환자용 모바일 앱 개발', amount: 74 * MILLION } ] },
    { name: '다온에듀 LMS 클라우드 전환', client: 'daon', status: COMPLETED, start: '2025-10-01', end: '2026-04-30', kind: 'infra', teams: [ '인프라팀', '개발2팀' ], size: 7, amount: 280 * MILLION,
        modules: [ '웹 서버', '동영상 스트리밍', '데이터베이스', '배치 서버' ], summary: '온프레미스 LMS를 퍼블릭 클라우드로 전환해 수강 신청 피크 대응력을 확보',
        partners: [ { client: 'cloudforest', scope: '클라우드 설계 검토 및 전환 기술 지원', amount: 46 * MILLION } ] },
    { name: '가람시설공단 통합 홈페이지 웹 접근성 개선', client: 'garam', status: COMPLETED, start: '2026-01-05', end: '2026-05-29', kind: 'si', teams: [ '개발2팀' ], size: 5, amount: 120 * MILLION,
        modules: [ '메인 페이지', '민원 신청', '시설 안내' ], summary: '웹 접근성 인증 취득을 위한 통합 홈페이지 개선 사업',
        partners: [ { client: 'pixelhouse', scope: '웹 접근성 진단 및 퍼블리싱 개선', amount: 28 * MILLION } ] },
    { name: '세온라이프 차세대 보험 청약 시스템 구축', client: 'seon', status: IN_PROGRESS, start: '2026-02-02', end: '2027-03-31', kind: 'si', teams: [ '개발1팀', '개발2팀', '인프라팀', '정보보안팀' ], size: 16, amount: 1850 * MILLION,
        modules: [ '상품 설계', '청약 입력', '언더라이팅', '전자서명', '계약 관리', '수납 연계' ], summary: '설계사·고객 채널의 청약 업무를 통합하는 차세대 시스템 구축 주사업', removedMember: true,
        partners: [ { client: 'codebridge', scope: '계약 관리·수납 연계 모듈 개발', amount: 210 * MILLION }, { client: 'devwave', scope: '설계사용 태블릿 앱 개발', amount: 145 * MILLION }, { client: 'dataroot', scope: '기존 계약 데이터 정제 및 이관', amount: 88 * MILLION } ],
        extras: [ { title: '세온라이프 전자서명 고도화 변경 요청', amount: 120 * MILLION, date: '2026-08-17', status: 'CONFIRMED', sales: [ { title: '변경 요청 착수금', percent: 50, date: '2026-08-31' }, { title: '변경 요청 잔금', percent: 50, date: '2027-01-29' } ] } ] },
    { name: '그린로드물류 WMS·TMS 통합 플랫폼 구축', client: 'greenroad', status: IN_PROGRESS, start: '2026-03-03', end: '2026-12-31', kind: 'si', teams: [ '개발2팀', '인프라팀' ], size: 10, amount: 780 * MILLION,
        modules: [ '입고 관리', '재고 관리', '출고 관리', '배차 관리', '운송 추적' ], summary: '창고관리(WMS)와 운송관리(TMS)를 하나의 플랫폼으로 통합', overCategory: '출장·교통비', removedMember: true,
        partners: [ { client: 'codebridge', scope: '배차 최적화 모듈 개발 (계약 해지)', amount: 60 * MILLION, removedAt: '2026-07-15' }, { client: 'devwave', scope: '현장 작업자용 PDA 앱 개발', amount: 92 * MILLION }, { client: 'netflowsys', scope: '물류센터 무선망 및 PDA 단말 공급', amount: 58 * MILLION } ],
        extras: [ { title: '그린로드물류 냉장 창고 기능 추가', amount: 45 * MILLION, date: '2026-11-10', status: 'DRAFT' } ] },
    { name: '누리온저축은행 오픈뱅킹 API 게이트웨이 구축', client: 'nurion', status: IN_PROGRESS, start: '2026-05-04', end: '2026-12-18', kind: 'si', teams: [ '개발1팀', '정보보안팀' ], size: 7, amount: 340 * MILLION,
        modules: [ 'API 인증', '트래픽 제어', '거래 로그', '제휴사 관리' ], summary: '오픈뱅킹 제휴 확대에 대비한 API 게이트웨이 구축',
        partners: [ { client: 'securenode', scope: 'API 보안 진단', amount: 22 * MILLION } ],
        unquotedSale: { title: '긴급 장애 대응 기술지원', amount: 8 * MILLION, date: '2026-09-15', memo: '계약 외 긴급 지원 건 (별도 합의)' } },
    { name: '청람에너지 ESG 데이터 통합 관리 시스템', client: 'cheongram', status: IN_PROGRESS, start: '2026-04-01', end: '2027-01-29', kind: 'si', teams: [ '개발2팀', '전략기획팀' ], size: 8, amount: 410 * MILLION,
        modules: [ '탄소 배출량 수집', '지표 관리', '공시 보고서', '협력사 평가' ], summary: 'ESG 공시 의무화에 대응하는 사업장별 데이터 통합 관리 시스템',
        partners: [ { client: 'dataroot', scope: '사업장별 배출량 이력 데이터 정제', amount: 36 * MILLION } ] },
    { name: '아라항만운영공단 클라우드 인프라 전환', client: 'ara', status: IN_PROGRESS, start: '2026-06-01', end: '2026-12-31', kind: 'infra', teams: [ '인프라팀', '정보보안팀' ], size: 8, amount: 560 * MILLION,
        modules: [ '항만 운영 시스템', '대민 서비스', '내부 업무 시스템', '백업 체계' ], summary: '노후 서버를 공공 클라우드로 전환하고 재해복구 체계를 구축',
        partners: [ { client: 'cloudforest', scope: '공공 클라우드 전환 설계 및 구축', amount: 118 * MILLION }, { client: 'netflowsys', scope: '전용 회선 및 네트워크 장비 구성', amount: 64 * MILLION } ] },
    { name: '서린의료재단 ISMS-P 인증 컨설팅 및 보안 강화', client: 'seorin', status: IN_PROGRESS, start: '2026-07-01', end: '2026-12-24', kind: 'security', teams: [ '정보보안팀' ], size: 6, amount: 190 * MILLION,
        modules: [ '접근 통제', '개인정보 처리', '암호화', '로그 관리' ], summary: 'ISMS-P 인증 취득을 위한 관리체계 수립 및 기술적 보호조치 강화',
        partners: [ { client: 'securenode', scope: '모의해킹 및 기술 취약점 진단', amount: 34 * MILLION } ],
        extras: [ { title: '서린의료재단 임직원 정보보호 교육', amount: 12 * MILLION, date: '2026-09-07', status: 'CONFIRMED', exempt: true, sales: [ { title: '정보보호 교육 용역비', percent: 100, date: '2026-10-30' } ] } ] },
    { name: '미르마켓 AI 상품 추천 엔진 PoC', client: 'mir', status: IN_PROGRESS, start: '2026-09-01', end: '2026-12-31', kind: 'ai', teams: [ '신사업개발팀', '개발1팀' ], size: 6, amount: 150 * MILLION,
        modules: [ '협업 필터링', '콘텐츠 기반 추천', '실시간 개인화' ], summary: '구매 이력 기반 추천 모델의 효과를 검증하는 개념 검증 사업' },
    { name: '코드브릿지 사내 ERP 연간 유지보수', client: 'codebridge', status: IN_PROGRESS, start: '2026-01-02', end: '2026-12-31', kind: 'maintenance', teams: [ '고객지원팀', '개발2팀' ], size: 5, amount: 96 * MILLION,
        modules: [ '회계 모듈', '인사 모듈' ], summary: '코드브릿지 사내 ERP의 2026년 연간 유지보수 계약 (월 정액)' },
    { name: '사내 그룹웨어 고도화', client: null, status: IN_PROGRESS, start: '2026-01-05', end: '2026-12-31', kind: 'internal', teams: [ '경영기획팀', '개발2팀', '인사팀' ], size: 8, amount: 150 * MILLION,
        modules: [ '전자결재 개선', '근태 연동', '모바일 대응' ], summary: '전사 업무 효율화를 위한 내부 투자 과제 (매출 없음)' },
    { name: '로운모빌리티 차량 관제 플랫폼 구축', client: 'rowoon', status: ON_HOLD, start: '2026-03-16', end: '2026-12-31', kind: 'si', teams: [ '개발1팀', '인프라팀' ], size: 7, amount: 430 * MILLION, holdDate: '2026-08-31',
        modules: [ '차량 위치 수집', '운행 이력', '이상 감지', '관제 대시보드' ], summary: '발주처 투자 유치 지연으로 2026년 9월부터 보류 중인 차량 관제 플랫폼',
        partners: [ { client: 'devwave', scope: '운전자용 모바일 앱 개발', amount: 52 * MILLION } ] },
    { name: '하늘빛항공서비스 예약 시스템 리뉴얼', client: 'haneulbit', status: CANCELLED, start: '2026-01-12', end: '2026-09-30', kind: 'si', teams: [ '개발2팀' ], size: 5, amount: 260 * MILLION, holdDate: '2026-03-20',
        modules: [ '항공편 조회', '예약 결제', '탑승권 발급' ], summary: '발주처 사정으로 2026년 3월 계약 해지된 예약 시스템 리뉴얼' },
    { name: '한결정밀공업 스마트팩토리 2단계', client: 'hangyeol', status: PLANNED, start: '2027-01-04', end: '2027-09-30', kind: 'si', teams: [ '개발2팀', '인프라팀' ], size: 6, amount: 690 * MILLION,
        modules: [ '설비 예지 보전', '디지털 트윈', '에너지 모니터링' ], summary: 'MES 고도화 후속 사업. 2027년 1월 착수 예정으로 견적 협의 중' },
    { name: '다온에듀 AI 튜터 서비스 개발', client: 'daon', status: PLANNED, start: '2027-02-01', end: '2027-08-31', kind: 'ai', teams: [ '신사업개발팀', '개발1팀' ], size: 5, amount: 240 * MILLION,
        modules: [ '학습 진단', '문제 추천', '대화형 튜터' ], summary: '학습 이력 기반 AI 튜터 서비스. 제안 단계' },
];

// ── 과제 템플릿 ─────────────────────────────────────────────────────────
type TaskTemplate = { title: string; description: string };
const task = ( title: string, description: string ): TaskTemplate => ({ title, description: `<p>${description}</p>` });

function taskTemplates( p: ProjectSeed ): TaskTemplate[] {
    const dev = p.modules.flatMap( ( m ) => [
        task( `${m} API 개발`, `${m} 기능의 백엔드 API를 구현하고 단위 테스트를 작성한다.` ),
        task( `${m} 화면 개발`, `화면 설계서 기준으로 ${m} 화면을 개발하고 API와 연동한다.` ),
    ] );
    switch ( p.kind ) {
        case 'infra':
            return [
                task( '착수 보고 및 WBS 확정', '사업 범위와 일정을 확정하고 착수 보고회를 진행한다.' ),
                task( '현행 인프라 자산 조사', '서버·스토리지·네트워크 자산과 시스템 간 의존 관계를 조사한다.' ),
                task( '목표 아키텍처 설계', '가용성과 비용을 고려한 클라우드 목표 아키텍처를 설계한다.' ),
                task( '네트워크·VPC 설계', '망 분리 기준에 맞춰 VPC, 서브넷, 보안 그룹을 설계한다.' ),
                task( 'IAM 권한 체계 수립', '운영자 역할별 최소 권한 정책을 정의한다.' ),
                task( '랜딩존 구성', '공통 계정, 로깅, 네트워크 기반을 구성한다.' ),
                ...p.modules.map( ( m ) => task( `${m} 전환`, `${m}을(를) 대상 환경으로 전환하고 기능을 검증한다.` ) ),
                task( '통합 모니터링 구축', '지표·로그·알람을 통합 대시보드로 구성한다.' ),
                task( '재해복구(DR) 훈련', '복구 목표 시간을 기준으로 재해복구 절차를 훈련한다.' ),
                task( '성능 부하 테스트', '피크 트래픽 기준으로 부하 테스트를 수행하고 튜닝한다.' ),
                task( '전환 리허설', '본 전환 절차를 리허설하고 소요 시간을 측정한다.' ),
                task( '본 전환 수행', '전환 계획에 따라 운영 서비스를 전환한다.' ),
                task( '안정화 지원', '전환 후 장애 모니터링과 후속 조치를 수행한다.' ),
                task( '운영 매뉴얼 및 완료 보고', '운영 매뉴얼을 인계하고 완료 보고를 진행한다.' ),
            ];
        case 'security':
            return [
                task( '착수 보고 및 인증 범위 확정', '인증 범위와 일정, 수행 조직을 확정한다.' ),
                task( '정보자산 식별 및 분류', '인증 범위 내 정보자산을 식별하고 중요도를 평가한다.' ),
                task( '개인정보 흐름도 작성', '수집부터 파기까지 개인정보 처리 흐름을 문서화한다.' ),
                task( '위험 평가 수행', '자산별 위협과 취약점을 분석해 위험도를 산정한다.' ),
                ...p.modules.map( ( m ) => task( `${m} 통제 항목 점검`, `${m} 관련 인증 기준 충족 여부를 점검한다.` ) ),
                task( '정보보호 대책 수립', '위험 평가 결과에 따른 이행 계획을 수립한다.' ),
                task( '모의해킹 수행', '주요 서비스 대상 모의해킹을 수행한다.' ),
                task( '취약점 조치 확인', '발견된 취약점의 조치 결과를 재점검한다.' ),
                task( '내부 감사 수행', '인증 심사 전 내부 감사를 수행한다.' ),
                task( '증적 자료 정리', '인증 항목별 운영 증적을 정리한다.' ),
                task( '인증 심사 대응', '심사원 질의와 보완 조치에 대응한다.' ),
                task( '완료 보고', '수행 결과와 후속 과제를 보고한다.' ),
            ];
        case 'ai':
            return [
                task( '착수 보고 및 성공 지표 정의', '검증 범위와 성공 지표를 정의한다.' ),
                task( '데이터 수집 및 품질 점검', '학습에 필요한 원천 데이터를 수집하고 품질을 점검한다.' ),
                task( '탐색적 데이터 분석', '데이터 분포와 특징을 분석해 모델링 방향을 정한다.' ),
                task( '피처 엔지니어링', '모델 입력 피처를 설계하고 파이프라인을 구성한다.' ),
                ...p.modules.map( ( m ) => task( `${m} 모델 개발`, `${m} 모델을 학습하고 성능을 측정한다.` ) ),
                task( '오프라인 성능 평가', '기준 모델과 비교해 오프라인 지표를 평가한다.' ),
                task( '모델 서빙 API 개발', '추론 결과를 제공하는 API를 개발한다.' ),
                task( 'A/B 테스트 설계 및 수행', '실사용 트래픽 일부로 효과를 검증한다.' ),
                task( 'PoC 결과 보고', '검증 결과와 본 사업 추진 방향을 보고한다.' ),
            ];
        case 'maintenance':
            return monthsBetween( p.start, p.end ).flatMap( ( m ) => {
                const month = Number( m.slice( 5 ) );
                return [
                    task( `${month}월 정기 점검`, '서버 상태, 배치 수행 결과, 디스크 사용량을 점검한다.' ),
                    task( `${month}월 운영 보고서 제출`, '장애·요청 처리 현황을 정리해 월간 보고서를 제출한다.' ),
                ];
            } );
        default:
            return [
                task( '착수 보고 및 WBS 확정', '사업 범위·일정·수행 조직을 확정하고 착수 보고회를 진행한다.' ),
                task( '현행 시스템 분석', '현행 업무와 시스템 구조를 분석해 개선 과제를 도출한다.' ),
                task( '요구사항 정의서 작성', '업무 담당자 인터뷰를 바탕으로 요구사항을 정의한다.' ),
                task( '요구사항 추적표 확정', '요구사항과 산출물의 추적 관계를 확정한다.' ),
                task( '아키텍처 설계', '시스템 구성과 기술 스택, 비기능 요구사항 대응 방안을 설계한다.' ),
                task( 'DB 설계 (ERD)', '논리·물리 데이터 모델을 설계한다.' ),
                task( '화면 설계서 작성', '주요 화면의 흐름과 UI를 설계한다.' ),
                task( '인터페이스 정의서 작성', '대외·대내 시스템 연계 항목을 정의한다.' ),
                ...dev,
                task( '단위 테스트 결과 정리', '모듈별 단위 테스트 결과와 결함 조치 내역을 정리한다.' ),
                task( '통합 테스트', '업무 시나리오 기준으로 통합 테스트를 수행한다.' ),
                task( '성능 테스트', '목표 응답 시간과 동시 사용자 기준으로 성능을 검증한다.' ),
                task( '보안 취약점 점검', '소스 코드와 웹 취약점을 점검하고 조치한다.' ),
                task( '사용자 인수 테스트(UAT)', '현업 담당자와 인수 테스트를 진행한다.' ),
                task( '데이터 이관 리허설', '이관 절차를 리허설하고 정합성을 검증한다.' ),
                task( '운영 환경 배포', '운영 환경을 구성하고 시스템을 배포한다.' ),
                task( '사용자 교육 및 매뉴얼 제공', '사용자·운영자 교육을 진행하고 매뉴얼을 제공한다.' ),
                task( '완료 보고', '수행 결과를 보고하고 산출물을 인계한다.' ),
            ];
    }
}

// ── 견적 품목 ───────────────────────────────────────────────────────────
const ROLE_ITEMS: Record<ProjectKind, [ string, string, number, number ][]> = { // 품목명, 규격, 비중, 단가
    si: [ [ '프로젝트 관리 (PM)', '특급 기술자 / M/M', 0.12, 12_000_000 ], [ '아키텍트·개발 리드', '고급 기술자 / M/M', 0.3, 9_500_000 ], [ '응용 개발', '중급 기술자 / M/M', 0.3, 7_500_000 ], [ '응용 개발 지원', '초급 기술자 / M/M', 0.12, 5_500_000 ], [ 'UI/UX 설계', '중급 디자이너 / M/M', 0.06, 6_500_000 ], [ '품질 관리 (QA)', '중급 기술자 / M/M', 0.06, 6_000_000 ] ],
    infra: [ [ '클라우드 아키텍트', '특급 기술자 / M/M', 0.2, 12_500_000 ], [ '인프라 엔지니어', '고급 기술자 / M/M', 0.34, 9_000_000 ], [ '전환 엔지니어', '중급 기술자 / M/M', 0.24, 7_500_000 ], [ '클라우드 사용료 (구축 기간)', '월 / 식', 0.12, 4_000_000 ], [ '모니터링 솔루션 라이선스', '연간 / 식', 0.06, 8_000_000 ] ],
    security: [ [ '인증 컨설팅 총괄', '특급 컨설턴트 / M/M', 0.26, 13_000_000 ], [ '관리체계 컨설팅', '고급 컨설턴트 / M/M', 0.36, 10_000_000 ], [ '기술적 보호조치 점검', '중급 컨설턴트 / M/M', 0.26, 8_000_000 ], [ '진단 도구 사용료', '기간 / 식', 0.06, 3_000_000 ] ],
    ai: [ [ '데이터 사이언티스트', '특급 기술자 / M/M', 0.3, 13_000_000 ], [ 'ML 엔지니어', '고급 기술자 / M/M', 0.34, 10_500_000 ], [ '데이터 엔지니어', '중급 기술자 / M/M', 0.2, 8_000_000 ], [ 'GPU 서버 사용료', '월 / 식', 0.1, 3_500_000 ] ],
    maintenance: [],
    internal: [],
};

function quoteItems( p: ProjectSeed, amount: number ): QuoteItemInput[] {
    if ( p.kind === 'maintenance' ) {
        const months = monthsBetween( p.start, p.end ).length;
        return [ { name: '사내 ERP 유지보수 (월 정액)', spec: '2026년 1월 ~ 12월', quantity: months, unitPrice: Math.floor( amount / months ) } ];
    }
    const items: QuoteItemInput[] = ROLE_ITEMS[p.kind].map( ( [ name, spec, share, unitPrice ] ) => ({
        name, spec, unitPrice, quantity: Math.max( 1, Math.floor( amount * share / unitPrice ) ),
    }) );
    const used = items.reduce( ( sum, i ) => sum + i.quantity * i.unitPrice, 0 );
    if ( amount > used ) items.push({ name: '기술 지원 및 하자 보수', spec: '1식', quantity: 1, unitPrice: amount - used });
    return items;
}

function extraQuoteItems( title: string, amount: number, exempt?: boolean ): QuoteItemInput[] {
    if ( exempt ) return [ { name: '임직원 정보보호 교육', spec: '4회 / 회차', quantity: 4, unitPrice: Math.floor( amount / 4 ) } ];
    const unitPrice = 9_500_000;
    const quantity = Math.floor( amount / unitPrice );
    const items: QuoteItemInput[] = [ { name: '추가 개발', spec: '고급 기술자 / M/M', quantity, unitPrice, note: title } ];
    if ( amount > quantity * unitPrice ) items.push({ name: '품질 관리 및 기술 지원', spec: '1식', quantity: 1, unitPrice: amount - quantity * unitPrice });
    return items;
}

// ── 회원 배정 ───────────────────────────────────────────────────────────
interface Person { id: number; empNo: string; name: string; joinAt: string; department: string; title: string | null; position: string | null }

class Staffing {
    private readonly queues = new Map<string, Person[]>();
    readonly leaders = new Map<string, Person>();

    constructor( people: Person[] ){
        for ( const person of people ) {
            if ( person.title === '팀장' ) { this.leaders.set( person.department, person ); continue; }
            if ( person.title !== '팀원' || person.position === '인턴' ) continue;
            this.queues.set( person.department, [ ...( this.queues.get( person.department ) ?? [] ), person ] );
        }
        for ( const [ dept, list ] of this.queues ) this.queues.set( dept, shuffled( list ) );
    }

    // 순서대로 돌아가며 뽑아 특정 회원에게 프로젝트가 몰리지 않게 한다 (프로젝트 시작 전 입사자는 제외)
    take( department: string, count: number, start: string, used: Set<number>, positions?: string[] ){
        const queue = this.queues.get( department ) ?? [];
        const picked: Person[] = [];
        for ( let i = 0; i < queue.length && picked.length < count; ) {
            const person = queue[i];
            const ok = !used.has( person.id ) && person.joinAt <= start && ( !positions || positions.includes( person.position ?? '' ) );
            if ( !ok ) { i++; continue; }
            picked.push( person );
            used.add( person.id );
            queue.splice( i, 1 );
            queue.push( person );
        }
        return picked;
    }
}

interface MemberPlan { person: Person; role: ProjectMemberRole; removedAt?: string }

function planMembers( p: ProjectSeed, staffing: Staffing ){
    const used = new Set<number>();
    const members: MemberPlan[] = [];
    const add = ( person: Person | undefined, role: ProjectMemberRole ) => {
        if ( !person ) return;
        used.add( person.id );
        members.push({ person, role });
    };

    // 책임자: 주관 팀 팀장 + PM (차장·과장)
    const lead = p.teams[0];
    const leader = staffing.leaders.get( lead );
    if ( leader && leader.joinAt <= p.start ) add( leader, ProjectMemberRole.MANAGER );
    for ( const pm of staffing.take( lead, 1, p.start, used, [ '차장', '과장' ] ) ) add( pm, ProjectMemberRole.MANAGER );

    // 영업 담당 (외부 사업만)
    if ( p.client ) for ( const sales of staffing.take( '영업팀', 1, p.start, used ) ) add( sales, ProjectMemberRole.MEMBER );

    // 나머지는 주관 팀에 절반, 참여 팀에 고르게
    const others = p.teams.slice( 1 );
    for ( let turn = 0; members.length < p.size && turn < p.size * 3; turn++ ) {
        const team = turn % 2 === 0 || others.length === 0 ? lead : others[ ( ( turn - 1 ) / 2 ) % others.length ];
        for ( const person of staffing.take( team, 1, p.start, used ) ) add( person, ProjectMemberRole.MEMBER );
    }

    // 중간에 다른 프로젝트로 옮겨 빠진 참여자
    let removed: MemberPlan | null = null;
    if ( p.removedMember ) {
        const [ person ] = staffing.take( lead, 1, p.start, used );
        if ( person ) removed = { person, role: ProjectMemberRole.MEMBER, removedAt: minDate( addDays( p.start, 120 ), addDays( TODAY, -30 ) ) };
    }
    return { members, removed };
}

// ── 과제 계획 ───────────────────────────────────────────────────────────
interface TaskPlan { title: string; description: string; status: ProjectTaskStatus; assigneeId: number | null; dueDate: string; sortOrder: number }

function planTasks( p: ProjectSeed, members: MemberPlan[], removed: MemberPlan | null ){
    let templates = taskTemplates( p );
    if ( p.status === PLANNED ) templates = templates.slice( 0, 6 ); // 착수 전: 초반 과제만 등록

    const salesIds = new Set( members.filter( ( m ) => m.person.department === '영업팀' ).map( ( m ) => m.person.id ) );
    const workers = members.filter( ( m ) => !salesIds.has( m.person.id ) ).map( ( m ) => m.person.id );
    const duration = dayDiff( p.start, p.end );
    const counters: Record<ProjectTaskStatus, number> = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };

    const statusOf = ( due: string ): ProjectTaskStatus => {
        if ( p.status === COMPLETED || p.status === CLOSED ) return ProjectTaskStatus.DONE;
        if ( p.status === PLANNED ) return ProjectTaskStatus.TODO;
        if ( p.status === ON_HOLD || p.status === CANCELLED ) return due <= p.holdDate! ? ProjectTaskStatus.DONE : ProjectTaskStatus.TODO;
        if ( due < addDays( TODAY, -30 ) ) return ProjectTaskStatus.DONE;
        if ( due < TODAY ) return chance( 0.75 ) ? ProjectTaskStatus.DONE : ProjectTaskStatus.IN_PROGRESS; // 최근 마감 일부는 일정 지연
        if ( due <= addDays( TODAY, 21 ) ) return chance( 0.7 ) ? ProjectTaskStatus.IN_PROGRESS : ProjectTaskStatus.TODO;
        return ProjectTaskStatus.TODO;
    };

    const tasks: TaskPlan[] = templates.map( ( t, i ) => {
        const fraction = p.status === PLANNED ? ( i + 1 ) / 12 : ( i + 1 ) / templates.length;
        const dueDate = workdayOnOrBefore( addDays( p.start, Math.floor( duration * fraction ) ) );
        const status = statusOf( dueDate );
        const unassigned = status === ProjectTaskStatus.TODO && chance( 0.15 );
        return {
            ...t, status, dueDate,
            assigneeId: unassigned || workers.length === 0 ? null : workers[ i % workers.length ],
            sortOrder: counters[status]++,
        };
    } );

    // 빠진 참여자가 맡고 있던 미완료 과제 → 화면의 "담당자 부재"
    if ( removed ) tasks.filter( ( t ) => t.status !== ProjectTaskStatus.DONE ).slice( 0, 2 ).forEach( ( t ) => { t.assigneeId = removed.person.id; } );
    return tasks;
}

// ── 협력사·지출 ─────────────────────────────────────────────────────────
interface ExpensePlan { category: string; partner?: PartnerSeed; title: string; date: string; taxType: ProjectQuoteTaxType; supply: number; memo?: string }

const stopDateOf = ( p: ProjectSeed ) => {
    if ( p.status === PLANNED ) return null;
    if ( p.status === COMPLETED || p.status === CLOSED ) return p.end;
    if ( p.status === ON_HOLD || p.status === CANCELLED ) return p.holdDate!;
    return minDate( TODAY, p.end );
};

const EXPENSE_TITLES: Record<string, string[]> = {
    '장비비': [ '개발 서버 임차료', '테스트 단말 구매', '네트워크 장비 임차', '스토리지 증설' ],
    '소프트웨어·라이선스': [ 'IDE 라이선스', 'APM 모니터링 구독', '형상 관리 도구 구독', '테스트 자동화 도구 라이선스' ],
    '출장·교통비': [ '고객사 현장 출장 교통비', '지방 사업장 출장 숙박비', '현장 실사 출장비' ],
    '회의·식대': [ '고객사 정기 회의 다과', '주간 보고 회의 식대', '프로젝트 마일스톤 회식비' ],
    '기타 경비': [ '산출물 제본·인쇄비', '퀵서비스 이용료', '사무용품 구매' ],
};
const BUDGET_SHARES: Record<string, number> = { '장비비': 0.08, '소프트웨어·라이선스': 0.07, '출장·교통비': 0.05, '회의·식대': 0.03, '기타 경비': 0.03 };

function planBudgets( p: ProjectSeed ){
    const partnerTotal = ( p.partners ?? [] ).filter( ( x ) => !x.removedAt ).reduce( ( sum, x ) => sum + x.amount, 0 );
    const cost = floorTo( p.amount * ( 0.72 + random() * 0.08 ), 100_000 );
    const rest = Math.max( cost - partnerTotal, floorTo( cost * 0.4, 100_000 ) );
    const budgets = new Map<string, number>();
    for ( const [ name, share ] of Object.entries( BUDGET_SHARES ) ) budgets.set( name, floorTo( rest * ( p.kind === 'infra' && name === '장비비' ? share * 2 : share ), 100_000 ) );
    const others = [ ...budgets.values() ].reduce( ( sum, v ) => sum + v, 0 );
    budgets.set( '인건비', rest - others );
    if ( partnerTotal > 0 ) budgets.set( '외주비', partnerTotal );
    return budgets;
}

function planExpenses( p: ProjectSeed, budgets: Map<string, number> ){
    const stop = stopDateOf( p );
    if ( !stop ) return [];
    const finished = p.status === COMPLETED || p.status === CLOSED;
    const progress = Math.min( 1, Math.max( 0, dayDiff( p.start, stop ) / Math.max( 1, dayDiff( p.start, p.end ) ) ) );
    const months = monthsBetween( p.start, stop );
    const expenses: ExpensePlan[] = [];
    const dateIn = ( month: string, day: number ) => {
        const date = workdayOnOrBefore( `${month}-${pad( day )}` );
        return date >= p.start && date <= stop ? date : null;
    };

    // 외주비: 계약금 30 · 중도금 40 · 잔금 30 (지난 일정만, 계약 해지 협력사는 해지 전까지)
    for ( const partner of p.partners ?? [] ) {
        const mid = addDays( p.start, Math.floor( dayDiff( p.start, p.end ) / 2 ) );
        const stages: [ string, number, string ][] = [ [ '착수금', 30, addDays( p.start, 14 ) ], [ '중도금', 40, mid ], [ '잔금', 30, addDays( p.end, -7 ) ] ];
        for ( const [ label, percent, date ] of stages ) {
            const paidOn = workdayOnOrBefore( date );
            if ( paidOn > stop || ( partner.removedAt && paidOn > partner.removedAt ) ) continue;
            expenses.push({ category: '외주비', partner, title: `${clientName( partner.client )} 외주비 ${label}`, date: paidOn, taxType: ProjectQuoteTaxType.TAXABLE, supply: partner.amount * percent / 100 });
        }
    }

    // 인건비: 매월 내부 정산 (부가세 없음)
    const laborTarget = floorTo( ( budgets.get( '인건비' ) ?? 0 ) * ( finished ? 0.92 + random() * 0.08 : progress * ( 0.9 + random() * 0.12 ) ), 10_000 );
    const laborDates = months.map( ( m ) => ({ month: m, date: dateIn( m, 25 ) }) ).filter( ( x ): x is { month: string; date: string } => x.date !== null );
    let laborLeft = laborTarget;
    laborDates.forEach( ( { month, date }, i ) => {
        const share = i === laborDates.length - 1 ? laborLeft : floorTo( ( laborTarget / laborDates.length ) * ( 0.88 + random() * 0.24 ), 10_000 );
        const supply = Math.min( share, laborLeft );
        laborLeft -= supply;
        if ( supply > 0 ) expenses.push({ category: '인건비', title: `${Number( month.slice( 0, 4 ) )}년 ${Number( month.slice( 5 ) )}월 투입 인건비`, date, taxType: ProjectQuoteTaxType.EXEMPT, supply, memo: '내부 인력 투입 공수 정산' });
    } );

    // 나머지 항목: 항목별 목표액을 여러 건으로 나눈다
    for ( const name of Object.keys( EXPENSE_TITLES ) ) {
        const budget = budgets.get( name ) ?? 0;
        const over = p.overCategory === name;
        const target = floorTo( budget * ( over ? 1.18 : finished ? 0.85 + random() * 0.14 : progress * ( 0.8 + random() * 0.2 ) ), 10_000 );
        if ( target <= 0 ) continue;
        const count = Math.min( months.length, name === '장비비' || name === '소프트웨어·라이선스' ? randInt( 2, 4 ) : randInt( 3, 8 ), Math.floor( target / 10_000 ) );
        const chosen = shuffled( months ).slice( 0, Math.max( 1, count ) ).sort();
        const weights = chosen.map( () => 0.6 + random() );
        const totalWeight = weights.reduce( ( sum, w ) => sum + w, 0 );
        let left = target;
        chosen.forEach( ( month, i ) => {
            const date = dateIn( month, randInt( 3, 27 ) ) ?? workdayOnOrBefore( minDate( stop, `${month}-28` ) );
            const supply = i === chosen.length - 1 ? left : Math.min( left, floorTo( target * weights[i] / totalWeight, 10_000 ) );
            left -= supply;
            if ( supply > 0 && date >= p.start ) expenses.push({ category: name, title: pick( EXPENSE_TITLES[name] ), date, taxType: ProjectQuoteTaxType.TAXABLE, supply, memo: over && i === chosen.length - 1 ? '현장 대응 증가로 예산 초과' : undefined });
        } );
    }
    return expenses;
}

// ── 견적·매출 계획 ──────────────────────────────────────────────────────
interface VersionPlan { version: number; status: ProjectQuoteStatus; quoteDate: string; validUntil: string; items: QuoteItemInput[]; taxType: ProjectQuoteTaxType; note?: string; confirmedDate?: string; cancelledDate?: string }
interface QuotePlan { project: ProjectSeed; title: string; versions: VersionPlan[]; quoteNo?: string }
interface PaymentPlan { paidDate: string; amount: Prisma.Decimal; memo?: string }
interface SalePlan { title: string; version: VersionPlan | null; status: ProjectSaleStatus; taxType: ProjectQuoteTaxType; supply: number; plannedDate: string | null; billedDate: string | null; invoiceNo: string | null; memo?: string; cancelledDate?: string; payments: PaymentPlan[] }

const invoiceNo = ( date: string ) => `${date.replaceAll( '-', '' )}-41000000-${pad( randInt( 10_000_000, 99_999_999 ), 8 )}`;

function planQuotes( p: ProjectSeed ){
    if ( !p.client ) return [];
    const quotes: QuotePlan[] = [];
    const firstDate = minDate( workdayOnOrBefore( addDays( p.start, -35 ) ), workdayOnOrBefore( addDays( TODAY, -20 ) ) );
    const finalDate = minDate( workdayOnOrBefore( addDays( p.start, -14 ) ), workdayOnOrBefore( addDays( TODAY, -6 ) ) );
    const finalStatus = p.status === PLANNED ? ProjectQuoteStatus.DRAFT : p.status === CANCELLED ? ProjectQuoteStatus.CANCELLED : ProjectQuoteStatus.CONFIRMED;
    const lifecycle = {
        confirmedDate: finalStatus === ProjectQuoteStatus.DRAFT ? undefined : workdayOnOrBefore( addDays( finalDate, 5 ) ),
        cancelledDate: finalStatus === ProjectQuoteStatus.CANCELLED ? p.holdDate : undefined,
    };
    const taxType = ProjectQuoteTaxType.TAXABLE;
    const versions: VersionPlan[] = [];
    // 2억 이상은 가격 협상으로 v1 → v2
    if ( p.amount >= 200 * MILLION ) {
        const offered = floorTo( p.amount * 1.07, MILLION );
        versions.push({ version: 1, status: ProjectQuoteStatus.DRAFT, quoteDate: firstDate, validUntil: addDays( firstDate, 30 ), items: quoteItems( p, offered ), taxType, note: '최초 제안 금액' });
        versions.push({ version: 2, status: finalStatus, quoteDate: finalDate, validUntil: addDays( finalDate, 30 ), items: quoteItems( p, p.amount ), taxType, note: '가격 협상 결과 반영', ...lifecycle });
    } else {
        versions.push({ version: 1, status: finalStatus, quoteDate: finalDate, validUntil: addDays( finalDate, 30 ), items: quoteItems( p, p.amount ), taxType, ...lifecycle });
    }
    quotes.push({ project: p, title: p.name, versions });

    for ( const extra of p.extras ?? [] ) {
        quotes.push({ project: p, title: extra.title, versions: [ {
            version: 1, quoteDate: extra.date, validUntil: addDays( extra.date, 30 ),
            status: extra.status === 'CONFIRMED' ? ProjectQuoteStatus.CONFIRMED : ProjectQuoteStatus.DRAFT,
            items: extraQuoteItems( extra.title, extra.amount, extra.exempt ),
            taxType: extra.exempt ? ProjectQuoteTaxType.EXEMPT : ProjectQuoteTaxType.TAXABLE,
            note: extra.exempt ? '교육 용역 (면세)' : '추가 견적',
            confirmedDate: extra.status === 'CONFIRMED' ? workdayOnOrBefore( addDays( extra.date, 3 ) ) : undefined,
        } ] });
    }
    return quotes;
}

const supplyOf = ( v: VersionPlan ) => v.items.reduce( ( sum, i ) => sum + i.quantity * i.unitPrice, 0 );

function saleFrom( p: ProjectSeed, version: VersionPlan | null, title: string, supply: number, date: string, taxType: ProjectQuoteTaxType, memo?: string ): SalePlan {
    const billDate = workdayOnOrBefore( date );
    const stopped = ( p.status === ON_HOLD || p.status === CANCELLED ) && billDate > p.holdDate!;
    if ( stopped || billDate > TODAY ) {
        return { title, version, status: ProjectSaleStatus.PLANNED, taxType, supply, plannedDate: stopped ? null : billDate, billedDate: null, invoiceNo: null, memo: stopped ? '프로젝트 보류로 청구 일정 미정' : memo, payments: [] };
    }
    const total = calcSaleAmounts( supply, taxType )!.totalAmount;
    const payments: PaymentPlan[] = [];
    const due = workdayOnOrBefore( addDays( billDate, randInt( 25, 45 ) ) );
    const heldUnpaid = p.status === ON_HOLD && billDate > addDays( p.holdDate!, -60 ); // 보류 직전 청구분은 미수로 남는다
    if ( !heldUnpaid && due <= TODAY ) {
        if ( billDate >= addDays( TODAY, -90 ) && chance( 0.35 ) ) { // 최근 청구 일부는 부분 수금 상태
            payments.push({ paidDate: due, amount: total.mul( 0.5 ).floor(), memo: '1차 입금 (잔액 입금 예정)' });
        } else if ( chance( 0.2 ) ) { // 두 번에 나눠 입금
            const first = total.mul( 0.6 ).floor();
            payments.push({ paidDate: due, amount: first, memo: '1차 입금' });
            const second = workdayOnOrBefore( addDays( due, 30 ) );
            if ( second <= TODAY ) payments.push({ paidDate: second, amount: total.sub( first ), memo: '2차 입금' });
        } else {
            payments.push({ paidDate: due, amount: total });
        }
    }
    return { title, version, status: ProjectSaleStatus.BILLED, taxType, supply, plannedDate: billDate, billedDate: billDate, invoiceNo: invoiceNo( billDate ), memo, payments };
}

function planSales( p: ProjectSeed, quotes: QuotePlan[] ){
    const sales: SalePlan[] = [];
    const main = quotes[0]?.versions.at( -1 );
    if ( main && main.status !== ProjectQuoteStatus.DRAFT ) {
        const supply = supplyOf( main );
        if ( p.status === CANCELLED ) {
            // 계약금 청구 후 사업 취소 → 청구 취소 (수금 없음)
            const date = workdayOnOrBefore( addDays( p.start, 10 ) );
            sales.push({ title: '계약금', version: main, status: ProjectSaleStatus.CANCELLED, taxType: main.taxType, supply: floorTo( supply * 0.3, MILLION ), plannedDate: date, billedDate: date, invoiceNo: invoiceNo( date ), memo: '사업 취소로 청구 취소', cancelledDate: p.holdDate, payments: [] });
        } else if ( p.kind === 'maintenance' ) {
            const months = monthsBetween( p.start, p.end );
            const monthly = Math.floor( supply / months.length );
            months.forEach( ( month ) => {
                const [ y, m ] = month.split( '-' ).map( Number );
                const lastDay = new Date( Date.UTC( y, m, 0 ) ).getUTCDate();
                sales.push( saleFrom( p, main, `${y}년 ${m}월 유지보수료`, monthly, `${month}-${pad( lastDay )}`, main.taxType ) );
            } );
        } else {
            const span = dayDiff( p.start, p.end );
            const stages: [ string, number, string ][] = p.amount >= 1000 * MILLION
                ? [ [ '계약금', 20, addDays( p.start, 10 ) ], [ '1차 중도금', 30, addDays( p.start, Math.floor( span * 0.35 ) ) ], [ '2차 중도금', 30, addDays( p.start, Math.floor( span * 0.7 ) ) ], [ '잔금', 20, addDays( p.end, 7 ) ] ]
                : [ [ '계약금', 30, addDays( p.start, 10 ) ], [ '중도금', 40, addDays( p.start, Math.floor( span / 2 ) ) ], [ '잔금', 30, addDays( p.end, 7 ) ] ];
            let left = supply;
            stages.forEach( ( [ title, percent, date ], i ) => {
                const amount = i === stages.length - 1 ? left : floorTo( supply * percent / 100, MILLION );
                left -= amount;
                sales.push( saleFrom( p, main, title, amount, date, main.taxType ) );
            } );
        }
    }
    // 추가 견적의 청구
    ( p.extras ?? [] ).forEach( ( extra, index ) => {
        const version = quotes[ index + 1 ]?.versions[0];
        if ( !version || version.status !== ProjectQuoteStatus.CONFIRMED ) return;
        const supply = supplyOf( version );
        let left = supply;
        ( extra.sales ?? [] ).forEach( ( s, i, list ) => {
            const amount = i === list.length - 1 ? left : floorTo( supply * s.percent / 100, MILLION );
            left -= amount;
            sales.push( saleFrom( p, version, s.title, amount, s.date, version.taxType ) );
        } );
    } );
    // 견적 없이 청구한 건
    if ( p.unquotedSale ) sales.push( saleFrom( p, null, p.unquotedSale.title, p.unquotedSale.amount, p.unquotedSale.date, ProjectQuoteTaxType.TAXABLE, p.unquotedSale.memo ) );
    return sales;
}

const clientName = ( key: string ) => CLIENTS.find( ( c ) => c.key === key )!.name;

// ── 실행 ────────────────────────────────────────────────────────────────
async function resetSeedData(){
    const projects = await prisma.project.findMany({ where: { name: { in: PROJECTS.map( ( p ) => p.name ) } }, select: { id: true } });
    const projectIds = projects.map( ( p ) => p.id );
    const clients = await prisma.projectClient.findMany({ where: { businessNo: { in: CLIENTS.map( ( _, i ) => businessNoOf( i ) ) } }, select: { id: true } });
    const clientIds = clients.map( ( c ) => c.id );
    const quotes = await prisma.projectQuote.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    const quoteIds = quotes.map( ( q ) => q.id );
    const sales = await prisma.projectSale.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    await prisma.$transaction([
        prisma.projectSalePayment.deleteMany({ where: { saleId: { in: sales.map( ( s ) => s.id ) } } }),
        prisma.projectSale.deleteMany({ where: { projectId: { in: projectIds } } }),
        prisma.projectQuoteVersion.deleteMany({ where: { quoteId: { in: quoteIds } } }),
        prisma.projectQuote.deleteMany({ where: { id: { in: quoteIds } } }),
        prisma.projectExpense.deleteMany({ where: { projectId: { in: projectIds } } }),
        prisma.projectBudget.deleteMany({ where: { projectId: { in: projectIds } } }),
        prisma.projectPartner.deleteMany({ where: { projectId: { in: projectIds } } }),
        prisma.projectTask.deleteMany({ where: { projectId: { in: projectIds } } }),
        prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } }),
        prisma.project.deleteMany({ where: { id: { in: projectIds } } }),
        prisma.projectClientContact.deleteMany({ where: { clientId: { in: clientIds } } }),
        prisma.projectClient.deleteMany({ where: { id: { in: clientIds } } }),
    ]);
    // 견적번호 채번을 남은 견적의 마지막 번호로 되돌린다
    const remaining = await prisma.projectQuote.findMany({ select: { quoteNo: true } });
    for ( const { year } of await prisma.projectQuoteSequence.findMany() ) {
        const numbers = remaining.filter( ( q ) => q.quoteNo.startsWith( `Q-${year}-` ) ).map( ( q ) => Number( q.quoteNo.slice( -4 ) ) );
        await prisma.projectQuoteSequence.update({ where: { year }, data: { lastNo: Math.max( 0, ...numbers ) } });
    }
    console.log( `--reset: 프로젝트 ${projectIds.length}건, 거래처 ${clientIds.length}건 삭제` );
}

async function main(){
    const url = new URL( process.env.DATABASE_URL ?? '' );
    if ( ![ 'localhost', '127.0.0.1' ].includes( url.hostname ) || url.pathname !== '/intranet' ) throw new Error( `로컬 개발 DB(intranet)에서만 실행합니다: ${url.hostname}${url.pathname}` );
    console.log( `기준일 ${TODAY} (KST)` );

    const existingProjects = await prisma.project.count({ where: { name: { in: PROJECTS.map( ( p ) => p.name ) } } });
    const existingClients = await prisma.projectClient.count({ where: { businessNo: { in: CLIENTS.map( ( _, i ) => businessNoOf( i ) ) } } });
    if ( ( existingProjects > 0 || existingClients > 0 ) && !RESET && !DRY_RUN ) {
        console.log( `이미 만든 데이터가 있어 중단합니다 (프로젝트 ${existingProjects}건, 거래처 ${existingClients}건). 다시 만들려면 --reset` );
        return;
    }
    if ( RESET && !DRY_RUN ) await resetSeedData();

    const categories = await prisma.projectBudgetCategory.findMany({ where: { deleted: false }, select: { id: true, name: true } });
    const categoryId = new Map( categories.map( ( c ) => [ c.name, c.id ] ) );
    for ( const name of [ '인건비', '외주비', ...Object.keys( EXPENSE_TITLES ) ] ) if ( !categoryId.has( name ) ) throw new Error( `비용 항목이 없습니다: ${name}` );

    const users = await prisma.users.findMany({
        where: { deleted: false, status: UserStatus.ACTIVE, role: { in: [ UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN ] }, joinAt: { not: null } },
        select: {
            id: true, empNo: true, name: true, joinAt: true, position: { select: { name: true } },
            departments: { where: { isPrimary: true, deleted: false }, select: { department: { select: { name: true } }, jobTitle: { select: { name: true } } }, take: 1 },
        },
        orderBy: { empNo: 'asc' },
    });
    const people: Person[] = users.filter( ( u ) => u.departments.length > 0 ).map( ( u ) => ({
        id: u.id, empNo: u.empNo, name: u.name, joinAt: u.joinAt!.toISOString().slice( 0, 10 ),
        department: u.departments[0].department.name, title: u.departments[0].jobTitle?.name ?? null, position: u.position?.name ?? null,
    }) );
    const staffing = new Staffing( people );
    const salesLeader = staffing.leaders.get( '영업팀' );
    if ( !salesLeader ) throw new Error( '영업팀 팀장이 없습니다.' );

    // 계획 (저장 전 계산)
    const plans = PROJECTS.map( ( project ) => {
        const { members, removed } = planMembers( project, staffing );
        const tasks = planTasks( project, members, removed );
        const budgets = planBudgets( project );
        const expenses = planExpenses( project, budgets );
        const quotes = planQuotes( project );
        const sales = planSales( project, quotes );
        return { project, members, removed, tasks, budgets, expenses, quotes, sales };
    } );

    // 견적번호: 연도별로 견적일 순서대로 (기존 채번에 이어서)
    const sequences = new Map( ( await prisma.projectQuoteSequence.findMany() ).map( ( s ) => [ s.year, s.lastNo ] ) );
    const allQuotes = plans.flatMap( ( x ) => x.quotes ).sort( ( a, b ) => a.versions[0].quoteDate.localeCompare( b.versions[0].quoteDate ) );
    for ( const quote of allQuotes ) {
        const year = Number( quote.versions[0].quoteDate.slice( 0, 4 ) );
        const next = ( sequences.get( year ) ?? 0 ) + 1;
        sequences.set( year, next );
        quote.quoteNo = `Q-${year}-${pad( next, 4 )}`;
    }

    // 집계 출력
    const sum = ( values: number[] ) => values.reduce( ( a, b ) => a + b, 0 );
    const totalOf = <T>( pickRows: ( x: typeof plans[number] ) => T[] ) => sum( plans.map( ( x ) => pickRows( x ).length ) );
    console.log( `거래처 ${CLIENTS.length}, 프로젝트 ${plans.length}, 참여자 ${totalOf( ( x ) => x.members ) + plans.filter( ( x ) => x.removed ).length}, 과제 ${totalOf( ( x ) => x.tasks )}` );
    console.log( `협력사 ${sum( plans.map( ( x ) => x.project.partners?.length ?? 0 ) )}, 견적 ${allQuotes.length}, 청구 ${totalOf( ( x ) => x.sales )}, 수금 ${sum( plans.map( ( x ) => sum( x.sales.map( ( s ) => s.payments.length ) ) ) )}` );
    console.log( `예산 ${sum( plans.map( ( x ) => x.budgets.size ) )}, 지출 ${totalOf( ( x ) => x.expenses )}` );
    for ( const x of plans ) {
        const billed = sum( x.sales.filter( ( s ) => s.status === ProjectSaleStatus.BILLED ).map( ( s ) => s.supply ) );
        const budget = sum( [ ...x.budgets.values() ] );
        const spent = sum( x.expenses.map( ( e ) => e.supply ) );
        console.log( `  [${x.project.status}] ${x.project.name} | 참여 ${x.members.length} 과제 ${x.tasks.length} | 계약 ${x.project.amount / MILLION}백만 청구 ${Math.round( billed / MILLION )}백만 | 예산 ${Math.round( budget / MILLION )}백만 지출 ${Math.round( spent / MILLION )}백만` );
    }

    if ( DRY_RUN ) { console.log( '--dry-run: 저장하지 않았습니다.' ); return; }

    await prisma.$transaction( async ( tx ) => {
        // 거래처
        const clientIds = new Map<string, number>();
        const firstContact = new Map<string, { id: number; seed: ContactSeed; hp: string; email: string }>();
        for ( const [ index, seed ] of CLIENTS.entries() ) {
            const createdAt = kstAt( '2024-12-02' );
            const client = await tx.projectClient.create({
                data: {
                    name: seed.name, businessNo: businessNoOf( index ), ceoName: seed.ceo, address: seed.address, tel: clientTel( index ), memo: seed.memo,
                    createdAt, createdId: salesLeader.id, updatedAt: createdAt, updatedId: salesLeader.id,
                    ...( seed.deleted ? { deleted: true, deletedAt: kstAt( '2026-02-10' ), deletedId: salesLeader.id } : {} ),
                },
                select: { id: true },
            });
            clientIds.set( seed.key, client.id );
            for ( const [ i, contact ] of seed.contacts.entries() ) {
                const hp = contactHp( index, i );
                const email = mailOf( seed.key, i );
                const row = await tx.projectClientContact.create({
                    data: { clientId: client.id, name: contact.name, department: contact.department, jobTitle: contact.jobTitle, hp, email, createdAt, createdId: salesLeader.id, updatedAt: createdAt, updatedId: salesLeader.id },
                    select: { id: true },
                });
                if ( i === 0 ) firstContact.set( seed.key, { id: row.id, seed: contact, hp, email } );
            }
        }

        for ( const plan of plans ) {
            const { project: p } = plan;
            const ownerId = plan.members.find( ( m ) => m.role === ProjectMemberRole.MANAGER )?.person.id ?? plan.members[0].person.id;
            const createdAt = kstAt( workdayOnOrBefore( addDays( p.start, -40 ) ) );
            const audit = { createdAt, createdId: ownerId, updatedAt: createdAt, updatedId: ownerId };

            const row = await tx.project.create({
                data: {
                    name: p.name, description: `<p>${p.summary}</p>`, status: p.status,
                    startDate: dateOnly( p.start ), endDate: dateOnly( p.end ), clientId: p.client ? clientIds.get( p.client ) : null, ...audit,
                },
                select: { id: true },
            });
            const projectId = row.id;

            await tx.projectMember.createMany({ data: [
                ...plan.members.map( ( m ) => ({ projectId, userId: m.person.id, role: m.role, ...audit }) ),
                ...( plan.removed ? [ { projectId, userId: plan.removed.person.id, role: plan.removed.role, ...audit, deleted: true, deletedAt: kstAt( plan.removed.removedAt! ), deletedId: ownerId } ] : [] ),
            ] });

            await tx.projectTask.createMany({ data: plan.tasks.map( ( t ) => ({
                projectId, title: t.title, description: t.description, status: t.status, assigneeId: t.assigneeId, dueDate: dateOnly( t.dueDate ), sortOrder: t.sortOrder, ...audit,
            }) ) });

            // 협력사 + 담당자
            const partnerIds = new Map<PartnerSeed, number>();
            for ( const partner of p.partners ?? [] ) {
                const amounts = calcSaleAmounts( partner.amount, ProjectQuoteTaxType.TAXABLE )!;
                const staff = PARTNER_STAFF[partner.client] ?? [];
                const clientIndex = CLIENTS.findIndex( ( c ) => c.key === partner.client );
                const created = await tx.projectPartner.create({
                    data: {
                        projectId, clientId: clientIds.get( partner.client )!, workScope: partner.scope, contractAmount: amounts.supplyAmount, vatAmount: amounts.vatAmount, totalAmount: amounts.totalAmount,
                        startDate: dateOnly( addDays( p.start, 14 ) ), endDate: dateOnly( addDays( p.end, -7 ) ), ...audit,
                        ...( partner.removedAt ? { deleted: true, deletedAt: kstAt( partner.removedAt ), deletedId: ownerId } : {} ),
                        contacts: { create: staff.map( ( [ name, role ], i ) => ({ sortOrder: i, name, role, hp: contactHp( clientIndex, i + 5 ), email: `staff${i + 1}@${partner.client}.example` }) ) },
                    },
                    select: { id: true },
                });
                partnerIds.set( partner, created.id );
            }

            // 견적 + 버전 + 품목 (발주처·담당자 스냅샷)
            const versionIds = new Map<VersionPlan, number>();
            const clientIndex = p.client ? CLIENTS.findIndex( ( c ) => c.key === p.client ) : -1;
            for ( const quote of plan.quotes ) {
                const firstAt = kstAt( quote.versions[0].quoteDate );
                const quoteRow = await tx.projectQuote.create({
                    data: { projectId, quoteNo: quote.quoteNo!, title: quote.title, createdAt: firstAt, createdId: ownerId, updatedAt: firstAt, updatedId: ownerId },
                    select: { id: true },
                });
                const client = CLIENTS[clientIndex];
                const contact = firstContact.get( client.key )!;
                for ( const v of quote.versions ) {
                    const amounts = calcQuote( v.items, v.taxType )!;
                    const at = kstAt( v.quoteDate );
                    const created = await tx.projectQuoteVersion.create({
                        data: {
                            quoteId: quoteRow.id, version: v.version, status: v.status, taxType: v.taxType, quoteDate: dateOnly( v.quoteDate ), validUntil: dateOnly( v.validUntil ),
                            clientId: clientIds.get( client.key ), clientName: client.name, clientBusinessNo: businessNoOf( clientIndex ), clientCeoName: client.ceo, clientAddress: client.address, clientTel: clientTel( clientIndex ),
                            contactId: contact.id, contactName: contact.seed.name, contactDepartment: contact.seed.department, contactJobTitle: contact.seed.jobTitle, contactHp: contact.hp, contactEmail: contact.email,
                            supplyAmount: amounts.supplyAmount, vatAmount: amounts.vatAmount, totalAmount: amounts.totalAmount, note: v.note,
                            confirmedAt: v.confirmedDate ? kstAt( v.confirmedDate, '15:00' ) : null, confirmedId: v.confirmedDate ? ownerId : null,
                            cancelledAt: v.cancelledDate ? kstAt( v.cancelledDate, '16:00' ) : null, cancelledId: v.cancelledDate ? ownerId : null,
                            createdAt: at, createdId: ownerId, updatedAt: at, updatedId: ownerId,
                            items: { create: amounts.rows.map( ( r ) => ({ sortOrder: r.sortOrder, name: r.name, spec: r.spec, quantity: r.quantity, unitPrice: r.unitPrice, amount: r.amount, note: r.note }) ) },
                        },
                        select: { id: true },
                    });
                    versionIds.set( v, created.id );
                }
            }

            // 매출 + 수금
            for ( const sale of plan.sales ) {
                const amounts = calcSaleAmounts( sale.supply, sale.taxType )!;
                const at = kstAt( sale.billedDate ?? minDate( sale.plannedDate ?? TODAY, TODAY ) );
                await tx.projectSale.create({
                    data: {
                        projectId, quoteVersionId: sale.version ? versionIds.get( sale.version ) : null, title: sale.title, status: sale.status, taxType: sale.taxType,
                        supplyAmount: amounts.supplyAmount, vatAmount: amounts.vatAmount, totalAmount: amounts.totalAmount,
                        plannedDate: sale.plannedDate ? dateOnly( sale.plannedDate ) : null, billedDate: sale.billedDate ? dateOnly( sale.billedDate ) : null, taxInvoiceNo: sale.invoiceNo, memo: sale.memo,
                        cancelledAt: sale.cancelledDate ? kstAt( sale.cancelledDate, '16:00' ) : null, cancelledId: sale.cancelledDate ? ownerId : null,
                        createdAt: at, createdId: ownerId, updatedAt: at, updatedId: ownerId,
                        payments: { create: sale.payments.map( ( pay ) => ({ paidDate: dateOnly( pay.paidDate ), amount: pay.amount, memo: pay.memo, createdAt: kstAt( pay.paidDate, '14:00' ), createdId: ownerId }) ) },
                    },
                });
            }

            // 예산 + 지출
            await tx.projectBudget.createMany({ data: [ ...plan.budgets ].map( ( [ name, amount ] ) => ({ projectId, categoryId: categoryId.get( name )!, amount, ...audit }) ) });
            await tx.projectExpense.createMany({ data: plan.expenses.map( ( e ) => {
                const amounts = calcSaleAmounts( e.supply, e.taxType )!;
                const at = kstAt( e.date, '17:00' );
                return {
                    projectId, categoryId: categoryId.get( e.category )!, partnerId: e.partner ? partnerIds.get( e.partner ) : null, title: e.title, expenseDate: dateOnly( e.date ), taxType: e.taxType,
                    supplyAmount: amounts.supplyAmount, vatAmount: amounts.vatAmount, totalAmount: amounts.totalAmount, memo: e.memo, createdAt: at, createdId: ownerId, updatedAt: at, updatedId: ownerId,
                };
            } ) });
        }

        // 견적번호 채번을 마지막 번호로 맞춘다 (화면에서 새로 만들 때 이어지도록)
        for ( const [ year, lastNo ] of sequences ) await tx.projectQuoteSequence.upsert({ where: { year }, create: { year, lastNo }, update: { lastNo } });
    }, { timeout: 300_000, maxWait: 20_000 } );

    console.log( '저장 완료' );
}

main()
    .catch( ( e ) => { console.error( e ); process.exitCode = 1; } )
    .finally( () => prisma.$disconnect() );
