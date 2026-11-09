// 권한 판정에 쓰는 게시판 규칙 (BoardAuth 조회 결과 한 행, evaluateBoardPermission 입력값)
// 조회 select와 모양이 같아야 한다. select를 바꾸면 이 interface도 함께 수정한다.
export interface BoardRule {
    boardId: number;                          // 내비게이션에서 게시판별로 묶을 때 사용
    departmentId: number | null;              // null이면 부서 조건 없음
    includeSubDepartment: boolean;            // true면 하위 부서 소속도 허용
    position: { sortOrder: number } | null;   // 최소 직급 (이 직급 이상), null이면 직급 조건 없음
    jobTitles: { jobTitleId: number }[];      // 허용 직책 (하나라도 해당하면 통과), 비어 있으면 직책 조건 없음
    authRead: boolean;
    authWrite: boolean;
    authComment: boolean;
    authAdmin: boolean;                       // 다른 사람이 쓴 게시글·댓글 삭제
}
