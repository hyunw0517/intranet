//! board-permission.util.ts 단위 테스트
// 기본 거부, 규칙 안은 AND, 규칙 사이는 OR, 겸직은 같은 소속 안에서 부서·직책을 함께 본다.
// 관리자는 이 함수를 거치지 않아서 여기서는 다루지 않는다.

import { evaluateBoardPermission } from './board-permission.util';
import { BoardRule } from '../interface/board-rule.interface';
import { UserAccessInfo, UserMembership } from '../interface/user-access-info.interface';

//* 테스트용 조직
// 직급 sortOrder: 작을수록 높다. 1 부장 / 2 과장 / 3 대리 / 4 사원
// 부서: 사업본부(10) └ 영업팀(11)   개발팀(20)
// 직책: 팀장(100) / 팀원(200)
const DEPT_BUSINESS = 10;
const DEPT_SALES = 11;      // 사업본부의 하위 부서
const DEPT_DEV = 20;
const TITLE_LEADER = 100;
const TITLE_MEMBER = 200;

// 조건이 없는 규칙을 기본으로 두고, 테스트마다 필요한 조건·권한만 덮어쓴다.
const rule = ( override: Partial<BoardRule> = {} ): BoardRule => ({
    boardId: 1,
    departmentId: null,
    includeSubDepartment: false,
    position: null,
    jobTitles: [],
    authRead: false,
    authWrite: false,
    authComment: false,
    authAdmin: false,
    ...override,
});

// 소속 하나: 부서 + 그 부서의 상위 부서 목록(하위 부서 포함 규칙용) + 직책
const ANCESTORS: Record<number, number[]> = {
    [DEPT_BUSINESS]: [ DEPT_BUSINESS ],
    [DEPT_SALES]: [ DEPT_SALES, DEPT_BUSINESS ],
    [DEPT_DEV]: [ DEPT_DEV ],
};
const membership = ( departmentId: number, jobTitleId: number | null = null ): UserMembership => ({
    departmentId,
    departmentWithAncestorIds: ANCESTORS[departmentId],
    jobTitleId,
});
const user = ( positionSortOrder: number | null, ...memberships: UserMembership[] ): UserAccessInfo => ({ positionSortOrder, memberships });

const NONE = { read: false, write: false, comment: false, admin: false };

//* 기본 원칙: 기본 거부 + 규칙 간 OR
describe('evaluateBoardPermission - 기본 원칙', () => {
    // 규칙이 없는 게시판은 아무도 볼 수 없다 (기본 거부)
    it('규칙이 없으면 모든 권한이 false', () => {
        expect( evaluateBoardPermission( [], user( 1, membership( DEPT_DEV ) ) ) ).toEqual( NONE );
    });

    // 조건이 비어 있는 규칙 = "전 직원" 규칙. 직급·소속이 없는 회원도 해당한다.
    it('조건이 없는 규칙은 모든 회원에게 적용된다', () => {
        const rules = [ rule({ authRead: true, authComment: true }) ];

        expect( evaluateBoardPermission( rules, user( null ) ) ).toEqual({ ...NONE, read: true, comment: true });
    });

    // "전 직원 읽기" + "개발팀 쓰기"면 개발팀원은 읽기·쓰기 둘 다
    it('해당하는 규칙이 여러 개면 권한별로 합친다 (OR)', () => {
        const rules = [
            rule({ authRead: true }),
            rule({ departmentId: DEPT_DEV, authWrite: true }),
        ];

        expect( evaluateBoardPermission( rules, user( 4, membership( DEPT_DEV ) ) ) ).toEqual({ ...NONE, read: true, write: true });
    });

    // 영업팀원에게 "개발팀 쓰기" 규칙은 해당하지 않아 읽기만
    it('해당하지 않는 규칙의 권한은 받지 않는다', () => {
        const rules = [
            rule({ authRead: true }),
            rule({ departmentId: DEPT_DEV, authWrite: true, authAdmin: true }),
        ];

        expect( evaluateBoardPermission( rules, user( 4, membership( DEPT_SALES ) ) ) ).toEqual({ ...NONE, read: true });
    });
});

//* 조건 1: 최소 직급 ("과장 이상")
describe('evaluateBoardPermission - 최소 직급', () => {
    const rules = [ rule({ position: { sortOrder: 2 }, authRead: true }) ];    // 과장(2) 이상

    // sortOrder가 작을수록 높은 직급이라 "과장 이상" = sortOrder 2 이하
    it.each([
        [ '부장(1) - 기준보다 높음', 1, true ],
        [ '과장(2) - 기준과 같음', 2, true ],
        [ '대리(3) - 기준보다 낮음', 3, false ],
        [ '직급 없음', null, false ],
    ])( '%s → 읽기 %s', ( _label, sortOrder, expected ) => {
        expect( evaluateBoardPermission( rules, user( sortOrder ) ).read ).toBe( expected );
    });
});

//* 조건 2: 부서 (하위 부서 포함 여부)
describe('evaluateBoardPermission - 부서', () => {
    // 하위 부서 미포함이면 사업본부에 직접 소속된 회원만 (영업팀 제외)
    it('하위 부서 미포함이면 그 부서에 직접 소속된 회원만 해당한다', () => {
        const rules = [ rule({ departmentId: DEPT_BUSINESS, includeSubDepartment: false, authRead: true }) ];

        expect( evaluateBoardPermission( rules, user( 4, membership( DEPT_BUSINESS ) ) ).read ).toBe( true );
        expect( evaluateBoardPermission( rules, user( 4, membership( DEPT_SALES ) ) ).read ).toBe( false );
    });

    // 하위 부서 포함이면 영업팀도 해당하고, 개발팀은 해당하지 않는다
    it('하위 부서 포함이면 하위 부서 소속도 해당한다', () => {
        const rules = [ rule({ departmentId: DEPT_BUSINESS, includeSubDepartment: true, authRead: true }) ];

        expect( evaluateBoardPermission( rules, user( 4, membership( DEPT_SALES ) ) ).read ).toBe( true );
        expect( evaluateBoardPermission( rules, user( 4, membership( DEPT_DEV ) ) ).read ).toBe( false );
    });

    // 소속이 하나도 없는 회원(가입 직후 등)은 부서 조건이 있는 규칙에 해당하지 않는다.
    it('소속이 없는 회원은 부서 조건 규칙에 해당하지 않는다', () => {
        const rules = [ rule({ departmentId: DEPT_DEV, authRead: true }) ];

        expect( evaluateBoardPermission( rules, user( 1 ) ).read ).toBe( false );
    });
});

//* 조건 3: 직책 + 겸직
describe('evaluateBoardPermission - 직책·겸직', () => {
    // 직책 목록 중 하나라도 맞으면 해당한다. ("팀장 또는 팀원")
    it('허용 직책 중 하나라도 맞으면 해당한다', () => {
        const rules = [ rule({ jobTitles: [ { jobTitleId: TITLE_LEADER }, { jobTitleId: TITLE_MEMBER } ], authRead: true }) ];

        expect( evaluateBoardPermission( rules, user( 4, membership( DEPT_DEV, TITLE_MEMBER ) ) ).read ).toBe( true );
        expect( evaluateBoardPermission( rules, user( 4, membership( DEPT_DEV, null ) ) ).read ).toBe( false );
    });

    // "개발팀 팀원 + 영업팀 팀장"에게 "영업팀 + 팀원" 규칙은 해당하지 않는다.
    // 따로 보면 둘 다 있지만 같은 소속 안에서 함께 맞는 소속이 없다.
    it('겸직이면 부서와 직책을 같은 소속 안에서 함께 만족해야 한다', () => {
        const rules = [ rule({ departmentId: DEPT_SALES, jobTitles: [ { jobTitleId: TITLE_MEMBER } ], authRead: true }) ];
        const concurrent = user( 3, membership( DEPT_DEV, TITLE_MEMBER ), membership( DEPT_SALES, TITLE_LEADER ) );

        expect( evaluateBoardPermission( rules, concurrent ).read ).toBe( false );
    });

    // 겸직 중 한 소속이라도 조건을 만족하면 해당한다
    it('겸직 중 한 소속이라도 조건을 만족하면 해당한다', () => {
        const rules = [ rule({ departmentId: DEPT_SALES, jobTitles: [ { jobTitleId: TITLE_MEMBER } ], authRead: true }) ];
        const concurrent = user( 3, membership( DEPT_DEV, TITLE_LEADER ), membership( DEPT_SALES, TITLE_MEMBER ) );

        expect( evaluateBoardPermission( rules, concurrent ).read ).toBe( true );
    });
});

//* 조건 조합: 규칙 안의 조건은 AND
describe('evaluateBoardPermission - 조건 조합 (AND)', () => {
    // "영업팀 + 과장 이상"은 부서와 직급을 모두 만족해야 한다
    const rules = [ rule({ departmentId: DEPT_SALES, position: { sortOrder: 2 }, authWrite: true }) ];

    it.each([
        [ '영업팀 + 과장', 2, DEPT_SALES, true ],
        [ '영업팀 + 사원 (직급 부족)', 4, DEPT_SALES, false ],
        [ '개발팀 + 부장 (부서 다름)', 1, DEPT_DEV, false ],
    ])( '%s → 쓰기 %s', ( _label, sortOrder, departmentId, expected ) => {
        expect( evaluateBoardPermission( rules, user( sortOrder, membership( departmentId ) ) ).write ).toBe( expected );
    });
});
