# FE-04. 직원용 게시판 내비게이션

> 작업일: 2026-11-01 · 백엔드 `GET /boards/navigation`(board-auth.controller)을 직원용 사이드바에 연결
> 게시글 목록·작성은 게시글 API 이후 작업. 지금 게시판 화면은 이름·설명과 "준비 중" 안내만 표시한다.

## 1. 화면과 경로

| 위치 | 내용 |
|---|---|
| 직원용 사이드바 "게시판" 그룹 | 업무 → **게시판** → 개인 순서. 카테고리는 접기·펼치기(Collapsible), 카테고리 아래 게시판은 하위 메뉴. 카테고리가 아닌 최상위 게시판은 바로 링크 |
| `/boards/[boardId]` | 게시판 이름·설명·(카테고리 · 타입). 게시글 영역은 "아직 구현되지 않았습니다" |

- 메뉴에 무엇을 보여 줄지는 **서버가 정한다.** 서버가 읽기 권한으로 거른 목록을 그대로 그린다. 프론트는 권한 규칙을 다시 계산하지 않는다.
- 펼침 상태: 처음에는 모두 접힘. 현재 보고 있는 게시판의 카테고리는 자동으로 펼친다. 메모리 상태라 새로고침하면 처음 상태로 돌아간다.
- 아이콘만 보이는 접힌 사이드바에서 카테고리를 누르면 사이드바를 펼친다. 접힌 상태에서는 하위 메뉴가 보이지 않기 때문이다.
- GUEST에게는 그룹 자체를 숨기고 요청도 보내지 않는다. 서버는 `@Roles(USER)`로 403을 준다.
- 상태 표시:
  - 로딩: 스켈레톤 3줄
  - 오류: "불러오지 못했습니다"와 다시 불러오기 버튼
  - 빈 목록: "볼 수 있는 게시판이 없습니다"

## 2. 파일 구조와 역할

```text
src/
├── app/(main)/
│   ├── layout.tsx                         (수정) AppShell에 extraNav={<BoardNavGroup />}
│   └── boards/[boardId]/page.tsx          Server: boardId 숫자 확인만 (아니면 notFound)
│
├── services/api/board-auths.ts            (수정) fetchBoardNavigation - board-auth.controller 대응
├── types/board.ts                         (수정) BoardNavItem
│
├── features/board/                        ← 직원용 게시판 기능 (이후 게시글 화면도 여기)
│   ├── hooks/use-board-navigation.ts      boardKeys + useBoardNavigation (GUEST면 요청 안 함)
│   └── components/
│       ├── board-nav-group.tsx            사이드바 게시판 그룹 (카테고리 접기·활성 표시)
│       └── board-view.tsx                 게시판 화면 (내비게이션 캐시에서 게시판 찾기)
│
├── components/layout/
│   ├── app-shell.tsx                      (수정) extraNav prop 전달
│   ├── app-sidebar.tsx                    (수정) 고정 메뉴 첫 그룹 다음에 extraNav 표시
│   └── app-header.tsx                     (수정) /boards/* 에서 헤더 제목 "게시판"
│
└── features/admin/hooks/use-admin-boards.ts   (수정) 게시판·권한 변경 시 boardKeys.all도 무효화
```

- **왜 슬롯(extraNav)인가**: `components/layout`은 직원용·관리자용이 같이 쓰는 공용 셸이다. 사이드바가 `features/board`를 직접 import하면 공용 컴포넌트가 특정 기능에 의존하게 된다. 그래서 `(main)/layout.tsx`가 기능 컴포넌트를 골라 넣고, 셸은 받은 것을 그 자리에 그리기만 한다.
- **API 함수가 `board-auths.ts`에 있는 이유**: 백엔드에서 내비게이션은 `board-auth.controller`에 있다. 권한 판정 결과이기 때문이다. 서비스 파일은 백엔드 컨트롤러와 1:1로 맞춘다.
- **관리자 훅이 `boardKeys`를 import하는 이유**: 관리자가 게시판을 추가·삭제하면 같은 브라우저의 직원용 메뉴도 바로 바뀌어야 한다. 이것은 queryKey 하나를 가져오는 것이고 API 함수를 가져오는 것이 아니다. 기능 간 API import 금지 규칙과는 별개로 보았다.

## 3. 데이터 흐름

```text
(main)/layout (Server)
  └ AppShell (Server, 사이드바 쿠키) ── extraNav ──▶ AppSidebar (Client)
                                                      └ BoardNavGroup (Client)
                                                          └ useBoardNavigation ── GET /api/boards/navigation
                                                                                   (Bearer access token)
/boards/[boardId]/page (Server: id 검사)
  └ BoardView (Client) ── 같은 queryKey ["boards","navigation"] → 캐시 재사용, 추가 요청 없음
```

- 메뉴와 게시판 화면이 같은 캐시를 쓴다. 메뉴를 그리면서 이미 받은 목록이라, 게시판 화면은 요청을 더 보내지 않는다.
- 게시판 화면에서 목록에 없는 id(없음, 권한 없음, 카테고리)는 "게시판을 찾을 수 없습니다"로 보여 준다. 서버 정책(읽기 권한 없음 → 404)과 같은 응답이다.
- 로그아웃하면 `queryClient.clear()`로 캐시를 비운다. 다른 계정으로 로그인했을 때 이전 사용자의 메뉴가 남지 않는다.
- Server/Client 구분: 토큰이 브라우저 메모리에 있다. 그래서 권한이 필요한 조회는 모두 Client Component에서 하고, Server Component는 URL 형식만 검사한다. FE-03과 같은 방식이다.

## 4. 확인 결과

- `tsc --noEmit`, `eslint`, `next build` 통과
- 실제 API 호출(seed 계정)에서 회원마다 다른 목록이 왔다.
  - 2611010: 공지·업무·문의·커뮤니티 카테고리와 경영지원·사업본부 게시판, 총 15개
  - 2611150: 전략기획본부 게시판, 총 13개
- 브라우저 화면(390 / 768 / 1440)은 직접 확인이 필요하다.

## 5. 설계 포인트
- "메뉴를 숨기는 걸로 권한을 지키나요?" → 아니다. 메뉴는 서버 판정 결과를 표시할 뿐이고, 게시글 API도 요청마다 서버가 `assertBoardPermission`으로 다시 검사한다.
- "권한 판정을 프론트에서 하지 않은 이유?" → 규칙(부서 트리, 직급 순위, 겸직)을 프론트에 내려보내면 조직 구조가 노출되고, 판정 로직이 두 곳에 생긴다.
- 공용 레이아웃에 기능 메뉴를 넣을 때의 의존 방향: 슬롯으로 레이아웃이 조립한다.

## 6. 남은 작업

- 게시판 단건 조회 API가 없다. 지금은 내비게이션 캐시에서 이름을 찾는다. 게시글 목록 API가 게시판 정보와 권한(`BoardPermission`)을 같이 내려주면 그 응답으로 바꾼다.
- 게시글 목록·상세·작성 화면 (게시글 API 이후)
- 다른 회원의 메뉴는 권한 규칙이 바뀌어도 바로 갱신되지 않는다. 다음 조회 때 반영된다(staleTime 30초, 새로고침).
