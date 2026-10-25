// 가입 승인 전(GUEST) 회원이 접근할 수 있는 경로
// 메뉴 표시(nav-items)와 화면 차단(PendingApprovalGate)이 같은 규칙을 쓰도록 한 곳에서 관리한다.
export const GUEST_ALLOWED_PATHS = ["/mypage"];

export function isGuestAllowedPath(pathname: string) {
  return GUEST_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
