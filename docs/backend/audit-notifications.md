# 감사 로그 · 알림 구조 (핵심 common 모듈)

> 작성일: 2026-11-09 · 브랜치 `backend/audit` · 복습용 상세 문서
> 설계 규칙은 [features.md](../design/features.md) 9장, 결정 과정은 [devlog](../devlog/2026-11-09.md)의 2026-11-09 항목을 참고한다.
> 이 문서의 값(보관 기간, 배치 시각, 경로)은 작성 시점 코드 기준이다. 코드가 바뀌면 코드가 우선이다.

---

## 0. 한 장 요약

```text
요청 ─▶ body-parser ─▶ RequestContextMiddleware (AsyncLocalStorage에 req 저장)
                         └▶ AccessTokenGuard (req.user 채움) ─▶ Controller ─▶ Service
                                                                              │
                         업무 서비스: prisma.$transaction(async (tx) => {     │
                             업무 작업 ...                                    │
                             auditService.log({...}, tx)        ◀─────────────┘ 작업자·IP·UA는 컨텍스트에서
                             notificationsService.send({...}, tx)   (사용자가 정한 곳만)
                         })
```

| 구분 | 감사 로그 (`AuditService`) | 알림 (`NotificationsService`) |
|---|---|---|
| 호출 위치 | 모든 CRUD | 사용자가 정한 곳만 |
| 관점 | 작업자가 무엇을 했는지 | 받는 사람에게 무슨 일이 생겼는지 |
| enum | `AuditTargetType` / `AuditActionType` | `NotificationTargetType` / `NotificationActionType` |
| 삭제 | 하지 않음 (쌓기만) | 물리 삭제 (본인 삭제 + 90일 배치) |
| API | `common/audit-logs` (`AUDIT` 기능, 조회만, 2026-11-18 추가) | `common/notifications` (본인 알림만) |

기억할 원칙 네 가지:

1. **감사 로그는 업무와 같은 트랜잭션, 알림은 커밋 후.** 감사 로그는 `tx`를 넘겨 업무가 롤백되면 함께 롤백된다. 알림은 커밋이 끝난 뒤 보내고 실패해도 업무를 막지 않는다(2026-11-09 변경, 7장). "로그는 있는데 실제로는 안 된 작업"이 생기지 않는다(대신 로그 저장이 실패하면 업무도 실패).
2. **서비스는 req를 모른다.** 작업자·IP·User-Agent는 AsyncLocalStorage에서 꺼낸다. 호출하는 쪽은 대상·행동·변경 내용만 넘긴다.
3. **common은 업무 모듈을 모른다.** 대상은 `targetType + targetId`, 알림 이동 주소는 보내는 쪽이 `link`로 정한다.
4. **민감 정보는 남기지 않는다.** `password`·`tokenHash`·`currentJti`·`previousJti`는 detail의 어느 깊이에 있어도 제거된다.

---

## 1. 요청 컨텍스트 (AsyncLocalStorage)

파일: `backend/src/common/context/request-context.ts`

- Node 내장 `node:async_hooks`의 `AsyncLocalStorage`. 라이브러리 추가 없음.
- `storage.run(req, next)`: 이 요청에서 이어지는 모든 비동기 흐름(가드·컨트롤러·서비스의 `await`)에서 `storage.getStore()`가 같은 `req`를 돌려준다. 요청마다 저장소가 따로라 동시 요청끼리 섞이지 않는다.
- **req 자체를 저장하는 이유**: 미들웨어는 가드보다 먼저 실행되므로 저장 시점에는 `req.user`가 없다. 꺼낼 때 읽으면 가드가 채운 값을 본다.
- **`main.ts`의 `app.use()`가 아니라 Nest 미들웨어(`AppModule.configure`)로 등록한 이유**: `app.use()`는 body-parser보다 먼저 실행되는데, body-parser는 스트림 이벤트 콜백에서 `next()`를 불러 그 뒤로 컨텍스트가 끊길 수 있다. Nest 미들웨어는 body-parser 다음에 실행된다.
- HTTP 요청 밖(배치·시드)에서는 모두 `undefined` → 작업자 NULL.
- 대안이었던 방식: 컨트롤러에서 `@AuditMeta()`로 만들어 서비스 인자로 전달. 흐름은 코드에 보이지만 모든 CRUD 메서드의 인자가 늘어난다.

IP: `req.ip`다. 운영은 Nginx 뒤라 `main.ts`에서 `trust proxy`를 1(바로 앞 프록시 한 단계만 믿기)로 두어 `X-Forwarded-For`의 마지막 주소(Nginx가 본 실제 접속 주소)를 쓴다. 사용자가 헤더에 넣은 앞쪽 값은 쓰이지 않는다. 백엔드 포트를 외부에 열지 않는 것이 전제다(2026-11-27).

---

## 2. 감사 로그

파일: `backend/src/common/audit.service.ts`, `backend/src/common/util/audit-detail.util.ts`

```ts
// 단건 - 수정
await this.auditService.log({
    targetType: AuditTargetType.BOARD, targetId: board.id, actionType: AuditActionType.UPDATE,
    content: `게시판 수정: ${board.name}`,
    detail: { changes: diffChanges( before, body ) },   // 바뀐 필드만 { before, after }
}, tx);

// 일괄 - targetIds 배열 → 1행
await this.auditService.logBatch({
    targetType: AuditTargetType.USER, targetIds: ids, actionType: AuditActionType.ROLE_CHANGE,
    content: `권한 일괄 변경: ${role}`,
    changes: batchChanges( beforeRows, 'role', role ),  // pk별 변경 전 값
}, tx);

// 작업자가 없는 경우 (로그인 실패)
await this.auditService.log({ targetType: AuditTargetType.USER, actionType: AuditActionType.LOGIN_FAILED, actorId: null, detail: { empNo } });
```

`detail` 형식:

| 경우 | targetId | detail |
|---|---|---|
| 단건 | 대상 pk | `{ changes: { name: { before: "A", after: "B" } } }` |
| 일괄 (2개 이상) | NULL | `{ batch: true, targetIds: [5, 7], changes: { role: { before: { "5": "GUEST", "7": "USER" }, after: "ADMIN" } } }` |
| 일괄인데 1개 | 대상 pk | 단건과 같은 형태 (대상별 이력 인덱스에 잡히도록) |

- `diffChanges(before, after)`: `after`에 있는(undefined가 아닌) 필드 중 값이 바뀐 것만. JSON 형태로 비교하므로 Date는 시각, 배열·객체는 내용으로 비교한다.
- `toAuditJson`: Date → ISO 문자열, BigInt → 문자열, 민감 필드 제거 후 jsonb로 저장.
- 일괄 행은 `targetId`가 NULL이라 `(targetType, targetId)` 인덱스로는 안 잡힌다. 회원별 이력 화면이 생기면 `detail.targetIds`로도 찾아야 한다(GIN 인덱스 필요).

---

## 3. 알림

파일: `backend/src/common/notifications.service.ts`, `notifications.controller.ts`

```ts
await this.notificationsService.send({
    userIds: [ post.authorId ],
    actionType: NotificationActionType.POST_COMMENTED,
    targetType: NotificationTargetType.POST, targetId: post.id,
    title: '내 글에 댓글이 달렸습니다.',
    link: `/boards/${boardId}/posts/${post.id}`,
}, tx);
```

- 받는 사람마다 행 1개(`createMany`). `userIds` 중복 제거, **보낸 사람 본인은 제외**(시스템 알림은 `senderId: null`).
- 보낸 사람은 생략하면 요청 컨텍스트의 로그인 회원.

API (모두 `@Roles(USER)`, 본인 알림만 - 다른 사람 알림 id는 404):

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/common/notifications?cursor=&take=&unreadOnly=true` | 내 알림 목록 (최신순, 커서) |
| GET | `/common/notifications/unread-count` | 안 읽은 수 `{ count }` |
| PATCH | `/common/notifications/read-all` | 모두 읽음 `{ count }` |
| PATCH | `/common/notifications/:id/read` | 읽음 (204, 이미 읽었으면 그대로 - `readAt`은 처음 읽은 시각) |
| DELETE | `/common/notifications/:id` | 삭제 (204, 물리 삭제) |
| DELETE | `/common/notifications/read` | 읽은 알림 삭제 `{ count }` (안 읽은 알림은 남김, 2026-11-09 프론트 알림 작업 때 추가) |

정리 배치: `@Cron('0 0 4 * * *', { timeZone: 'Asia/Seoul' })` - 매일 04:00 KST에 90일 지난 알림 `DELETE`. 서버가 여러 대여도 같은 조건의 DELETE라 중복 실행돼도 결과가 같다. 규모가 커지면 월별 파티션 + 오래된 파티션 DROP.

---

## 4. 모듈 의존

- `CommonModule`은 `PrismaModule`만 import한다. 예전에 쓰지 않던 `AuthModule`·`UsersModule` import를 제거했다. 업무 모듈이 `CommonModule`을 import해 `AuditService`를 쓰는데, 반대 방향 import가 남아 있으면 순환 참조가 된다.
- `ScheduleModule.forRoot()`와 `RequestContextMiddleware`는 `AppModule`에서 등록한다.

---

## 5. 확인한 항목 (2026-11-09, 임시 컨트롤러로 실제 HTTP 요청)

- 단건: 바뀐 필드만 기록, 같은 값·같은 Date·`password` 제외 / 작업자 id·IP·User-Agent가 컨텍스트에서 채워짐
- 일괄: 2개 → 1행(`batch`, 중복 id 제거, pk별 before) / 1개 → 단건 형태
- 트랜잭션 롤백 시 감사 로그도 남지 않음
- `actorId: null` → 작업자 NULL
- 알림: 본인 제외·중복 제거, 목록·`take`·`unreadOnly`, 다른 사람 알림 읽음 404, 읽음·모두 읽음·안 읽은 수, 잘못된 쿼리 400, 삭제 후 재삭제 404, 토큰 없음 401
- 90일 배치: 91일 전 알림 1건 삭제

---

## 6. 핵심 모듈 적용 현황 (2026-11-09)

감사 로그는 모든 변경(생성·수정·삭제)에, 알림은 사용자가 정한 곳에만 넣었다.

| 모듈 | 감사 로그 | 기록 방식 |
|---|---|---|
| 회원 (`users.service`) | 가입 `CREATE`, 관리자 수정·내 정보 수정 `UPDATE`(바뀐 필드), 권한 `ROLE_CHANGE`·상태 `STATUS_CHANGE`·삭제 `DELETE`(일괄 → 1행), 복구 `RESTORE`, 탈퇴 `DELETE` | 같은 트랜잭션 |
| 인증 (`auth.service`, `auth-sessions.service`) | `LOGIN`, `LOGIN_FAILED`(사유 `NOT_FOUND`·`WRONG_PASSWORD`·`NOT_ACTIVE`, 작업자 NULL), `LOGOUT`(이 기기·모든 기기·다른 기기), `PASSWORD_CHANGE`, `PASSWORD_RESET`, `TOKEN_REUSE`, `LOGIN_LOCKED`(잠금 단계), `LOGIN_UNLOCKED`(관리자 해제) - 잠긴 동안의 시도는 기록하지 않음 | 마지막 쓰기 성공 후 (세션·회원 서비스에 걸쳐 하나의 트랜잭션이 없음) |
| 조직 (`departments`·`positions`·`job-titles`·`organization.service`) | 생성·수정·삭제, 순서 변경(일괄 1행, `orderBefore`·`orderAfter`), 직급 지정, 소속 추가·수정·삭제·대표 변경 | 같은 트랜잭션 |
| 게시판 (`boards`·`board-auth`·`posts`·`comments.service`) | 게시판·권한 규칙·게시글·댓글 생성·수정·삭제, 게시판 순서, 게시글 고정 | 같은 트랜잭션 |
| 파일 (`files.service`) | 업로드 `CREATE` (연결·해제는 게시글 로그의 `imageIds`·`attachmentIds`) | 같은 트랜잭션 |

기록하지 않는 것 (의도):

- 조회, 게시글 조회수·조회 기록, 좋아요·좋아요 취소 (사용자 반응, 양이 많고 증적 가치가 낮음)
- 토큰 재발급(rotation) - 10분마다 일어나는 정상 동작. 재사용 감지만 `TOKEN_REUSE`로 기록
- 내 알림 읽음·삭제 - 본인 알림 관리
- 게시글 본문 HTML - 크기가 커서 `contentChanged`(바뀌었는지)만. 댓글은 짧아서 내용 전후를 남긴다

알림:

| 이벤트 | 받는 사람 | `actionType` | `link` |
|---|---|---|---|
| 신규 회원가입 | 재직 중인 관리자 전원 | `SIGNUP_REQUESTED` (대상 `USER` = 가입 회원, 발신자 = 가입 회원) | `/admin/users/:id` |
| 가입 승인 (GUEST → USER/ADMIN, 단건·일괄) | 승인된 회원 각자 | `SIGNUP_APPROVED` | `/` |
| 내 글에 댓글 (대댓글 포함) | 글 작성자 | `POST_COMMENTED` (대상 `COMMENT` = 새 댓글) | `/boards/:boardId/posts/:postId` |
| 내 댓글에 답글 | 부모 댓글 작성자 | `COMMENT_REPLIED` | 같음 |
| 공지 게시판(`NOTICE`) 새 글 (비밀글 제외, 수정 시 재알림 없음) | 그 게시판을 읽을 수 있는 재직 중 회원(USER·ADMIN, 시스템 관리자는 항상) - 작성자 제외 | `NOTICE_CREATED` (대상 `POST`) | `/boards/:boardId/posts/:postId` |
| 관리 권한으로 남의 글 삭제 | 글 작성자 | `POST_DELETED_BY_ADMIN` (발신자 NULL) | `/boards/:boardId` (글이 없으므로 목록) |
| 관리 권한으로 남의 댓글 삭제 | 댓글 작성자 | `COMMENT_DELETED_BY_ADMIN` (발신자 NULL) | `/boards/:boardId/posts/:postId` |
| refresh token 재사용 감지 → 세션 폐기 | 세션 주인 | `SESSION_REVOKED` (발신자 NULL) | `/mypage` |

- 댓글 알림: 글 작성자와 부모 댓글 작성자가 같으면 답글 알림 1건만. 본인 글·본인 댓글에 직접 단 경우는 보내지 않는다. 익명 게시판은 발신자를 NULL로(알림 목록이 발신자 이름을 보여 주므로) - 이때 send()의 발신자 제외가 동작하지 않아 작성자 제외를 `CommentsService`에서 먼저 한다. 내용은 `[글 제목] 댓글 앞 50자`
- 공지 대상 계산: `BoardAuthService.findReadableUserIds` - 규칙·재직 회원·부서 트리를 한 번씩 조회하고 회원별 판정은 메모리에서 `evaluate`(회원 수만큼 쿼리하지 않음). 글 저장 커밋 후 실행(7.1)
- 관리자 삭제 알림은 삭제한 관리자 개인을 드러내지 않는다(발신자 NULL). 누가 지웠는지는 감사 로그에 남는다
- 승인 알림은 변경 전 권한이 GUEST였던 회원에게만 간다. (이미 USER인 회원의 권한 변경은 알림 없음)
- 승인된 회원의 access token은 다음 재발급(최대 10분)까지 GUEST 권한이라, 그동안은 알림 API(`@Roles(USER)`)를 호출할 수 없다. 재발급 후 또는 다시 로그인하면 보인다.

확인 (빌드한 서버 + 실제 API, 19개 항목 통과, 테스트 데이터 삭제): 가입 → 관리자 알림 → 입사일 등록 → 일괄 승인(1행 batch, pk별 before) → 승인 알림 → 이미 USER인 회원 변경 시 알림 없음·단건 형태 → 실패 요청(GUEST 변경 400)은 로그 없음 → 일괄 상태 변경 → 비활성 로그인 `NOT_ACTIVE` → 부서·게시판·게시글(고정 포함)·댓글 CRUD → 로그아웃(작업자 명시) → 모든 행에 IP·User-Agent

보충 확인 (2026-11-09, 빌드한 서버 + 실제 API, 19개 항목 통과, 테스트 데이터·업로드 파일 삭제): 직급·직책 생성·수정·순서·삭제(남은 sortOrder 연속), 부서 순서(하위 부서만)·삭제 재정렬, 직급 지정, 소속 추가·수정·대표 변경·대표 소속 삭제 시 승격(배열 → 함수 트랜잭션 전환 후 순서 유지), 게시판 순서, 게시판 권한 규칙 CRUD(정규화된 규칙·직책 목록 전후), 첨부 업로드 `FILE`, 내 정보 수정(바뀐 필드만), 다른 기기·모든 기기 로그아웃, 비밀번호 변경(비밀번호 미기록), 회원 탈퇴, 일괄 삭제(batch)·복구, 토큰 재사용 `TOKEN_REUSE`. 모든 행에 작업자·IP·User-Agent

---

## 7. 호출 구조 정리 (2026-11-09, 동작 변경 없음)

명시적 호출은 유지하고(같은 트랜잭션·업무 의미 때문에 AOP·인터셉터로 바꾸지 않음), 반복과 섞인 규칙만 정리했다.

**감사 로그 - 대상 고정 헬퍼 `TargetAudit`** (`common/audit.service.ts`)

```ts
// 생성자에서 대상 종류를 한 번 정한다
this.audit = auditService.target( AuditTargetType.BOARD );

await this.audit.created( tx, board.id, `게시판 생성: ${board.name}`, { type, parentBoardId } );
await this.audit.updated( tx, board.id, `게시판 수정: ${name}`, diffChanges( before, data ), { 추가 정보 } );
await this.audit.deleted( tx, board.id, `게시판 삭제: ${name}` );
await this.audit.log({ targetId, actionType: AuditActionType.ROLE_CHANGE, ... }, tx);   // 그 밖의 동작
await this.audit.logBatch({ targetIds, actionType, changes }, tx);                      // 일괄
```

- `updated`는 `detail = { ...추가 정보, changes }` 형태로 저장한다(모든 UPDATE 행이 `changes`를 가진다).
- 대상이 둘인 서비스는 헬퍼를 둘 둔다(예: `OrganizationService`의 `userAudit`·`membershipAudit`).
- 생성자 본문에서 만드는 이유: 클래스 필드 초기화는 생성자 매개변수 속성(`private readonly auditService`)보다 먼저 실행될 수 있어 필드 선언에서 바로 `this.auditService`를 쓸 수 없다.

**알림 - 모듈별 규칙 클래스 `*-notifier.ts`**

| 파일 | 메서드 |
|---|---|
| `boards/board-notifier.ts` | `newComment`, `noticeCreated`, `postDeletedByAdmin`, `commentDeletedByAdmin` |
| `users/user-notifier.ts` | `signupRequested`, `signupApproved` |
| `auth/auth-notifier.ts` | `sessionRevoked` |

- 서비스는 `await this.boardNotifier.newComment( tx, {...} )` 한 줄만 호출한다. 받는 사람·본인 제외·익명 발신자·문구·link는 notifier에 있다.
- "본인 삭제면 보내지 않음", "비밀글 공지는 보내지 않음" 같은 조건도 notifier 안에서 거른다.
- 공통 `NotificationsService`(저장·조회·정리)는 업무 모듈을 모르고, notifier는 각 업무 모듈 안에 있다. (핵심 → 애드온 의존 금지 규칙과 같은 방향)

확인: 정리 전후로 오늘 만든 확인 스크립트 5개(71개 항목)를 다시 실행해 모두 통과. 다만 "대표 소속 변경" 감사 로그는 `updated`로 바뀌면서 `detail.changes.isPrimary`(false → true)가 추가됐다(기존 `userId`·`previousPrimaryId`는 그대로).


### 7.1 알림을 커밋 후로 이동 (2026-11-09, 사용자 결정)

- 배경: 감사 로그 때문에 대부분의 쓰기가 트랜잭션이 됐고, 알림까지 그 안에 있었다. 알림은 빠져도 불편에 그치는데 실패하면 업무까지 실패했고, 공지는 읽기 권한 계산 + 직원 수만큼 `createMany`라 트랜잭션이 가장 길어지는 곳이었다.
- 변경: 서비스가 `(...)` 결과를 받은 **뒤** notifier를 호출한다. notifier는 `tx`를 받지 않고, 본문 전체를 `bestEffort`(`common/util/best-effort.util.ts`)로 감싸 실패하면 `Logger.error`만 남긴다.
- 결과: 롤백된 작업에는 알림이 가지 않는다(커밋 후에만 보내므로). 대신 커밋 직후 서버가 죽으면 알림이 빠질 수 있다(감수).
- 확인: 알림 저장을 일부러 실패시켜도 댓글 작성·공지 작성·관리자 댓글 삭제가 성공하고 댓글·감사 로그가 저장됨, 서버 로그에 `[BoardNotifier] ... 실패 (업무는 완료됨)`, 업무 실패(없는 부모 댓글) 시 알림 0건. 기존 알림 확인 스크립트(댓글 8·추천 8·감사 로그/가입 19)도 다시 통과.
