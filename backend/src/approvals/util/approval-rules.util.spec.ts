//! approval-rules.util.ts 단위 테스트
// 결재라인 결재자 검사, 결재라인 관리자 범위 계산, 승인 후 다음 상태를 DB 없이 확인한다. (features.md 7.5)

import { ApprovalLineManagerScope, ApprovalLineScope, ApprovalStatus } from 'src/generated/prisma/client';
import { canManageLine, checkApproverIds, nextAfterApprove, resolveManageScope } from './approval-rules.util';

//* 결재자 목록 검사
describe('checkApproverIds', () => {
    it('상신·템플릿은 1명 이상, 임시저장은 0명도 허용한다', () => {
        expect( checkApproverIds( [], { minSteps: 1 } ) ).toMatch( /1명 이상/ );
        expect( checkApproverIds( [], { minSteps: 0 } ) ).toBeNull();
    });

    it('최대 10명', () => {
        expect( checkApproverIds( [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ], { minSteps: 1 } ) ).toBeNull();
        expect( checkApproverIds( [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ], { minSteps: 1 } ) ).toMatch( /최대 10명/ );
    });

    it('같은 사람 중복 불가', () => {
        expect( checkApproverIds( [ 1, 2, 1 ], { minSteps: 1 } ) ).toMatch( /두 번/ );
    });

    it('기안자 본인은 결재자가 될 수 없다 (기안자가 정해진 경우만 검사)', () => {
        expect( checkApproverIds( [ 2, 3 ], { minSteps: 1, requesterId: 3 } ) ).toMatch( /본인/ );
        expect( checkApproverIds( [ 2, 3 ], { minSteps: 1 } ) ).toBeNull(); // 템플릿
    });
});

//* 결재라인 관리자 범위
describe('resolveManageScope', () => {
    const rule = ( scope: ApprovalLineManagerScope, jobTitleId: number | null = null, departmentId: number | null = null ) => ({ scope, jobTitleId, departmentId });

    it('규칙이 없으면 관리할 수 없다', () => {
        expect( resolveManageScope( [], new Map() ) ).toEqual({ all: false, departmentIds: [] });
    });

    it('ALL 규칙이 하나라도 있으면 전체', () => {
        expect( resolveManageScope( [ rule( 'DEPARTMENT', null, 3 ), rule( 'ALL' ) ], new Map() ) ).toEqual({ all: true, departmentIds: [] });
    });

    it('특정 부서 규칙은 그 부서들 (중복 제거, 정렬)', () => {
        expect( resolveManageScope( [ rule( 'DEPARTMENT', null, 5 ), rule( 'DEPARTMENT', null, 2 ), rule( 'DEPARTMENT', null, 5 ) ], new Map() ) )
            .toEqual({ all: false, departmentIds: [ 2, 5 ] });
    });

    // 직책 "팀장"(id 7) → 본인 부서: 그 직책으로 소속된 부서만 (겸직은 소속 단위)
    it('본인 부서 규칙은 그 직책으로 소속된 부서', () => {
        const myJobTitles = new Map([ [ 7, [ 10, 11 ] ], [ 8, [ 12 ] ] ]); // 팀장으로 10·11, 다른 직책으로 12
        expect( resolveManageScope( [ rule( 'MY_DEPARTMENT', 7 ) ], myJobTitles ) ).toEqual({ all: false, departmentIds: [ 10, 11 ] });
    });

    it('내가 그 직책이 아니면 본인 부서 규칙은 효과가 없다', () => {
        expect( resolveManageScope( [ rule( 'MY_DEPARTMENT', 9 ) ], new Map([ [ 7, [ 10 ] ] ]) ) ).toEqual({ all: false, departmentIds: [] });
    });
});

//* 공용·부서 결재라인 관리 가능 여부
describe('canManageLine', () => {
    const all = { all: true, departmentIds: [] };
    const dept3 = { all: false, departmentIds: [ 3 ] };

    it('전체 범위는 공용·부서 모두', () => {
        expect( canManageLine( all, { scope: ApprovalLineScope.ADMIN, departmentId: null } ) ).toBe( true );
        expect( canManageLine( all, { scope: ApprovalLineScope.DEPARTMENT, departmentId: 9 } ) ).toBe( true );
    });

    it('부서 범위는 그 부서의 부서 결재라인만 (공용 불가)', () => {
        expect( canManageLine( dept3, { scope: ApprovalLineScope.DEPARTMENT, departmentId: 3 } ) ).toBe( true );
        expect( canManageLine( dept3, { scope: ApprovalLineScope.DEPARTMENT, departmentId: 4 } ) ).toBe( false );
        expect( canManageLine( dept3, { scope: ApprovalLineScope.ADMIN, departmentId: null } ) ).toBe( false );
    });

    it('개인 결재라인은 관리 범위와 무관 (소유자만)', () => {
        expect( canManageLine( all, { scope: ApprovalLineScope.PERSONAL, departmentId: null } ) ).toBe( false );
    });
});

//* 승인 후 다음 상태
describe('nextAfterApprove', () => {
    it('다음 단계가 있으면 결재중 + 다음 순서', () => {
        expect( nextAfterApprove( [ 1, 2, 3 ], 1 ) ).toEqual({ status: ApprovalStatus.IN_PROGRESS, nextOrder: 2 });
        expect( nextAfterApprove( [ 1, 2, 3 ], 2 ) ).toEqual({ status: ApprovalStatus.IN_PROGRESS, nextOrder: 3 });
    });

    it('마지막 단계면 최종 승인', () => {
        expect( nextAfterApprove( [ 1, 2, 3 ], 3 ) ).toEqual({ status: ApprovalStatus.APPROVED, nextOrder: null });
        expect( nextAfterApprove( [ 1 ], 1 ) ).toEqual({ status: ApprovalStatus.APPROVED, nextOrder: null });
    });
});
