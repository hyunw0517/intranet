// "/"·"/admin" 같은 루트 메뉴는 정확히 일치할 때만, 나머지는 하위 경로까지 활성으로 본다.
const ROOT_PATHS = ["/", "/admin"];

export function isActivePath(pathname: string, href: string) {
  if (ROOT_PATHS.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
