import { ApprovalLineManagerScope, ApprovalLineScope, ApprovalStatus } from "src/generated/prisma/client";
import { MAX_APPROVAL_STEPS } from "../const/approval.const";

//! 전자결재 순수 규칙 (DB 없이 단위 테스트, features.md 7.5)

//* 결재자 목록 구조 검사 → 오류 문구 (문제 없으면 null)
// - minSteps: 상신·템플릿은 1, 임시저장은 0(결재라인 미확정 허용)
// - requesterId: 기안자 본인 제외 검사 (템플릿은 기안자가 정해져 있지 않아 생략)
export function checkApproverIds(
    approverIds: number[],
    options: { minSteps: number; requesterId?: number },
): string | null {
    if ( approverIds.length < options.minSteps ) {
        return '결재자를 1명 이상 지정해야 합니다.';
    }
    if ( approverIds.length > MAX_APPROVAL_STEPS ) {
        return `결재자는 최대 ${MAX_APPROVAL_STEPS}명까지 지정할 수 있습니다.`;
    }
    if ( new Set( approverIds ).size !== approverIds.length ) {
        return '같은 결재자를 두 번 지정할 수 없습니다.';
    }
    if ( options.requesterId !== undefined && approverIds.includes( options.requesterId ) ) {
        return '기안자 본인은 결재자로 지정할 수 없습니다.';
    }
    return null;
}

//* 단계 목록 → 결재자 행 (단계 번호 1부터, 같은 단계는 같은 번호)
export function flattenSteps<T extends { approverIds: number[] }>( steps: T[] ): { approverId: number; stepOrder: number; step: T }[] {
    return steps.flatMap( ( step, i ) => step.approverIds.map( ( approverId ) => ({ approverId, stepOrder: i + 1, step }) ) );
}

//* 결재자 행(단계 번호 포함) → 단계별 결재자 id (단계 번호 순서, 빈 단계 없이)
export function groupSteps( rows: { approverId: number; stepOrder: number }[] ): number[][] {
    const orders = [ ...new Set( rows.map( ( r ) => r.stepOrder ) ) ].sort( ( a, b ) => a - b );
    return orders.map( ( order ) => rows.filter( ( r ) => r.stepOrder === order ).map( ( r ) => r.approverId ) );
}

//* 단계 목록 검사: 빈 단계 불가 + 전체 결재자에 checkApproverIds 규칙
export function checkStepGroups(
    groups: number[][],
    options: { minSteps: number; requesterId?: number },
): string | null {
    if ( groups.some( ( g ) => g.length === 0 ) ) {
        return '결재자가 없는 단계가 있습니다.';
    }
    return checkApproverIds( groups.flat(), options );
}

//* 내 결재라인 관리 범위 (ADMIN = 전체)
export interface LineManageScope {
    all: boolean;
    departmentIds: number[];
}

//* 결재라인 관리자 규칙 → 관리 범위
// - rules: 나에게 해당하는 규칙 (회원 = 나, 또는 내가 가진 직책), 삭제된 부서·직책 규칙은 호출한 쪽이 뺀다
// - myJobTitleDepartments: 직책 id → 그 직책으로 소속된 부서 id 목록 (MY_DEPARTMENT 계산용)
export function resolveManageScope(
    rules: { scope: ApprovalLineManagerScope; jobTitleId: number | null; departmentId: number | null }[],
    myJobTitleDepartments: Map<number, number[]>,
): LineManageScope {
    if ( rules.some( ( r ) => r.scope === ApprovalLineManagerScope.ALL ) ) {
        return { all: true, departmentIds: [] };
    }

    const ids = new Set<number>();
    for ( const r of rules ) {
        if ( r.scope === ApprovalLineManagerScope.DEPARTMENT && r.departmentId !== null ) {
            ids.add( r.departmentId );
        }
        if ( r.scope === ApprovalLineManagerScope.MY_DEPARTMENT && r.jobTitleId !== null ) {
            for ( const id of myJobTitleDepartments.get( r.jobTitleId ) ?? [] ) ids.add( id );
        }
    }

    return { all: false, departmentIds: [ ...ids ].sort( ( a, b ) => a - b ) };
}

//* 관리 부서 → 하위 부서 전체(모든 단계) 포함 (2026-11-10 사용자 결정: 상위 부서 관리자는 하위 부서의 부서 결재라인도 관리)
// departments: 삭제되지 않은 전체 부서 (id, 상위 id). 결과는 id 오름차순, 중복 없음.
export function withDescendants( departmentIds: number[], departments: { id: number; parentDepartmentId: number | null }[] ): number[] {
    const children = new Map<number, number[]>();
    for ( const d of departments ) {
        if ( d.parentDepartmentId === null ) continue;
        children.set( d.parentDepartmentId, [ ...( children.get( d.parentDepartmentId ) ?? [] ), d.id ] );
    }

    const result = new Set<number>();
    const queue = [ ...departmentIds ];
    while ( queue.length > 0 ) {
        const id = queue.shift()!;
        if ( result.has( id ) ) continue; // 이미 넣은 부서 (겹치는 규칙, 순환 방어)
        result.add( id );
        queue.push( ...( children.get( id ) ?? [] ) );
    }

    return [ ...result ].sort( ( a, b ) => a - b );
}

//* 공용·부서 결재라인을 이 범위로 관리할 수 있는지 (개인 결재라인은 소유자만 - 여기서 다루지 않음)
export function canManageLine(
    scope: LineManageScope,
    line: { scope: ApprovalLineScope; departmentId: number | null },
): boolean {
    if ( line.scope === ApprovalLineScope.PERSONAL ) return false;
    if ( scope.all ) return true;
    return line.scope === ApprovalLineScope.DEPARTMENT
        && line.departmentId !== null
        && scope.departmentIds.includes( line.departmentId );
}

//* 결재 진행 중인 문서 상태 (승인·반려·결재자 교체가 가능한 상태)
export const IN_PROGRESS_STATUSES: ApprovalStatus[] = [ ApprovalStatus.REQUESTED, ApprovalStatus.IN_PROGRESS ];

//* 승인 후 다음 상태: 다음 단계가 있으면 IN_PROGRESS + 다음 순서, 없으면 최종 승인
// stepOrders: 문서의 단계 순서 목록 (1부터 연속)
export function nextAfterApprove( stepOrders: number[], currentOrder: number ):
    { status: typeof ApprovalStatus.IN_PROGRESS; nextOrder: number } | { status: typeof ApprovalStatus.APPROVED; nextOrder: null } {
    const next = stepOrders.filter( ( o ) => o > currentOrder ).sort( ( a, b ) => a - b )[0];
    return next === undefined
        ? { status: ApprovalStatus.APPROVED, nextOrder: null }
        : { status: ApprovalStatus.IN_PROGRESS, nextOrder: next };
}
