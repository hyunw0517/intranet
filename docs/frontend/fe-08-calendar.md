# FE-08. 캘린더 게시판 (월간 달력 + 일정 목록)

> 작업일: 2026-11-05 · 설계(규칙·화면)는 사용자, 구현(백엔드 API + 프론트)은 Claude (11/05 작업 방식 결정)
> 규칙의 원본은 docs/design/features.md 5.3 "캘린더 통합 조회"·"캘린더 비밀 일정"

## 1. 사용자 결정

| 항목 | 결정 |
|---|---|
| 비밀 일정 | 달력·일정 목록에서는 **작성자 본인만** 본다. 게시판 관리자·시스템 관리자도 숨김. 게시글 상세는 기존 규칙(작성자 + 게시판 관리자) 유지 |
| 달력 | 월간, 일~토 순서. 앞뒤 달은 **그 주만** 흐리게 (2026년 11월 → 10월 없음, 12월 1~5일 흐리게) |
| 날짜 색 | 기본 검정(테마 글자색), 일요일 빨강, 토요일 파랑 |
| 일정 표시 | 해당 날짜 칸에 박스. 여러 날 일정은 **걸친 날마다 박스 반복** |
| 화면 | 캘린더 게시판에 들어가면 달력이 기본, [목록]을 누르면 그달 일정 전체 목록 |
| 통합 캘린더 | API는 통합 조회로 만들고, 화면은 이번에 게시판별만 (통합 화면은 같은 API로 나중에) |

## 2. 흐름

```text
[화면]   /boards/:boardId?month=2026-11&view=list
         BoardView (게시판 정보·권한은 기존 목록 응답으로) ─ type이 CALENDAR → CalendarBoard
         monthGrid(2026-11) → 칸: 11/01(일) ~ 12/05(토), gridRange → 조회 기간(KST)
         GET /api/boards/:boardId/events?start=2026-11-01T00:00:00%2B09:00&end=2026-12-06T00:00:00%2B09:00

[서버]   CalendarController (/boards/events, /boards/:boardId/events)
         → PostsService.findCalendarEvents(user, { boardId } | { boardIds }, start, end)
            1. 기간 검사 (end > start, 최대 62일)
            2. 대상 게시판: 단일 → assertBoardPermission(read) + CALENDAR 확인 / 통합 → 내비게이션 판정 결과의 캘린더 ∩ 요청 boardIds
            3. post.findMany: eventStartAt < end AND eventEndAt >= start (겹침), OR [isSecret false, authorId = 나]
            4. 익명 게시판이면 본인 일정이 아닌 작성자 null
         ← { boards: [{id, name}], events: [{ id, boardId, title, eventStartAt, eventEndAt, isAllDay, isSecret, author }] }

[화면]   eventsByDate: 일정마다 KST 시작일~종료일 각 날짜에 넣음 → 칸에 박스
         목록 보기: eventsInMonth로 이번 달과 겹치는 일정만 (앞뒤 주 다른 달 날짜에만 있는 일정 제외)
```

## 3. 파일

| 파일 | 역할 |
|---|---|
| `backend/src/boards/calendar.controller.ts` | 통합·단일 일정 조회 라우트. 고정 경로 `events`가 있어 `BoardsController`(`:boardId`)보다 먼저 등록 |
| `backend/src/boards/dto/calendar-events-query.dto.ts` | `start`·`end`(시간대 필수, `StringToDate`), 통합용 `boardIds`("1,2" 또는 반복 파라미터) |
| `backend/src/boards/posts.service.ts` | `findCalendarEvents`, `resolveCalendarBoards` |
| `frontend/src/services/api/calendar.ts` · `types/calendar.ts` | API 함수(`calendar.controller`와 1:1)·응답 타입 |
| `frontend/src/lib/calendar-month.ts` | 달력 계산, 대시보드 달력과 공용 (KST 날짜 문자열, `Date.UTC`만 사용 → 브라우저 시간대와 무관) |
| `frontend/src/features/board/hooks/use-calendar-events.ts` | `useBoardEvents` + `calendarKeys` (`postKeys.events` 아래. 글 작성·수정·삭제 때 `invalidateLists`가 함께 무효화) |
| `frontend/src/features/board/components/calendar-board.tsx` | 월 이동·오늘·보기 전환, 목록 보기 |
| `frontend/src/features/board/components/calendar-month-grid.tsx` | 월간 칸, 요일 색, 일정 박스, "+N개" → 그날 일정 창 |

모두 Client Component (토큰이 브라우저 메모리에 있고, 월 이동·보기 전환이 URL 상태라서).

## 4. 결정 이유 (Claude 결정, 변경 가능)

- **보고 있는 달·보기를 URL에 둠** (`?month=2026-11&view=list`): 일정 상세에서 뒤로 가거나 새로고침해도 그 달이 유지된다.
- **조회 기간 = 달력에 보이는 칸 전체**: 흐리게 보이는 앞뒤 주 칸에도 일정이 보여야 하므로. 목록은 같은 응답에서 이번 달만 거른다(요청 1번).
- **서버 최대 62일**: 사용자는 "기간 제한 없음"이라 했지만 화면 기준이고, 서버는 API를 직접 호출해 한 번에 모든 일정을 읽는 것을 막는다(한 달 화면은 최대 42일).
- **겹침 조건** `start < 조회 끝 && end >= 조회 시작`: 10/30~11/2 일정처럼 기간 앞에서 시작한 일정도 11월 달력에 나온다.
- **종료가 정확히 다음 날 00:00인 시간 일정**(22:00~24:00)은 다음 날 칸에 넣지 않는다.
- **칸당 일정 수**: 넓은 화면 3개, 모바일(640px 미만) 2개, 넘치면 "+N개" → 그날 일정 창.
- **시간 표시**: 시간 일정은 첫날 칸에 "10:00 제목"(모바일은 공간이 좁아 제목만), 종일·이어지는 날은 제목만.
- **오늘**: 날짜 숫자를 포인트 색 원으로 표시.
- 공휴일은 표시하지 않음 (요청 범위 밖, 공휴일 데이터 필요).

## 5. 확인 (2026-11-05)

- API 19개: 단일·통합 조회, 겹침(기간 앞에서 시작한 일정 포함·기간 밖 제외), 시작 순 정렬, 종일 KST 경계, 본문 미포함, 비밀 일정(작성자만·관리자도 숨김), 익명 작성자 가림(본인은 보임), 통합 교집합(볼 수 없는 id·일반 게시판 id 무시), 일반·카테고리 게시판 400/404, 기간 초과·역순·시간대 없음·`+` 미인코딩 400, 기존 라우트(`/boards/admin`, `/boards/:id`) 정상
- 달력 계산 12개: 2026-11(10월 없음, 12/1~5), 2026-02(정확히 4주), 2026-08(7/26~ 6주), 연말 경계, 여러 날·종일·자정 경계, 목록 월 필터
- 화면 (1440·768·390px): 요일 순서, 일·토 색, 다음 달 흐림, 여러 날 반복, 내 비밀 일정 표시, 다음 달 칸 일정, 종일 일정, "+N개"(모바일 +2 / 넓은 화면 +1) 창 4개, 목록 보기(이번 달 7개만·시작 순), 다음 달 이동, 가로 넘침·페이지 오류 없음, 관리자에게 비밀 일정 숨김, 일정 박스 → 상세

## 5-1. 고친 버그 (같은 날)

- 달력에서 일정을 눌러 상세로 가면 "서버에 연결할 수 없습니다"가 표시됨 → 처음에 일정 캐시 키를 `postKeys.lists(boardId)` 아래에 뒀는데, 상세 조회 시 조회수를 맞추는 `syncListAfterView`가 그 아래 캐시를 **모두 목록 모양**(`pinned`, `data`)으로 고치다 일정 응답에서 `prev.pinned.map` TypeError. 공통 에러 메시지가 TypeError를 네트워크 오류 문구로 보여 줘 서버 문제처럼 보였다.
- 수정: 일정 키를 `postKeys.events(boardId)`로 분리하고, 글 변경 후 `invalidateLists`가 일정 키도 함께 무효화. 게시판 24에서 달력·목록 → 상세 → 뒤로, 새 일정 작성 후 달력 반영 확인(7개).

- 상세의 "← 게시판"·글쓰기 취소·삭제 후 이동이 항상 `/boards/:id`라 보던 년월(달력)·페이지·검색(일반 게시판)이 사라짐 (사용자 발견: 1월 달력 → 상세 → 돌아가기 → 이번 달) → `board-list-href.ts`: `BoardView`가 주소가 바뀔 때마다 `sessionStorage`(탭 단위)에 저장, 돌아가는 링크는 `useSyncExternalStore`로 읽음(서버 렌더·첫 렌더는 기본 주소라 hydration 불일치 없음). 저장값은 그 게시판 주소일 때만 사용. 확인 6개(달력 1월·목록 보기 유지, 글쓰기 취소, 일반 게시판 2페이지 유지).

## 6. 설계 포인트
- 기간 조회의 **겹침 조건** (여러 날 일정이 조회 기간에 걸치는 경우)
- 시간대: 서버는 UTC 저장, 화면 계산은 KST 날짜 문자열로 통일 (브라우저 시간대와 무관하게)
- 통합 조회와 단일 조회를 **같은 서비스**로 (단일 = `[boardId]`), 요청한 게시판은 볼 수 있는 게시판과의 **교집합**만
- 비밀 일정 규칙을 화면별로 다르게 둔 이유 (달력은 개인 일정 성격 → 본인만, 상세는 관리 목적 → 게시판 관리자 포함)

## 추가: 일정 색 (2026-11-12)

- 글쓰기·수정의 일정 칸 아래 **색상** 고르기(동그라미 7개: 기본·빨강·주황·노랑·파랑·보라·회색, `role="radiogroup"`). 사용자 결정: 정해진 색 중 일정마다 작성자가 선택
- 서버는 색 이름만 저장(`eventColor`, null = 기본). 실제 색은 `features/board/calendar-colors.ts`의 `EVENT_COLOR_OPTIONS`가 라이트/다크 클래스로 정한다 → 자유 색상(#RRGGBB)이면 다크 모드에서 글자가 안 보이는 색이 생길 수 있어 고정 목록으로 함
- 달력 박스는 `eventColorOption(event.eventColor).box`, 목록 보기는 제목 앞 색 점
- 초록은 "휴가 N명" 항목(FE-13) 색이라 선택지에 없다
- 확인: 달력 빨강 박스·초록 휴가 항목(라이트·다크), 작성 화면 색 7개·선택. 백엔드 e2e `test/calendar-color.e2e-spec.ts` 3개(저장·조회, 수정 시 유지/기본색/400, 일반 게시판 무시)
