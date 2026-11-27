# 백엔드 테스트 구조 (Jest)

> 작성일: 2026-11-09 · 방침: B안(최소) — 순수 함수 단위 테스트 + 회의실 동시 예약 e2e. 서비스를 mock으로 감싸는 단위 테스트는 쓰지 않는다.
> 결정: 기본 spec 11개 삭제, 테스트 DB는 별도 `intranet_test`, 데이터는 e2e 파일 시작 시 TRUNCATE (사용자 결정, Claude 구현)

## 1. 실행

| 명령 | 대상 | DB |
|---|---|---|
| `npm test` | `src/**/*.spec.ts` (순수 함수 단위 테스트) | 사용 안 함 |
| `npm run test:e2e` | `test/**/*.e2e-spec.ts` | `intranet_test` (`backend/.env.test`) |

처음 한 번: `backend/.env.test.example`을 `.env.test`로 복사하고 비밀번호를 채운다. DB·계정은 infra-db init 스크립트가 만든다(docs/design/infra-db.md).

## 2. Jest 설정에서 고친 것 (기존: 11개 중 10개 실패)

| 문제 | 원인 | 해결 |
|---|---|---|
| `Cannot find module 'src/...'` | 코드가 `src/...` 절대 경로로 import하는데 Jest는 tsconfig `baseUrl`을 모름 | `moduleNameMapper`: `^src/(.*)$` → `<rootDir>/$1` (e2e는 `<rootDir>/src/$1`) |
| Prisma 생성 코드의 `./enums.js` | 생성 코드는 ESM 규칙대로 `.js`를 붙여 import하지만 실제 파일은 `.ts` | `moduleNameMapper`: `^(\.{1,2}/.*)\.js$` → `$1` |
| `Must use import to load ES Module` | `@nestjs/jwt` 12, `sanitize-html`이 쓰는 `htmlparser2`가 ESM 전용 패키지. Jest는 기본적으로 CommonJS로만 불러옴 | `node --experimental-vm-modules`로 Jest 실행 → Jest 30이 Node(24.9+)의 require(esm)을 사용 |
| 기본 spec 11개 | Nest CLI가 만든 `should be defined`뿐, 의존성 mock이 없어 실패 | 삭제 |

ESM 처리 선택지:
- `transformIgnorePatterns`로 node_modules의 ESM 패키지를 변환: ESM 패키지가 생길 때마다(`htmlparser2`·`entities`·`domhandler`·`@nestjs/jwt`…) 목록을 고쳐야 함
- 해당 패키지 mock: sanitize-html은 테스트 대상 자체라 mock하면 의미가 없음
- **`--experimental-vm-modules` (선택)**: 설정 한 줄, 패키지가 늘어도 그대로. 실험 기능 경고는 `--disable-warning=ExperimentalWarning`으로 숨김. Node 24.9 미만에서는 동작하지 않음
- Windows `npm` 스크립트는 cmd에서 돌아 `NODE_OPTIONS=... jest`가 안 되므로 `node --experimental-vm-modules node_modules/jest/bin/jest.js`로 직접 실행

## 3. 단위 테스트 (`src/**/util/*.spec.ts`, 5개 파일 61개)

| 파일 | 확인하는 것 |
|---|---|
| `boards/util/board-permission.util.spec.ts` (17개) | `evaluateBoardPermission`: 규칙 없음 = 기본 거부, 조건 없는 규칙 = 전 직원, 규칙 간 OR, 해당하지 않는 규칙 무시, 최소 직급 경계(높음·같음·낮음·없음), 부서 직접 소속 / 하위 부서 포함, 소속 없는 회원, 직책 목록, **겸직은 같은 소속 안에서 부서+직책을 함께 만족**, 규칙 안 조건 AND |
| `pagination.util.spec.ts` | `PaginatePage`의 skip 계산, total 0, take로 나누어떨어지는 total(마지막 페이지 hasNext false), `CursorArgs`(첫 요청 / 커서 행 건너뛰기), `CursorResult`(take+1개 → 초과분 제외·다음 커서, take개 이하, 빈 결과, BigInt 커서 문자열) |
| `tree.util.spec.ts` | `toTreeList` 3단계 전위 순회·path, 입력 순서 무관, sortOrder → id 순, 고아 노드 최상위, 이름 없는 트리(댓글) compare 정렬, 빈 목록 |
| `audit-detail.util.spec.ts` | `diffChanges`(바뀐 필드만, undefined 제외, Date 시각 비교, null = 없음, 배열 내용 비교, 민감 필드 제외), `batchChanges`(pk별 변경 전 값), `toAuditJson`(Date·BigInt 변환, 깊은 위치의 민감 필드 제거) |
| `sanitize-html.util.spec.ts` | script·이벤트 속성 제거, `javascript:` 링크, 링크 새 탭 고정, 검색 텍스트, 빈 본문 null, 영상 iframe 허용 형식·속성 고정, 거부 주소 8종(다른 호스트·youtube.com·http·다른 경로·id 길이·뒤에 붙은 값·Vimeo 문자 id·`javascript:`), 우리 서버 이미지만, `allowImage`, 경로 문자(`../`)·svg 거부, 이미지 추출 순서·중복 |

게시판 권한 판정은 원래 `BoardAuthService`의 `private evaluate`·`matchesRule`였다. 테스트하려고 `boards/util/board-permission.util.ts`의 `evaluateBoardPermission`으로 옮겼다(사용자 승인, 로직 변경 없음, 호출 3곳만 `this.evaluate` → `evaluateBoardPermission`). 서비스는 조회(규칙·회원·부서 트리), util은 판정만 맡는다.

## 4. e2e 구조 (`test/`)

```text
npm run test:e2e
 ├ globalSetup  test/global-setup.ts   .env.test 로드 → prisma migrate deploy (적용 안 된 마이그레이션만)
 ├ setupFiles   test/load-test-env.ts  테스트 파일마다 .env.test 로드 (override) + DB 이름 _test 확인
 └ 각 *.e2e-spec.ts
     beforeAll: AppModule로 앱 생성 → resetDatabase(prisma) → 그 파일에 필요한 행만 넣기
```

- **`.env.test`가 이기는 이유**: `load-test-env.ts`가 `override: true`로 먼저 `process.env`를 채우고, `ConfigModule`은 이미 있는 값을 `.env`로 덮어쓰지 않는다. (`app.e2e-spec.ts`에서 확인)
- **`resetDatabase`** (`test/utils/reset-database.ts`): public 스키마 테이블을 DB에서 읽어 `TRUNCATE ... RESTART IDENTITY CASCADE` 한 번(`_prisma_migrations` 제외). 모델이 늘어도 고칠 필요 없음.
- **트랜잭션 롤백 방식을 쓰지 않는 이유**: 동시 예약 테스트는 요청 여러 개가 각자 트랜잭션을 커밋해야 경쟁 상태가 재현된다. 테스트 전체를 하나의 트랜잭션으로 감싸면 재현되지 않는다.
- **`maxWorkers: 1`**: e2e 파일들이 같은 DB를 TRUNCATE하므로 동시에 돌지 않게 한다.
- **개발 DB 보호 3중**: ① `.env.test`의 DB 이름이 `_test`로 안 끝나면 globalSetup에서 중단(마이그레이션 전) ② `resetDatabase`가 `current_database()`를 다시 확인 ③ `intranet_test_user`는 `intranet` DB 접속 권한이 없음(`REVOKE ALL ... FROM PUBLIC`)
- 테스트 업로드 루트는 `../uploads-test`(git 제외) - 개발 업로드와 섞이지 않게.
- `app.e2e-spec.ts`: 환경 확인용 3개(테스트 DB 연결, reset 후 비어 있음·id 1부터, `GET /`). 업무 e2e는 기능별 파일로 추가한다.

## 5. 확인 (2026-11-09)

- `npm test` 5개 파일 61개, `npm run test:e2e` 3개 통과(첫 실행에서 마이그레이션 26개 적용, 두 번째 실행은 적용할 것 없음), `tsc --noEmit`·ESLint(테스트 파일) 오류 0
- `.env.test`의 DB를 `intranet`으로 바꾸면 globalSetup에서 "_test로 끝나는 DB에서만" 오류로 멈춤 → 원래대로 되돌림
- `has_database_privilege('intranet_test_user','intranet','CONNECT')` = false
- 미확인: 회의실 동시 예약 e2e(회의실 구현 때), CI 실행(없음)

## 6. 추가 (2026-11-09 애드온 ON/OFF)

- 단위: `src/config/addons.config.spec.ts`(10개) — 빈 값·공백·순서·중복, 본체와 함께 켠 옵션 허용, 오타·대문자·없는 이름 오류, 본체 없는 옵션 오류
- e2e: `test/addons.e2e-spec.ts`(8개) — `GET /common/addons` USER 200·순서 / 로그인 없음 401 / GUEST 403, 테스트 안에서 만든 가짜 애드온 모듈로 `addonModule()` 켜짐 200·꺼짐 404·변수 없음 404, 잘못된 `ADDONS`면 앱 생성 실패
  - `ADDONS`는 테스트마다 `process.env`에 넣고 앱을 새로 만든다(`.env.test`는 빈 값). `ConfigService`가 `process.env`를 읽으므로 반영된다
- 테스트 도구 `test/utils/auth.ts`: `createTestUser(prisma, role)`(재직, 비밀번호 `TEST_PASSWORD`), `loginAs(app, empNo)`(실제 로그인 API로 access token) — 회의실 e2e에서도 사용
- 확인: 빌드한 서버를 `ADDONS=reservation`으로 실행하면 시작 단계 오류("알 수 없는 애드온 … 사용 가능: …"), 빈 값이면 정상 기동 후 `GET /common/addons` 401(토큰 없음)

## 7. 추가 (2026-11-09 시설 예약)

- 단위: `src/reservations/util/reservation-rules.util.spec.ts`(26개), e2e: `test/reservations.e2e-spec.ts`(36개) — 내용은 [reservations.md](reservations.md) 7장
- **e2e 앱 생성은 `test/utils/app.ts`의 `createTestApp()`으로 통일**: `createNestApplication()`은 `main.ts`를 거치지 않아 전역 ValidationPipe가 빠지고 DTO 변환이 안 된다 → `src/app.setup.ts`의 `configureApp()`을 `main.ts`와 같이 쓴다
- `.env.test`에 `ADDONS=reservations,approvals,leaves`(2026-11-12) (애드온 등록은 `app.module.ts` import 시점에 한 번 정해지므로 테스트 중에 바꿀 수 없다. 꺼진 경우는 `jest.isolateModulesAsync`로 확인)
- 전체: 단위 97개, e2e 49개 통과

## 8. 추가 (2026-11-21 배포 전 빈 곳 보강)

e2e가 없던 핵심 권한 흐름 3곳. 규칙은 features.md에 이미 정한 것을 그대로 검사한다(새 규칙 없음).

- `test/login-lock.e2e-spec.ts`(9개, features.md 5.2) — 4회 401·5회째 1단계 10분 잠금 429·감사 로그, 잠긴 동안 맞는 비밀번호도 429(기록 안 함), 없는 사번도 같은 메시지, 2단계 30분·3단계 최대 1시간, 잠금이 끝난 뒤 로그인 성공 시 기록 삭제, 관리자 해제(`unlocked: true` → 다시 하면 `false`), IP 요청 수 제한(한도 `AUTH_THROTTLE_LIMIT`회 뒤 다음 요청은 비밀번호 확인 전 429, 감사 로그 한도만큼)
  - 요청 수 제한 카운터는 앱(서버 메모리)마다 따로라, 로그인 요청이 한도를 넘지 않게 **묶음(describe)마다 앱을 새로 띄운다**
  - 잠금 시간은 기다릴 수 없어 `LoginHistory` 행을 직접 고쳐 상태를 만든다
- `test/board-permission.e2e-spec.ts`(9개, features.md 5.3) — 규칙 없는 게시판은 관리자만, 메뉴에는 읽을 수 있는 게시판만, 읽기 권한이 없으면 404(존재를 숨김)·동작 권한만 없으면 403, 수정은 작성자만(게시판 관리 권한도 불가)·삭제는 작성자 또는 게시판 관리 권한, 읽을 수 있는 게시판 주소에 남의 게시판 글 id를 붙이면 404(`checkPost`), 비밀글은 작성자·게시판 관리 권한·관리자만(댓글도 같이 막힘)
  - URL 조작은 **비밀글이 아닌 글**로 확인한다. 비밀글이면 게시판 일치 확인이 빠져도 비밀글 검사(403)에서 막혀 누락을 잡지 못한다
  - 규칙 판정 조합(하위 부서·직급·직책)은 단위 테스트 `board-permission.util.spec.ts`가 본다
- `test/chat-permission.e2e-spec.ts`(9개, features.md 8.3·8.4) — 참여하지 않은 방 404, GUEST 403, 나중에 초대된 사람은 초대 전 대화를 못 봄, 나간 사람은 조회·보내기 404·남은 사람은 계속 보냄, 1:1 상대 퇴사 시 읽기 전용(보내기 403, 기록은 보임), 수정·삭제는 본인만 403·5분 지나면 400, 삭제한 메시지는 `content: null`·다시 수정 400
  - 채팅은 `.env.test`의 `ADDONS`에 없어 `createTestApp([ ChatsModule ])`로 붙인다(`profile-image.e2e-spec.ts`와 같음). 5분 경과는 `createdAt`을 과거로 옮겨 만든다
- 세 파일의 `beforeAll`은 시간 제한 30초: 전체 e2e를 함께 돌리면 준비(앱 기동·로그인 여러 번)가 기본 5초를 넘긴 적이 있다
- 기존 `reservations.e2e-spec.ts`의 "운영하지 않는 요일은 건너뛴다" 수정: 시작일이 "다음 월요일 − 2일"이라 **토요일 11시 이후·일요일에 실행하면 그 날짜가 지난 시각이 되어 `PAST`** 가 나왔다(실행 요일에 따라 결과가 달라지는 테스트). 다다음 주 월요일로 바꿨다(분류 최대 예약 기간 30일 안)
- 전체: 단위 221개, e2e 242개 통과
