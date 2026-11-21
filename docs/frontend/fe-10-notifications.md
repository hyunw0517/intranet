# FE-10 헤더 알림 (빨간 점 · 알림 목록 · 모두 읽음 · 읽은 알림 삭제)

> 작성일: 2026-11-09 · 브랜치 `backend/audit`
> 백엔드 알림 구조(누가 언제 보내는지)는 [audit-notifications.md](../backend/audit-notifications.md) 3·6·7장.

## 1. 화면

헤더 오른쪽 **테마 선택 · 알림 · 사용자 메뉴** 순서. 직원·관리자 화면이 같은 `AppHeader`를 쓰므로 둘 다 표시된다.

- 안 읽은 알림이 있으면 종 아이콘 오른쪽 위에 **빨간 점**(`bg-destructive`, 상태 의미 색). 개수는 화면에 숫자로 쓰지 않고 `aria-label`("알림 (읽지 않은 알림 N개)")과 창 머리("읽지 않음 N개")에 둔다.
- 누르면 팝오버: 최신순 목록(20개씩, [더 보기]) / 아래 [모두 읽음] [읽은 알림 삭제]
  - 한 줄: 안 읽음 점 · 제목(안 읽음은 굵게, 읽음은 흐리게) · 내용 2줄 · 보낸 사람 · 시각(`formatListDate` - 오늘은 HH:mm, 그 외 날짜) · [×] 개별 삭제
  - 알림을 누르면 안 읽었으면 읽음 처리 → 창 닫기 → 저장된 `link`로 이동
  - **이미 그 화면에 있으면**(예: 게시글을 보는 중 그 글의 댓글 알림) `router.push`가 같은 주소라 아무 일도 하지 않아 새 댓글이 안 보였다(사용자 제보) → 같은 경로면 이동 대신 활성 쿼리 전체를 다시 불러온다(`invalidateQueries({ refetchType: "active" })`). 다른 기능의 queryKey를 import하지 않으려고 특정 키 대신 전체를 쓴다. 게시글 상세가 다시 조회되므로 조회수가 1 오른다(다시 연 것과 같음)
  - [읽은 알림 삭제]는 안 읽은 알림을 남긴다(실수 방지, 사용자 결정). 결과는 토스트("읽은 알림 N개를 삭제했습니다.")
- 승인 전(GUEST)은 알림 API가 403이라 아이콘을 표시하지 않는다.
- 모바일: 창 너비 `calc(100vw - 2rem)`, 데스크톱 `w-96`.

## 2. 파일과 역할

| 파일 | 역할 |
|---|---|
| `services/api/notifications.ts` | 백엔드 `common/notifications.controller`와 1:1 (목록·안 읽은 수·읽음·모두 읽음·삭제·읽은 알림 삭제), `NotificationItem` 타입 |
| `types/pagination.ts` | `CursorResult<T>` 추가 (알림 목록이 첫 커서 페이지네이션 사용처) |
| `features/notification/hooks/use-notifications.ts` | `notificationKeys`, `useUnreadNotificationCount`, `useNotificationList`(무한 스크롤용 `useInfiniteQuery`), `useNotificationMutation`(성공 시 `notificationKeys.all` 무효화) |
| `features/notification/components/notification-bell.tsx` | 종 아이콘 + 팝오버 + 목록 행 |
| `components/ui/popover.tsx` | shadcn Popover (이미 설치된 `radix-ui` 패키지의 Popover - 새 의존성 없음) |
| `components/layout/app-header.tsx` | 테마 선택과 사용자 메뉴 사이에 `<NotificationBell />` |

백엔드 변경: `DELETE /common/notifications/read`(읽은 알림 삭제, `NotificationsService.removeRead`) 추가 — 고정 경로라 `:id`보다 먼저 선언.

## 3. 데이터 흐름

```text
[헤더 렌더]  useUnreadNotificationCount ── GET /common/notifications/unread-count
              · 60초마다 + 창으로 돌아올 때(refetchOnWindowFocus) 다시 조회  (실시간 Socket.IO는 1월 이후 선택 확장)
[종 클릭]    NotificationPanel 마운트 → useNotificationList ── GET /common/notifications?take=20 (staleTime 0 → 열 때마다 새로)
              [더 보기] → fetchNextPage ── ?cursor=<meta.nextCursor>
[읽음·삭제]  useNotificationMutation ── PATCH/DELETE ... → 성공 시 notificationKeys.all 무효화
              → 안 읽은 수와 목록이 함께 다시 조회됨 (빨간 점·목록이 같이 맞춰짐)
```

- 목록은 창을 열었을 때만 조회한다(닫힌 동안은 가벼운 count만). 패널을 열 때 마운트되므로 닫으면 목록 상태도 사라진다.
- 승인 직후에는 access token이 아직 GUEST라 최대 10분 403이 날 수 있어 `retry: false`로 조용히 둔다(빨간 점 없음).
- Client Component만 쓴다: 토큰이 브라우저 메모리에 있고, 클릭·팝오버 상태가 필요한 화면이라서. 레이아웃(`AppHeader`)이 이미 Client Component다.

## 4. 확인 (2026-11-09)

- `tsc --noEmit`, ESLint(변경 파일) 통과
- Chrome + playwright-core(스크래치, 프로젝트 의존성 추가 없음)로 실제 로그인 → 11개 항목 통과: 헤더 순서, 빨간 점·aria-label 3개, 첫 페이지 20개·최신순, [더 보기] 25개, 안 읽은 알림 클릭 → `/mypage` 이동·DB 읽음·2개 남음·창 닫힘, × 삭제(DB 24개·목록에서 사라짐), [모두 읽음] → 빨간 점 사라짐·버튼 비활성, [읽은 알림 삭제] → 토스트·빈 목록·DB 0개, 390px 다크 화면 안·가로 넘침 없음, GUEST 아이콘 없음, 콘솔 오류 없음(로그인 전 세션 복구 401 제외)
- 같은 게시글을 보는 중 댓글 알림 클릭 → 새 댓글이 화면에 나타남(전 0 → 후 1), 다른 화면에서는 게시글로 이동
- 미확인: 60초 주기 조회가 실제로 도는지(시간 경과 테스트 안 함), 태블릿(768px)

## 5. 설계 포인트
- 실시간 대신 주기 조회를 고른 이유와 비용(가벼운 count만 주기적으로, 목록은 열 때만), 나중에 Socket.IO로 바꾸면 무엇이 바뀌나(무효화 시점만 이벤트로)
- 읽음·삭제 후 화면을 직접 고치지 않고 queryKey 접두사로 count·목록을 함께 무효화한 이유
- 커서 페이지네이션 + `useInfiniteQuery`(BigInt id를 문자열 커서로)
