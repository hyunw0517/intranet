import { ProjectTaskStatus, UserStatus } from "src/generated/prisma/client";

//! 과제 관리 순수 규칙 (DB 없이 단위 테스트)

//* 진척도 (%) = 완료 과제 수 / 삭제되지 않은 전체 과제 수
// - 담당자 부재·담당자 없음과 관계없이 모두 센다. (인수인계할 일이 진척도에서 사라지지 않게)
// - 과제가 없으면 0. 소수점은 버린다(99.9%를 100%로 보이지 않게).
export function calcProgress( doneCount: number, totalCount: number ): number {
    if ( totalCount <= 0 ) return 0;
    return Math.floor( ( doneCount / totalCount ) * 100 );
}

//* 담당자 부재 여부
// 담당자가 참여자에서 빠졌거나 퇴사·삭제됐으면 부재. 담당자 없음(NULL)은 부재가 아니다.
export function isAssigneeAbsent(
    assignee: { id: number; status: UserStatus; deleted: boolean } | null,
    activeMemberIds: ReadonlySet<number>,
): boolean {
    if ( !assignee ) return false;
    return !activeMemberIds.has( assignee.id ) || assignee.status === UserStatus.RESIGNED || assignee.deleted;
}

//* 칸반 이동 후 컬럼의 새 순서 (0부터 다시 매긴 id 순서)
// - columnIds: 들어갈 컬럼의 현재 과제 id (옮기는 과제가 있어도 없어도 된다)
// - index: 들어갈 위치(0부터), 넘으면 맨 끝
export function reorderColumn( columnIds: readonly number[], movedId: number, index: number ): number[] {
    const rest = columnIds.filter( ( id ) => id !== movedId );
    const at = Math.max( 0, Math.min( index, rest.length ) );
    return [ ...rest.slice( 0, at ), movedId, ...rest.slice( at ) ];
}

//* 칸반 컬럼 순서 (화면 컬럼 순서와 같다)
export const TASK_STATUS_ORDER: ProjectTaskStatus[] = [ ProjectTaskStatus.TODO, ProjectTaskStatus.IN_PROGRESS, ProjectTaskStatus.DONE ];
