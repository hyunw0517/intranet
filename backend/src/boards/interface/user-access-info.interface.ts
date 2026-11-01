// 규칙과 비교할 회원 정보 (loadUserContext 반환값)
export interface UserAccessInfo {
    positionSortOrder: number | null;     // 직급이 없을 수 있음 (작을수록 높은 직급)
    memberships: UserMembership[];        // 소속 목록 (겸직 시 여러 개)
}

// 소속 하나 = 부서 + 그 부서에서의 직책
// 부서 조건과 직책 조건은 같은 소속 안에서 함께 만족해야 한다.
// ex) A팀 팀장 + B팀 팀원은 "B팀 + 팀장" 규칙에 해당하지 않는다.
export interface UserMembership {
    departmentId: number;                 // 직접 소속된 부서
    departmentWithAncestorIds: number[];  // 소속 부서 + 상위 부서 (하위 부서 포함 규칙용)
    jobTitleId: number | null;            // 직책이 없을 수 있음
}
