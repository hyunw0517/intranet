import { BoardPermission } from "../interface/board-permission.interface";
import { BoardRule } from "../interface/board-rule.interface";
import { UserAccessInfo } from "../interface/user-access-info.interface";
import { NO_PERMISSION } from "../const/board-permission.const";

// 게시판 권한 판정 (DB 조회 없음)
// BoardAuthService가 규칙(BoardAuth)과 회원 정보(직급·소속)를 조회한 뒤 이 함수로 계산한다.
// 조회와 판정을 나눠 두어 판정 규칙만 단위 테스트할 수 있다. (board-permission.util.spec.ts)

//* 규칙과 회원 정보를 비교해 권한 계산
// - 규칙 안의 조건은 AND, 해당하는 규칙이 여러 개면 권한별 OR(합집합)
// - 해당하는 규칙이 없으면 모두 false (기본 거부)
export function evaluateBoardPermission(
    boardRules: BoardRule[],
    userInfo: UserAccessInfo,
): BoardPermission {
    const matched = boardRules.filter( ( rule ) => matchesRule( rule, userInfo ) );

    if( matched.length === 0 ){
        return { ...NO_PERMISSION };
    }

    return {
        read: matched.some( ( rule ) => rule.authRead ),
        write: matched.some( ( rule ) => rule.authWrite ),
        comment: matched.some( ( rule ) => rule.authComment ),
        admin: matched.some( ( rule ) => rule.authAdmin ),
    };
}

//* 회원이 규칙의 조건을 모두 만족하는지 (비어 있는 조건은 통과)
function matchesRule(
    rule: BoardRule,
    userInfo: UserAccessInfo,
){
    // 1. 최소 직급: 직급 순서는 위쪽(sortOrder가 작을수록)이 높으므로, 회원 sortOrder가 기준 이하면 통과
    if( rule.position !== null ){
        if( userInfo.positionSortOrder === null || userInfo.positionSortOrder > rule.position.sortOrder ){
            return false;
        }
    }

    // 2. 부서·직책: 둘 다 조건이 없으면 통과
    const jobTitleIds = rule.jobTitles.map( ( j ) => j.jobTitleId );

    if( rule.departmentId === null && jobTitleIds.length === 0 ){
        return true;
    }

    // 겸직이면 소속마다 확인하고, 같은 소속 안에서 부서와 직책을 함께 만족해야 한다.
    return userInfo.memberships.some( ( m ) => {
        const departmentOk = rule.departmentId === null
            || ( rule.includeSubDepartment
                ? m.departmentWithAncestorIds.includes( rule.departmentId )
                : m.departmentId === rule.departmentId );

        const jobTitleOk = jobTitleIds.length === 0
            || ( m.jobTitleId !== null && jobTitleIds.includes( m.jobTitleId ) );

        return departmentOk && jobTitleOk;
    });
}
