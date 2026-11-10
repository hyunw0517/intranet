//! approval-rules.util.ts 단위 테스트
// 결재라인 결재자 검사, 결재라인 관리자 범위 계산, 승인 후 다음 상태를 DB 없이 확인한다. (features.md 7.5)

import { ApprovalLineManagerScope, ApprovalLineScope, ApprovalStatus } from 'src/generated/prisma/client';
import {
    canManageLine, checkApproverIds, checkStepGroups, flattenSteps, groupSteps, nextAfterApprove, resolveManageScope, withDescendants,
} from './approval-rules.util';

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

//* 병렬 단계: 단계 목록 ↔ 결재자 행
describe('flattenSteps / groupSteps / checkStepGroups', () => {
    it('단계 목록을 행으로 펼치면 같은 단계는 같은 번호 (1부터)', () => {
        const rows = flattenSteps([ { approverIds: [ 5, 6 ] }, { approverIds: [ 7 ] } ]);
        expect( rows.map( ( r ) => [ r.approverId, r.stepOrder ] ) ).toEqual([ [ 5, 1 ], [ 6, 1 ], [ 7, 2 ] ]);
    });

    it('행을 다시 단계로 묶는다 (단계 번호 순서, 같은 단계 안은 행 순서)', () => {
        expect( groupSteps([ { approverId: 7, stepOrder: 2 }, { approverId: 5, stepOrder: 1 }, { approverId: 6, stepOrder: 1 } ]) )
            .toEqual([ [ 5, 6 ], [ 7 ] ]);
    });

    it('빈 단계는 오류, 단계를 넘어선 중복도 오류 (전체 결재자 기준)', () => {
        expect( checkStepGroups( [ [ 1 ], [] ], { minSteps: 1 } ) ).toMatch( /결재자가 없는 단계/ );
        expect( checkStepGroups( [ [ 1, 2 ], [ 2 ] ], { minSteps: 1 } ) ).toMatch( /두 번/ );
        expect( checkStepGroups( [ [ 1, 2 ], [ 3 ] ], { minSteps: 1, requesterId: 9 } ) ).toBeNull();
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

//* 하위 부서 포함: 기술본부(1) ─ 개발1팀(2) ─ 프론트파트(5) / 인프라팀(3), 경영본부(4)
describe('withDescendants', () => {
    const tree = [
        { id: 1, parentDepartmentId: null },
        { id: 2, parentDepartmentId: 1 },
        { id: 3, parentDepartmentId: 1 },
        { id: 4, parentDepartmentId: null },
        { id: 5, parentDepartmentId: 2 },
    ];

    it('상위 부서를 관리하면 하위 부서 전체(손자 포함)를 관리한다', () => {
        expect( withDescendants( [ 1 ], tree ) ).toEqual([ 1, 2, 3, 5 ]);
    });

    it('하위 부서만 관리하면 상위·형제 부서는 포함하지 않는다', () => {
        expect( withDescendants( [ 2 ], tree ) ).toEqual([ 2, 5 ]);
    });

    it('겹치는 범위는 한 번만', () => {
        expect( withDescendants( [ 1, 2, 4 ], tree ) ).toEqual([ 1, 2, 3, 4, 5 ]);
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

    it('병렬 단계는 같은 번호가 여러 번 있어도 다음 번호로 넘어간다', () => {
        expect( nextAfterApprove( [ 1, 1, 2 ], 1 ) ).toEqual({ status: ApprovalStatus.IN_PROGRESS, nextOrder: 2 });
        expect( nextAfterApprove( [ 1, 1, 2, 2 ], 2 ) ).toEqual({ status: ApprovalStatus.APPROVED, nextOrder: null });
    });

    it('마지막 단계면 최종 승인', () => {
        expect( nextAfterApprove( [ 1, 2, 3 ], 3 ) ).toEqual({ status: ApprovalStatus.APPROVED, nextOrder: null });
        expect( nextAfterApprove( [ 1 ], 1 ) ).toEqual({ status: ApprovalStatus.APPROVED, nextOrder: null });
    });
});
