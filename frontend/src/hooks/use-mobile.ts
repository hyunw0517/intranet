import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

// shadcn 기본 구현(useEffect 안에서 setState)은 react-hooks/set-state-in-effect 규칙에 걸려
// 외부 상태(matchMedia) 구독 용도의 useSyncExternalStore로 변경했다.
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false // 서버 렌더링 시에는 데스크톱 기준
  )
}
