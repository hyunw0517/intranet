# FE-06. 게시글·댓글 화면

> 작업일: 2026-11-04 · 백엔드 `posts.controller`, `comments.controller`를 직원용 게시판 화면에 연결
> 이미지·첨부, 앨범 그리드, 캘린더 달력 화면은 파일 기능·캘린더 통합 조회 이후 작업.

## 1. 화면과 경로

| 경로 | 화면 | 사용하는 API |
|---|---|---|
| `/boards/[boardId]` | 게시글 목록: 고정글 + 페이지 목록, 검색(제목·내용·작성자), 정렬(최신·조회·좋아요), 글쓰기 버튼 | `GET /boards/:boardId/posts` |
| `/boards/[boardId]/write` | 글쓰기 (Tiptap 에디터, 비밀글·상단 고정·일정은 게시판 설정·권한에 따라) | `GET /boards/:boardId`(`board`, `perm`) + `POST .../posts` |
| `/boards/[boardId]/posts/[postId]` | 상세: 본문, 좋아요, 고정·수정·삭제, 댓글 | `GET .../posts/:postId`, `PATCH .../pin`, `PATCH .../like`, `DELETE .../unlike`, `DELETE .../posts/:postId`, 댓글 API |
| `/boards/[boardId]/posts/[postId]/edit` | 글 수정 (작성자만) | 상세 응답 + `PATCH .../posts/:postId` |

- 수정 경로(`posts/[postId]/edit`)는 AGENTS.md 13장 라우팅 표에 없어 이번에 추가했다. 쓰기(`write/`)와 같은 깊이로 두지 않은 이유는 "어떤 글을" 수정하는지가 경로에 드러나도록 하기 위해서다.
- 페이지·검색·정렬은 URL 검색 파라미터(`?page=2&field=title&q=...&sort=viewCount`)에 둔다. 상세에서 뒤로 가기·새로고침해도 목록 위치가 유지된다. (FE-05 회원 목록과 같은 방식)

### 게시판 설정·권한에 따른 차이 (모두 서버 응답을 따르고, 서버도 같은 기준으로 다시 검사한다)

| 항목 | 화면 | 서버 |
|---|---|---|
| 글쓰기 버튼 | `perm.write`일 때만 | 작성 403 |
| 비밀글 체크박스 | `board.allowSecret`일 때만 | 허용하지 않는 게시판이면 값 무시 |
| 상단 고정 | 작성 화면은 `perm.admin`일 때 체크박스, 상세는 `can.pin`일 때 버튼 | 관리자가 아니면 값 무시 / 403, 최대 10개 400 |
| 일정 입력 | `board.type === "CALENDAR"`일 때만, 시작·종료 필수 | 캘린더가 아니면 null, 캘린더면 필수 400 |
| 작성자 검색 | 익명 게시판이면 검색 항목에서 뺀다 | 400 |
| 수정·삭제 버튼 | 상세 `can.edit` / `can.delete`, 댓글은 행마다 `can` | 403 |
| 댓글 입력 | `can.comment`가 없으면 "권한이 없습니다" 안내만 | 403 |
| 볼 수 없는 비밀글 | 목록에서 회색 제목, 링크 없음 | 상세 403 |
| 가린 작성자 | 익명 게시판이면 "익명", 그 외(비밀글)는 "비공개" | 작성자·소속 null |

## 2. 파일 구조와 역할

```text
src/
├── app/(main)/boards/[boardId]/
│   ├── page.tsx                          (기존) 목록 - BoardView
│   ├── write/page.tsx                    Server: boardId 숫자 확인 → PostCreateView
│   └── posts/[postId]/
│       ├── page.tsx                      Server: id 확인 → PostDetailView
│       └── edit/page.tsx                 Server: id 확인 → PostEditView
│
├── services/api/
│   ├── boards.ts                         (수정) fetchBoard - GET /boards/:boardId (게시판 설정 + 내 권한)
│   ├── posts.ts                          posts.controller 대응 (목록·상세·작성·수정·삭제·고정·좋아요)
│   └── comments.ts                       comments.controller 대응
├── types/post.ts                         게시글·댓글 응답 타입 (BoardPermission, PostDetail, PostComment …)
├── lib/format.ts                         (수정) formatDateTime·formatListDate·toKstParts - 시각을 KST로 표시
├── components/ui/textarea.tsx            shadcn Textarea (댓글 입력)
├── app/globals.css                       (수정) .rich-text - 에디터와 상세 본문이 같은 모양
│
└── features/board/
    ├── event-date.ts                     캘린더 일정 입력값 ↔ API 값 (+09:00 고정), 검증, 표시
    ├── hooks/use-posts.ts                postKeys, useBoardAccess·usePosts·usePost·useComments, usePostCache, useCommentMutation
    ├── hooks/use-board-navigation.ts     (수정) boardKeys.access(boardId)
    └── components/
        ├── board-view.tsx                (수정) 목록 화면 (검색·정렬·페이지, 404 → 게시판 없음)
        ├── post-list.tsx                 목록 행 (PC: 열 정렬 / 모바일: 제목 + 메타 한 줄)
        ├── post-author.tsx               작성자 이름 + 작성 당시 부서·직급, 가린 작성자 표시
        ├── post-form.tsx                 작성·수정 공용 폼 (제목, 일정, 에디터, 비밀글, 고정)
        ├── post-write-view.tsx           PostCreateView / PostEditView (권한 확인 + 저장 후 이동)
        ├── post-detail-view.tsx          상세 + 좋아요·고정·수정·삭제
        ├── comment-section.tsx           댓글 트리, 스레드 페이지, 답글·수정·삭제
        ├── rich-text-editor.tsx          Tiptap 에디터 + 툴바 + 링크 입력
        ├── rich-text-content.tsx         본문 HTML 표시
        └── board-not-found.tsx           게시판·게시글 404 화면 (기존 board-view에서 분리)
```

- **새 라이브러리**: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` (3.32.2). docs/design/features.md 5.3에서 이미 정한 에디터다. v3 StarterKit에 Link·Underline이 들어 있어 확장 패키지를 따로 넣지 않았다.
- **에디터 기능을 서버 허용 목록에 맞춘 이유**: 서버 `sanitize-html`이 허용하지 않는 태그(예: 표, 글자색)를 에디터에서 만들 수 있으면, 저장할 때 서버에서 조용히 사라진다. 그래서 툴바에는 허용 목록 안의 기능만 둔다. (제목 h2·h3, 굵게·기울임·밑줄·취소선·코드, 링크, 목록, 인용, 코드 블록, 구분선)
- **수정·작성 화면이 한 파일인 이유**: 둘 다 "권한 확인 → 같은 폼 → 저장 후 이동"이고, 다른 점은 게시판 정보를 어디서 읽는지(게시판 단건 / 게시글 상세)뿐이다.
- **글쓰기가 게시판 단건 조회를 쓰는 이유**: 폼은 입력을 받기 전에 게시판 타입(일정 입력), 비밀글 허용, 쓰기·관리 권한을 알아야 한다. 수정 화면은 상세 응답(`board`, `can`)에 이 값이 있지만, 글쓰기는 아직 `postId`가 없어 상세를 부를 수 없다. 처음에는 목록 응답의 `board`·`perm`을 빌려 썼고, 이후 `GET /boards/:boardId`가 생겨 바꿨다. 저장 시 서버의 권한 검사(`createPost`의 `assertBoardPermission`)와는 역할이 다르다. 그 검사는 막는 용도이고, 이 값은 화면을 그리는 용도다.

## 3. 데이터 흐름과 캐시

```text
목록  usePosts(boardId, query) ── GET /posts?page&title&sortBy ──▶ { board, perm, pinned, data, meta }
글쓰기 useBoardAccess(boardId) ── GET /boards/:boardId ──▶ { board, perm }   (key: boardKeys.access)
상세  usePost(boardId, postId) ── GET /posts/:postId  (서버가 조회수 +1, liked 포함)
          ├ 좋아요·고정 → setQueryData로 상세 캐시만 수정 (다시 요청하지 않음)
          └ 수정 화면 → 같은 키 + staleTime Infinity (상세에서 넘어오면 다시 요청하지 않음)
댓글  useComments(boardId, postId) ── GET /comments ──▶ 트리 순서 평평한 목록
          └ 작성·수정·삭제 → 댓글 + 목록(댓글 수) invalidate
```

queryKey는 `["boards", "posts", ...]`로 기존 `boardKeys.all` 아래에 둔다. 관리자가 게시판 설정을 바꾸면 기존 무효화(FE-04)에 함께 걸린다.

### 상세를 다시 요청하지 않으려고 한 것들 (조회수)

상세 조회 API는 요청할 때마다 조회수를 올린다(같은 사람이 다시 봐도 +1, 열람 기록은 1번). 프론트가 상세를 다시 받으면 그만큼 조회수가 오른다.

| 상황 | 처리 |
|---|---|
| 좋아요·고정 | `invalidateQueries` 대신 `setQueryData`로 `likeCount`·`isPinned`만 바꾼다 |
| 상세 → 수정 화면 | 같은 키에 `staleTime: Infinity` → 캐시가 있으면 요청하지 않는다 |
| 수정·삭제 직후 | `invalidateQueries({ refetchType: "none" })` → 오래된 값으로 표시만 하고, 다음에 상세에 들어올 때 새로 받는다. `removeQueries`는 화면이 떠 있는 동안 다시 요청해 삭제 직후 404가 잠깐 보이거나 조회수가 오를 수 있어 쓰지 않았다 |
| 창 포커스 | 기존 설정 `refetchOnWindowFocus: false` |
| 상세를 보고 목록으로 돌아올 때 | 목록 캐시는 `staleTime`(30초) 동안 신선하다고 보아 다시 요청하지 않는다. 그래서 상세를 보기 전 조회수가 그대로 보였다(버그). 상세 `queryFn`에서 ① 캐시된 목록의 그 글 조회수·좋아요 수를 상세 값으로 바로 고치고(`setQueriesData`) ② 목록을 `refetchType: "none"`으로 무효화해 돌아올 때 다시 받는다 |

목록 개수 라벨: 검색·페이지를 바꾼 직후에는 이전 목록(`keepPreviousData`)을 보여 준다. 이때 라벨만 "검색 결과"로 바뀌고 이전 개수가 보이던 문제가 있었다. 그래서 `isPlaceholderData`인 동안에는 "불러오는 중"으로 표시한다.

### 댓글 페이지 (최상위 댓글 20개 단위)

- 백엔드는 트리 전체를 트리 순서(부모 → 자식, 작성순)로 준다. 화면은 `depth === 0`이 나올 때마다 새 스레드로 묶고, 스레드 20개씩 페이지를 나눈다. 평평한 목록을 개수로 자르면 답글이 부모와 다른 페이지로 떨어지기 때문이다.
- 들여쓰기는 깊이 4까지만 한다(모바일은 절반 폭). 그보다 깊은 답글은 같은 위치에 그리므로 `@부모 작성자`를 앞에 붙인다. 깊이 자체는 서버가 제한하지 않는다(docs/design/features.md 5.3).
- 새 최상위 댓글은 작성순 맨 뒤에 붙으므로 등록 후 마지막 페이지로 이동한다.
- 삭제된 댓글(답글이 남은 경우만 서버가 내려줌)은 회색 "(삭제된 댓글입니다)"이고 답글 버튼이 없다. 서버도 삭제된 댓글에 답글을 막는다(400).

## 4. 보안·표시 규칙

- **본문 HTML**: 서버가 저장할 때 허용 목록으로 정제한 HTML을 `dangerouslySetInnerHTML`로 그린다. 프론트 정제를 따로 두지 않은 이유는 API를 직접 호출해도 서버에서 막히기 때문이다. 정제는 저장 시점 한 곳에서 지킨다.
- **댓글**: 일반 텍스트로 그린다. React가 이스케이프하고, 줄바꿈만 `whitespace-pre-wrap`으로 살린다.
- **링크**: 에디터에서 http·https·mailto만 받는다(스킴이 없으면 https). 서버도 같은 스킴만 남기고 `target="_blank" rel="noopener noreferrer nofollow"`를 붙인다.
- **시각 표시**: 서버는 UTC ISO 문자열로 응답한다. 기존 `formatDate`(앞 10자리)는 DATE 컬럼용이라, 시각에 쓰면 KST 00~09시가 전날로 보인다. 그래서 `Intl.DateTimeFormat`(`Asia/Seoul`)로 바꾼다.
- **일정 입력**: `<input type="date|time">` 값에는 시간대가 없다. 브라우저 시간대와 관계없이 `+09:00`을 붙여 보낸다. 서버의 종일 처리(KST 00:00:00~23:59:59)와 기준이 같다.

## 5. 확인 결과

- `tsc --noEmit`, `eslint`, `next build` 통과
- 프론트 `/api` 프록시를 거친 실제 API 호출(seed 2611010·2611011, 관리자 2610002). 테스트 데이터는 확인 후 DB에서 삭제했다.
  - 목록 응답 `board`·`perm`·`pinned`·`meta`
  - 에디터 서식 HTML(h2, strong, u, s, code, a, ul, blockquote, pre, hr)이 정제 후에도 남는지
  - 링크에 `target`·`rel`이 붙는지
  - 상세 `can`이 보는 사람마다 다른지
  - 좋아요 → 다시 좋아요 409 → 취소 → 다시 취소 400
  - 댓글·답글 depth, 공백 댓글 400, 답글 수정, 목록 댓글 수 반영
  - 수정, 검색 중 `pinned` 빈 배열
  - 캘린더(관리자): `09:00+09:00` → `00:00Z`, 종일 11/05~11/06 → `11/04 15:00Z ~ 11/06 14:59:59Z`, 일정 없음 400
- **브라우저 E2E (Playwright + 설치된 Edge, 58개 항목 통과)**:
  - 일반 회원: 서식 글쓰기 → 상세, 좋아요·새로고침 유지·취소, 댓글·답글·답글의 답글(들여쓰기 0/24/48px), 댓글 수정, 부모 삭제 후 자리 표시, 글 수정, 목록 댓글 수, 검색과 새로고침 후 유지, 삭제 후 404 화면, 캘린더 쓰기 권한 없음 안내
  - 관리자: 종일·시간 일정 작성과 화면 검증, 상단 고정·해제
  - 390 / 768 / 1024 / 1440, 다크 모드에서 가로 넘침 없음, 콘솔 에러 없음 (로그인 전 refresh 401, 삭제한 글을 일부러 연 404는 제외)
  - 테스트 데이터는 DB에서 삭제했다.

### E2E에서 찾아 고친 것

| 증상 | 원인 | 수정 |
|---|---|---|
| 링크 창에서 [저장]을 누르면 글이 등록됨 | 링크 Dialog는 portal로 밖에 그려지지만 React 트리에서는 게시글 `<form>` 안이다. React 이벤트는 React 트리를 따라 전파되어 게시글 폼의 `onSubmit`까지 실행됐다(링크가 들어가기 전 본문으로 저장) | 링크 폼 submit에서 `e.stopPropagation()` |
| 툴바 버튼을 누른 직후 Enter가 줄바꿈이 아니라 버튼을 다시 누름 | 버튼이 포커스를 가져가고, `chain().focus()`가 에디터로 되돌리기 전에 키가 입력됨 | 툴바 버튼 `onMouseDown`에서 `preventDefault()` (포커스·선택 영역 유지) |
| 768px에서 목록이 가로로 92px 넘침 | 사이드바(256px)를 빼면 본문이 448px인데, 검색·정렬 한 줄 배치(약 540px)와 목록 열 배치(약 472px)가 `sm`·`md`부터 시작 | 한 줄 배치를 `lg`(1024px)부터 |
| 상세의 "(수정됨)"이 조회만 해도 표시 | 게시글 `updatedAt`은 Prisma `@updatedAt`이라 조회수·좋아요·고정 `post.update`에도 바뀐다 | 게시글에서는 표시하지 않음 (아래 6장). 댓글은 수정·삭제 때만 바뀌므로 `updatedAt !== createdAt`으로 표시 |
| 고정글이 있을 때 "전체 1건"인데 2건이 보임 | `meta.total`은 고정글을 뺀 개수 | 검색 중이 아니면 `meta.total + pinned.length` |
| 일정 오류 후 날짜를 고쳐도 빨간 테두리 유지 | 오류는 제출할 때만 다시 계산 | 일정 값이 바뀌면 오류 표시 제거 |

## 6. 백엔드 변경과 남은 일

처음 연결할 때 백엔드에 없던 두 가지는 사용자 요청으로 추가했다(커밋 `f3a8732`).

1. **상세 응답 `liked`**: 처음에는 응답에 없어서 버튼이 항상 "누르지 않음"으로 시작했다. 그래서 409·400 응답을 받으면 버튼 상태를 맞추는 우회 처리를 두었다. `readPost`가 조회수 트랜잭션 안에서 `postLike`를 함께 읽게 바뀐 뒤 우회 처리를 지웠다. 지금은 409·400이 오면 서버 메시지만 보여 준다(다른 탭에서 이미 누른 경우 등).
2. **게시판 단건 조회 `GET /boards/:boardId`**: `assertBoardPermission(boardId, user, 'read')` 결과(`{ board, perm }`)를 그대로 반환한다. 글쓰기 화면이 목록 응답 대신 이것을 쓴다.

남은 일:

- 목록 응답에 일정 필드(`eventStartAt`, `eventEndAt`, `isAllDay`)가 추가되어 타입에는 반영했다. 목록에는 아직 표시하지 않는다. 달력 화면(캘린더 통합 조회)을 만들 때 함께 정한다.
- **게시글 "수정됨" (해결, 2026-11-04)**: 게시글 `updatedAt`은 조회수 증가(`readPost`)·좋아요 수·고정 변경의 `post.update`에도 Prisma `@updatedAt`으로 갱신되어 수정 여부를 알 수 없었다. 백엔드에 `editedAt`(nullable, `updatePost`에서만 기록, 작성 시 null) 컬럼이 추가되어(마이그레이션 `20261104102054_post_add_edited_at`) 상세 화면에서 `editedAt`이 있으면 회색 "(수정됨)"을 표시하고, 마우스를 올리면 수정 시각을 보여 준다. `updatedId`는 고정한 관리자 등 "마지막으로 손댄 사람" 감사 기록이라 그대로 둔다(마지막 수정자는 항상 `authorId`).

## 7. 설계 포인트
- "조회수가 있는 상세를 캐시와 어떻게 맞췄나요?" → 상세 요청 자체가 부작용(조회수 +1)이 있다. 그래서 변경 후 다시 요청하지 않고 `setQueryData`로 고쳤다. 수정·삭제 후에는 `refetchType: "none"`으로 "다음에 다시 받기"만 표시했다.
- "댓글 페이지를 왜 프론트에서 나누나요?" → 트리를 개수로 자르면 답글이 부모와 떨어진다. 서버가 트리 순서로 주므로 depth 0 기준으로 스레드를 묶어 나눈다.
- "에디터 HTML을 그대로 그려도 안전한가요?" → 저장 시 서버가 허용 목록으로 정제한다. 에디터 기능도 그 목록 안으로 제한해 저장 후 내용이 사라지는 일이 없게 했다.
- "버튼을 숨기면 권한이 지켜지나요?" → 아니다. `perm`·`can`은 서버가 계산한 표시용 값이고, 각 API가 요청마다 다시 검사한다.
