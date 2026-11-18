// 테스트 회원 seed (개발용)
// 실행: npx prisma db seed   (DB 컨테이너가 떠 있어야 한다)
// 미리 보기: npx tsx prisma/seed.ts --dry-run   (저장하지 않고 배정 결과와 집계만 출력)
//
// - 부서·직급·직책은 이미 DB에 등록된 데이터를 이름으로 찾아 배정한다. (조직 관리 화면에서 먼저 만들어 둘 것)
// - 사번 EMP_NO_PREFIX + 001부터 순서대로 (예: 2611001 ~ 2611200). 이미 있는 사번은 건너뛰므로 여러 번 실행해도 중복되지 않는다.
// - 비밀번호는 모두 TEST_PASSWORD
//
// 배정 규칙 (실제 회사 구조에 맞춤)
// - 회장·사장 등 핵심 인물은 한 명씩만. seed 밖의 회원이 이미 그 직급이면 새로 만들지 않는다.
// - 본부마다 본부장 1명, 팀마다 팀장 1명. seed 밖의 회원이 이미 팀장인 팀은 건너뛴다.
// - 임원(이사 이상)은 지정된 자리(회장실·대표이사실·본부장)에만 배정하고, 팀원 직급은 부장 아래에서 피라미드 비율로 뽑는다.
// - 게시판 권한 판정 확인용 경우를 섞는다: 겸직(팀장 + 다른 팀 팀원), 본부 직속, 직급 없음, 휴직·퇴사, 가입 승인 전(GUEST)
// - 이름: 입사 시기에 맞는 세대별 이름 + 실제 성씨 비율. 같은 직급이나 같은 부서에는 동명이인을 만들지 않는다. (이미 DB에 있는 회원 포함)
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole, UserStatus } from '../src/generated/prisma/client';

const TEST_PASSWORD = '1q2w3e4r!!';
const USER_COUNT = 200;
const EMP_NO_PREFIX = '2611'; // 연도 2자리 + 월 2자리 (실행 날짜가 아니라 고정값: 다른 달에 다시 실행해도 같은 사번)
const DRY_RUN = process.argv.includes('--dry-run');

// 회장실·대표이사실은 하위 부서가 없지만 팀이 아니므로 이름으로 구분한다.
const EXECUTIVE_OFFICES = ['회장실', '대표이사실'];

// 팀원 직급 비율 (부장 아래 직급만, 합계 100)
const MEMBER_POSITION_WEIGHTS: Record<string, number> = {
    차장: 8,
    과장: 17,
    대리: 25,
    주임: 20,
    사원: 25,
    인턴: 5,
};

// 본부장 직급 (본부 순서대로, 본부가 더 많으면 마지막 값 반복)
const HEAD_POSITIONS = ['전무', '상무', '상무', '이사'];

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// 같은 결과가 나오도록 고정 시드 난수 (실행할 때마다 배정이 바뀌지 않게)
let randomState = 20261101;
function random(){
    randomState = ( randomState * 1103515245 + 12345 ) % 2147483648;
    return randomState / 2147483648;
}
function pick<T>( list: T[] ): T {
    return list[ Math.floor( random() * list.length ) ];
}
function pickWeighted( weights: Record<string, number> ){
    const total = Object.values( weights ).reduce( ( sum, w ) => sum + w, 0 );
    let r = random() * total;
    for( const [ key, weight ] of Object.entries( weights ) ){
        r -= weight;
        if( r < 0 ) return key;
    }
    return Object.keys( weights )[0];
}

// 이름 전용 난수: 이름을 다시 뽑아도 소속·입사일 배정이 바뀌지 않게 위의 난수와 분리한다.
let nameRandomState = 20261119;
function nameRandom(){
    nameRandomState = ( nameRandomState + 0x6D2B79F5 ) | 0;
    let t = Math.imul( nameRandomState ^ ( nameRandomState >>> 15 ), 1 | nameRandomState );
    t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
    return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
}
function pickName( list: string[] ){
    return list[ Math.floor( nameRandom() * list.length ) ];
}

// 성씨별 비중 (흔한 성이 많되 한쪽으로 쏠리지 않게 실제 비율을 완만하게 조정)
const SURNAME_WEIGHTS: Record<string, number> = {
    김: 14, 이: 11, 박: 7, 최: 5, 정: 5, 강: 3, 조: 3, 윤: 3, 장: 3, 임: 3,
    한: 2, 오: 2, 서: 2, 신: 2, 권: 2, 황: 2, 안: 2, 송: 2, 전: 2, 홍: 2,
    유: 1, 고: 1, 문: 1, 양: 1, 손: 1, 배: 1, 백: 1, 허: 1, 남: 1, 심: 1,
    노: 1, 하: 1, 곽: 1, 성: 1, 차: 1, 주: 1, 우: 1, 구: 1, 민: 1, 류: 1,
    나: 1, 진: 1, 지: 1, 엄: 1, 채: 1, 원: 1, 천: 1, 방: 1, 공: 1, 현: 1,
    함: 0.5, 변: 0.5, 염: 0.5, 여: 0.5, 추: 0.5, 도: 0.5, 석: 0.5, 설: 0.5, 마: 0.5, 길: 0.5,
    남궁: 0.3, 황보: 0.3, 제갈: 0.3, 선우: 0.3, 독고: 0.3, 사공: 0.3,
};

// 입사 시기별 이름 (세대에 어울리는 이름)
const GIVEN_NAMES_SENIOR = [ // ~2010년 입사
    '영수', '정호', '성민', '동현', '상훈', '재현', '종민', '병철', '승호', '태성', '기훈', '창민', '용준', '광수', '대성', '규철', '준호', '경수', '형준', '인식',
    '미경', '은정', '혜진', '경희', '수진', '선영', '지영', '현숙', '정아', '미영', '은주', '윤희', '명희', '영란', '혜경', '순영', '연희', '소영', '민정', '유경',
];
const GIVEN_NAMES_MIDDLE = [ // 2011~2019년 입사
    '민수', '지훈', '현우', '준혁', '성현', '동욱', '진우', '우진', '상현', '재훈', '승민', '태훈', '영민', '정훈', '석진', '민재', '성훈', '희준', '도현', '형석',
    '지은', '수빈', '혜원', '유진', '민지', '보람', '아름', '은지', '지혜', '소연', '다혜', '슬기', '나영', '효진', '예진', '가영', '한나', '세영', '미진', '정민',
];
const GIVEN_NAMES_JUNIOR = [ // 2020년 이후 입사, 가입 승인 전
    '민준', '서준', '도윤', '시우', '하준', '주원', '지호', '건우', '우빈', '현준', '태민', '준서', '은우', '유찬', '시현', '승우', '재윤', '정우', '로운', '가온',
    '서연', '서윤', '지우', '하은', '수아', '채원', '다은', '소율', '예린', '지아', '윤서', '아린', '나윤', '시은', '하린', '유나', '예나', '수현', '민서', '하늘',
];
// 외자 이름 (세대 구분 없이 가끔 섞는다)
const GIVEN_NAMES_SINGLE = [ '준', '건', '솔', '린', '현', '민', '훈', '결', '윤', '진' ];
const SINGLE_NAME_RATE = 0.06;

function randomName( joinYear: number ){
    let r = nameRandom() * Object.values( SURNAME_WEIGHTS ).reduce( ( sum, w ) => sum + w, 0 );
    let surname = '김';
    for( const [ key, weight ] of Object.entries( SURNAME_WEIGHTS ) ){
        r -= weight;
        if( r < 0 ){
            surname = key;
            break;
        }
    }

    if( nameRandom() < SINGLE_NAME_RATE ){
        return `${surname}${pickName( GIVEN_NAMES_SINGLE )}`;
    }

    const isJunior = joinYear === 0 || joinYear >= 2020; // 0 = 입사일 없는 GUEST
    const givenNames = isJunior ? GIVEN_NAMES_JUNIOR : joinYear >= 2011 ? GIVEN_NAMES_MIDDLE : GIVEN_NAMES_SENIOR;
    return `${surname}${pickName( givenNames )}`;
}

// 동명이인을 막는 범위: 직급 하나 + 소속 부서 전부
function nameGroups( position: string | null | undefined, departmentIds: number[] ){
    return [ ...( position ? [ `직급:${position}` ] : [] ), ...departmentIds.map( ( id ) => `부서:${id}` ) ];
}

interface Membership {
    departmentId: number;
    jobTitle: string;            // 직책 이름
}

interface UserSpec {
    label: string;               // 출력용 설명
    role: UserRole;
    status: UserStatus;
    position: string | null;     // 직급 이름
    memberships: Membership[];   // 첫 번째가 대표 소속
    joinYears: [number, number]; // 입사 연도 범위 (직급이 높을수록 오래 근무)
}

function empNoOf( index: number ){
    return `${EMP_NO_PREFIX}${String( index + 1 ).padStart( 3, '0' )}`;
}

async function main(){
    if( USER_COUNT > 999 ){
        throw new Error('사번 순번이 3자리라 999명까지만 만들 수 있습니다.');
    }

    const seedEmpNos = Array.from( { length: USER_COUNT }, ( _, i ) => empNoOf( i ) );

    const [departments, positions, jobTitles, admin, existingPositions, existingLeaders, existingUsers] = await Promise.all([
        prisma.department.findMany({
            select: { id: true, parentDepartmentId: true, name: true },
            where: { deleted: false },
            orderBy: [ { sortOrder: 'asc' }, { id: 'asc' } ],
        }),
        prisma.position.findMany({
            select: { id: true, name: true },
            where: { deleted: false },
        }),
        prisma.jobTitle.findMany({
            select: { id: true, name: true },
            where: { deleted: false },
        }),
        prisma.users.findFirst({
            select: { id: true },
            where: { role: { in: [ UserRole.ADMIN, UserRole.SUPER_ADMIN ] }, deleted: false },
            orderBy: { id: 'asc' },
        }),
        // seed 밖의 회원이 이미 가진 직급 (핵심 인물 중복 방지)
        prisma.users.findMany({
            select: { position: { select: { name: true } } },
            where: { deleted: false, empNo: { notIn: seedEmpNos }, positionId: { not: null } },
        }),
        // seed 밖의 회원이 이미 팀장인 부서 (팀장 중복 방지)
        prisma.userDepartment.findMany({
            select: { departmentId: true },
            where: {
                deleted: false,
                jobTitle: { name: '팀장' },
                user: { deleted: false, empNo: { notIn: seedEmpNos } },
            },
        }),
        // 이미 있는 회원의 이름 (같은 직급·부서 동명이인 방지)
        prisma.users.findMany({
            select: {
                name: true,
                position: { select: { name: true } },
                departments: { select: { departmentId: true }, where: { deleted: false } },
            },
            where: { deleted: false },
        }),
    ]);

    const positionId = new Map( positions.map( ( p ) => [ p.name, p.id ] ) );
    const jobTitleId = new Map( jobTitles.map( ( j ) => [ j.name, j.id ] ) );
    const departmentName = new Map( departments.map( ( d ) => [ d.id, d.name ] ) );

    // 필요한 이름이 모두 등록되어 있는지 먼저 확인 (없으면 배정이 어긋나므로 중단)
    const requiredPositions = [ '회장', '사장', '부사장', '부장', ...HEAD_POSITIONS, ...Object.keys( MEMBER_POSITION_WEIGHTS ) ];
    const requiredJobTitles = [ '회장', '대표이사', '부대표', '본부장', '팀장', '팀원' ];
    const missing = [
        ...requiredPositions.filter( ( name ) => !positionId.has( name ) ).map( ( name ) => `직급 ${name}` ),
        ...requiredJobTitles.filter( ( name ) => !jobTitleId.has( name ) ).map( ( name ) => `직책 ${name}` ),
        ...EXECUTIVE_OFFICES.filter( ( name ) => !departments.some( ( d ) => d.name === name ) ).map( ( name ) => `부서 ${name}` ),
    ];
    if( missing.length > 0 ){
        throw new Error(`조직 데이터에 없는 이름이 있습니다: ${[ ...new Set( missing ) ].join(', ')}`);
    }

    // 부서 분류: 회장실·대표이사실 / 본부(하위 부서가 있음) / 팀(나머지)
    const offices = new Map( departments.filter( ( d ) => EXECUTIVE_OFFICES.includes( d.name ) ).map( ( d ) => [ d.name, d ] ) );
    const parentIds = new Set( departments.map( ( d ) => d.parentDepartmentId ).filter( ( id ) => id !== null ) );
    const heads = departments.filter( ( d ) => parentIds.has( d.id ) );
    const teams = departments.filter( ( d ) => !parentIds.has( d.id ) && !EXECUTIVE_OFFICES.includes( d.name ) );

    const takenPositions = new Set( existingPositions.map( ( u ) => u.position?.name ) );
    const ledTeamIds = new Set( existingLeaders.map( ( l ) => l.departmentId ) );

    // ── 배정 목록 만들기
    const specs: UserSpec[] = [];
    const active = ( label: string, position: string | null, memberships: Membership[], joinYears: [number, number] ): UserSpec => ({
        label, role: UserRole.USER, status: UserStatus.ACTIVE, position, memberships, joinYears,
    });
    const memberPosition = () => pickWeighted( MEMBER_POSITION_WEIGHTS );

    // 1. 핵심 인물: 회사에 한 명씩 (이미 있으면 건너뜀)
    const executives: [string, string, string, string][] = [
        // [구분, 직급, 직책, 부서]
        [ '회장', '회장', '회장', '회장실' ],
        [ '대표이사', '사장', '대표이사', '대표이사실' ],
        [ '부대표', '부사장', '부대표', '대표이사실' ],
    ];
    for( const [ label, position, jobTitle, office ] of executives ){
        if( takenPositions.has( position ) ) continue;
        specs.push( active( label, position, [ { departmentId: offices.get( office )!.id, jobTitle } ], [ 2000, 2010 ] ) );
    }

    // 2. 비서: 회장실·대표이사실에 한 명씩
    for( const office of offices.values() ){
        specs.push( active( '비서', pick( [ '대리', '주임' ] ), [ { departmentId: office.id, jobTitle: '팀원' } ], [ 2016, 2024 ] ) );
    }

    // 3. 본부장: 본부마다 한 명 (본부 직속 소속)
    heads.forEach( ( head, i ) => {
        const position = HEAD_POSITIONS[ Math.min( i, HEAD_POSITIONS.length - 1 ) ];
        specs.push( active( '본부장', position, [ { departmentId: head.id, jobTitle: '본부장' } ], [ 2005, 2014 ] ) );
    });

    // 4. 팀장: 팀마다 한 명 (이미 팀장이 있는 팀은 건너뜀)
    //    겸직 확인용으로 앞쪽 팀장 4명은 다음 팀에 팀원으로도 소속 → "다른 팀 + 팀장" 규칙에 해당하지 않아야 함
    const leaderTeams = teams.filter( ( team ) => !ledTeamIds.has( team.id ) );
    leaderTeams.forEach( ( team, i ) => {
        const memberships: Membership[] = [ { departmentId: team.id, jobTitle: '팀장' } ];

        if( i < 4 && teams.length >= 2 ){
            const other = teams[ ( teams.indexOf( team ) + 1 ) % teams.length ];
            memberships.push( { departmentId: other.id, jobTitle: '팀원' } );
        }

        specs.push( active( memberships.length > 1 ? '팀장(겸직)' : '팀장', random() < 0.8 ? '부장' : '차장', memberships, [ 2008, 2018 ] ) );
    });

    // 5. 본부 직속 팀원 (하위 부서 포함이 꺼진 본부 규칙 확인용)
    for( const head of heads ){
        specs.push( active( '본부 직속', pick( [ '과장', '대리' ] ), [ { departmentId: head.id, jobTitle: '팀원' } ], [ 2014, 2024 ] ) );
    }

    // 6. 직급 없음 (최소 직급 조건 규칙 확인용)
    for( let i = 0; i < 3; i++ ){
        specs.push( active( '직급 없음', null, [ { departmentId: pick( teams ).id, jobTitle: '팀원' } ], [ 2025, 2026 ] ) );
    }

    // 7. 휴직·퇴사 (요청 차단 확인용)
    specs.push({ ...active( '휴직', memberPosition(), [ { departmentId: pick( teams ).id, jobTitle: '팀원' } ], [ 2016, 2024 ] ), status: UserStatus.INACTIVE });
    specs.push({ ...active( '퇴사', memberPosition(), [ { departmentId: pick( teams ).id, jobTitle: '팀원' } ], [ 2016, 2024 ] ), status: UserStatus.RESIGNED });

    // 8. 가입 승인 전 (GUEST: 소속·직급·입사일 없음)
    for( let i = 0; i < 5; i++ ){
        specs.push({ label: 'GUEST(승인 전)', role: UserRole.GUEST, status: UserStatus.ACTIVE, position: null, memberships: [], joinYears: [ 0, 0 ] });
    }

    // 9. 나머지는 팀원으로 팀마다 고르게 (직급은 피라미드 비율)
    for( let i = 0; specs.length < USER_COUNT; i++ ){
        const position = memberPosition();
        const joinYears: [number, number] = [ '차장', '과장' ].includes( position ) ? [ 2012, 2020 ] : [ 2018, 2026 ];
        specs.push( active( '팀원', position, [ { departmentId: teams[ i % teams.length ].id, jobTitle: '팀원' } ], joinYears ) );
    }

    specs.length = USER_COUNT;

    // 직급·부서별로 이미 쓴 이름
    const usedNames = new Map<string, Set<string>>();
    const isNameTaken = ( name: string, groups: string[] ) => groups.some( ( group ) => usedNames.get( group )?.has( name ) );
    const markNameUsed = ( name: string, groups: string[] ) => {
        for( const group of groups ){
            usedNames.set( group, ( usedNames.get( group ) ?? new Set<string>() ).add( name ) );
        }
    };
    for( const user of existingUsers ){
        markNameUsed( user.name, nameGroups( user.position?.name, user.departments.map( ( d ) => d.departmentId ) ) );
    }

    // ── 저장
    const passwordHash = await bcrypt.hash( TEST_PASSWORD, Number( process.env.HASH_ROUNDS ?? 10 ) );
    let created = 0;
    let skipped = 0;
    const rows: string[] = [];

    for( const [ index, spec ] of specs.entries() ){
        const empNo = empNoOf( index );
        // 예전에 이름을 뽑던 자리. 입사일 배정이 바뀌지 않도록 난수 2개를 그대로 소비한다.
        random();
        random();
        const [ fromYear, toYear ] = spec.joinYears;
        const joinYear = fromYear + Math.floor( random() * ( toYear - fromYear + 1 ) );
        const joinMonth = Math.floor( random() * 12 );
        const joinDay = 1 + Math.floor( random() * 28 );

        const exists = await prisma.users.findFirst({
            select: { id: true },
            where: { empNo, deleted: false },
        });

        if( exists ){
            skipped++;
            continue;
        }

        const groups = nameGroups( spec.position, spec.memberships.map( ( m ) => m.departmentId ) );
        let name = randomName( joinYear );
        for( let tries = 0; isNameTaken( name, groups ); tries++ ){
            if( tries >= 500 ){
                throw new Error(`${empNo}: 같은 직급·부서와 겹치지 않는 이름을 찾지 못했습니다.`);
            }
            name = randomName( joinYear );
        }
        markNameUsed( name, groups );

        const memberships = spec.memberships
            .map( ( m ) => `${departmentName.get( m.departmentId )}(${m.jobTitle})` )
            .join( ' + ' ) || '-';

        rows.push( `${empNo}\t${name}\t${spec.label}\t${spec.position ?? '-'}\t${memberships}` );

        if( DRY_RUN ){
            continue;
        }

        // 입사일 (GUEST는 승인 전이라 없음, 올해 입사자는 오늘 이후가 되지 않게)
        const joinAt = spec.role === UserRole.GUEST
            ? null
            : new Date( Math.min( Date.UTC( joinYear, joinMonth, joinDay ), Date.now() ) );

        // 회원 + 소속을 함께 저장 (소속의 createdId는 관리자, 관리자가 없으면 본인)
        await prisma.$transaction( async ( tx ) => {
            const user = await tx.users.create({
                select: { id: true },
                data: {
                    empNo,
                    email: `${empNo}@test.local`,
                    password: passwordHash,
                    name,
                    role: spec.role,
                    status: spec.status,
                    positionId: spec.position ? positionId.get( spec.position ) : null,
                    joinAt,
                },
            });

            const actorId = admin?.id ?? user.id;

            if( spec.memberships.length > 0 ){
                await tx.userDepartment.createMany({
                    data: spec.memberships.map( ( m, i ) => ({
                        userId: user.id,
                        departmentId: m.departmentId,
                        jobTitleId: jobTitleId.get( m.jobTitle ),
                        isPrimary: i === 0,
                        createdId: actorId,
                        updatedId: actorId,
                    })),
                });
            }
        });

        created++;
    }

    console.log( '사번\t이름\t구분\t직급\t소속' );
    console.log( rows.join( '\n' ) );

    // 집계: 직급 분포, 팀별 팀장 수 (seed 밖의 기존 팀장 포함)
    const positionCount = new Map<string, number>();
    for( const spec of specs ){
        const key = spec.position ?? '(직급 없음)';
        positionCount.set( key, ( positionCount.get( key ) ?? 0 ) + 1 );
    }
    console.log( '\n[직급 분포]' );
    console.log( [ ...positionCount ].map( ( [ name, count ] ) => `${name} ${count}` ).join( ', ' ) );

    const leaderCount = new Map<number, number>( [ ...ledTeamIds ].map( ( id ) => [ id, 1 ] ) );
    for( const spec of specs ){
        for( const m of spec.memberships.filter( ( m ) => m.jobTitle === '팀장' ) ){
            leaderCount.set( m.departmentId, ( leaderCount.get( m.departmentId ) ?? 0 ) + 1 );
        }
    }
    const wrongTeams = teams.filter( ( team ) => ( leaderCount.get( team.id ) ?? 0 ) !== 1 );
    console.log( '[팀장] 팀 수', teams.length, '/ 팀장이 1명이 아닌 팀:', wrongTeams.map( ( t ) => `${t.name}(${leaderCount.get( t.id ) ?? 0})` ).join( ', ' ) || '없음' );

    console.log( DRY_RUN
        ? `\n[미리 보기] 저장하지 않음. 생성 예정 ${rows.length}명, 이미 있음 ${skipped}명`
        : `\n생성 ${created}명, 이미 있어 건너뜀 ${skipped}명 (비밀번호: ${TEST_PASSWORD})` );
}

main()
    .catch( ( e ) => {
        console.error( e );
        process.exitCode = 1;
    })
    .finally( () => prisma.$disconnect() );
