// 로그인 후 돌아갈 경로(?next=)는 같은 사이트 내부 경로만 허용한다.
// "//evil.com" 같은 값은 브라우저가 외부 주소로 해석하므로 막는다. (오픈 리다이렉트 방지)
export function getSafeRedirect(next: string | null | undefined, fallback = "/") {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
