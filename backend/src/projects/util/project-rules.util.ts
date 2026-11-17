import { ProjectTaskStatus, UserStatus } from "src/generated/prisma/client";

//! 과제 관리 순수 규칙 (DB 없이 단위 테스트, docs/design/projects.md 5장)

//* 진척도 (%) = 완료 과제 수 / 삭제되지 않은 전체 과제 수 (2026-11-16 사용자 결정)
// - 담당자 부재·담당자 없음과 관계없이 모두 센다. (인수인계할 일이 진척도에서 사라지지 않게)
// - 과제가 없으면 0. 소수점은 버린다(99.9%를 100%로 보이지 않게).
export function calcProgress( doneCount: number, totalCount: number ): number {
    if ( totalCount <= 0 ) return 0;
    return Math.floor( ( doneCount / totalCount ) * 100 );
}

//* 담당자 부재 여부 (2026-11-16 사용자 결정)
// 담당자가 있는데, 프로젝트 참여자에서 빠졌거나(활성 참여자 목록에 없음) 퇴사·삭제된 회원이면 부재.
// 담당자 없음(NULL)은 부재가 아니다.
export function isAssigneeAbsent(
    assignee: { id: number; status: UserStatus; deleted: boolean } | null,
    activeMemberIds: ReadonlySet<number>,
): boolean {
    if ( !assignee ) return false;
    return !activeMemberIds.has( assignee.id ) || assignee.status === UserStatus.RESIGNED || assignee.deleted;
}

//* 칸반 이동 후 컬럼의 새 순서 (2026-11-16 사용자 결정: 정수 sortOrder, 옮기면 컬럼을 다시 번호 매김)
// - columnIds: 옮긴 뒤 들어갈 컬럼의 현재 과제 id (sortOrder 순서, 옮기는 과제는 빠져 있어도 들어 있어도 된다)
// - index: 그 컬럼에서 들어갈 위치(0부터). 범위를 넘으면 맨 끝.
// - 반환: 0부터 다시 매긴 id 순서
export function reorderColumn( columnIds: readonly number[], movedId: number, index: number ): number[] {
    const rest = columnIds.filter( ( id ) => id !== movedId );
    const at = Math.max( 0, Math.min( index, rest.length ) );
    return [ ...rest.slice( 0, at ), movedId, ...rest.slice( at ) ];
}

//* 칸반 컬럼 순서 (화면 컬럼 순서와 같다)
export const TASK_STATUS_ORDER: ProjectTaskStatus[] = [ ProjectTaskStatus.TODO, ProjectTaskStatus.IN_PROGRESS, ProjectTaskStatus.DONE ];
