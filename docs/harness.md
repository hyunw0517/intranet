# 하네스 (에이전트 작업 환경)

> 작성일: 2026-11-11 · 범용 템플릿 harness-starter v0.3에서 가져옴 ([harness/CHANGELOG.md](../harness/CHANGELOG.md))
> 구조 그림·설계 판단·사례·자주 묻는 질문은 [harness-overview.md](harness-overview.md).
> AGENTS.md의 규칙을 **문서에만 두지 않고 검사·hook으로 강제**하기 위한 장치. 규칙 목록은 [harness/rules.json](../harness/rules.json), 설정은 [harness/harness.config.json](../harness/harness.config.json).

## 1. 왜 만들었나

인트라넷은 설계(규칙·예외·스키마·API 계약)는 직접 하고 구현은 Claude Code가 맡는다(2026-11-05 결정). AGENTS.md·skill·eval로 **지시**는 충실했지만, 가장 중요한 규칙들이 문장으로만 있었다.

- "새 API는 반드시 `@Roles`" — `RolesGuard`는 `@Roles`가 없으면 통과시키므로, 에이전트가 한 번 잊으면 권한 없는 API가 조용히 열린다.
- "핵심은 애드온을 import하지 않는다" — 어기면 애드온을 끌 때 앱이 깨진다.
- 작업 후 tsc·lint — 에이전트가 기억해야만 돈다.

에이전트가 작성한 코드를 어떻게 통제했는지 설명할 수 있어야 하므로, 규칙마다 "무엇이 강제하나"를 대장에 적고 가능한 것은 기계가 확인하게 했다.

## 2. 적용 범위 (2026-11-11)

| 단계 | 내용 | 상태 |
|---|---|---|
| 검사 | `node harness/verify.mjs --quick` — 문서·규칙 대장·모듈 경계·라우트 권한 | 적용 |
| 가드 hook | lock 수정, `migrate reset`·`db push`·`--no-verify`·강제 푸시를 **Claude에게만** 막음. `.env` 수정과 기존 마이그레이션 SQL 수정은 막지 않고 **사용자 확인 창**(ask) | 적용 — `.env`·마이그레이션은 ask (사용자 결정, 아래) |
| 세션 시작 hook | Plan.md "처리할 작업"(앞 2000자), 마지막 devlog 제목, 최근 커밋, 하네스 상태를 맥락에 넣음 | 적용 |
| Stop hook | 응답을 끝내기 전, 바뀐 패키지만: backend `typecheck` / frontend `typecheck`·`lint:check` | 적용 — backend lint 제외 (사용자 결정) |
| pre-commit | 커밋 전 검증 | **설치 안 함** — git은 사용자가 직접 한다 (사용자 결정) |

hook·skill 설치는 사용자가 한 번 직접 실행한다(원격 도구는 `.claude` 폴더에 쓸 수 없다): `node harness/install-claude.mjs`

## 3. 바뀌지 않는 것

- AGENTS.md가 원본, features.md·Plan.md·`docs/frontend/` 문서, `/devlog`·`/interview-qa` skill과 Notion 흐름
- 작업 요청 방식과 작업 순서, Claude가 업무 결정을 질문하는 방식 [R-PROC-01]
- 사용자가 직접 하는 Prisma 명령, git 작업 (hook은 Claude의 도구 호출에만 걸린다). `.env`는 사용자가 직접 고치거나, Claude가 확인 창을 띄워 수락받은 뒤 고친다
- 앱 코드. 추가된 것은 `harness/` 폴더, 이 문서, package.json 검증 스크립트 2개(`typecheck`, `lint:check`), 문서의 규칙 태그뿐이다

## 4. 규칙과 강제 수단

| 규칙 | 내용 | 강제 |
|---|---|---|
| R-AUTH-01 | 새 API에 `@Roles`/`@IsPublic`. 본인 계정용 9개는 `routeGuards.allowlist`에 이유와 함께 | route-guards 검사 (+ 런타임 e2e 예정) |
| R-ARCH-01 | 핵심 → 애드온, common → 업무 모듈, 애드온 → 애드온 import 금지 (auth 데코레이터·토큰 타입은 기반 기능이라 허용, 선언한 의존은 `allow`) | import-boundaries 검사 |
| R-ARCH-02 | `backend/src` 바로 아래 모든 모듈은 경계 설정에 분류 (규칙 from/to 또는 `unrestricted` + 이유). 2026-11-17 추가 - `projects`가 빠져 있던 사례 | import-boundaries 검사 (`requireClassified`) |
| R-DOC-01~03 | AGENTS.md 30KB, 문서 링크·경로 실재, 규칙 대장 | 검사 |
| R-DOC-04 | API 라우트에 `@ApiOperation`, 컨트롤러에 `@ApiTags` (문서 제외는 `@ApiExcludeEndpoint`·`@ApiExcludeController`). 2026-11-22 추가 - Swagger 도입 | api-docs 검사 (컨트롤러 파서는 route-guards와 공용) |
| R-DOC-05 | 코드 주석에 결정 날짜·"사용자 결정/요청"·설계 문서 장 번호·⭐ 금지 (예시 날짜·문자열은 대상 아님, 패턴은 `commentStyle.patterns`). 2026-11-28 추가 - 주석이 결정 기록처럼 쓰여 코드 읽기를 방해한 사례 | comment-style 검사 |
| R-DOC-06 | 주석은 코드만 봐서는 모르는 이유를 짧게, 코드가 이미 말하는 내용은 반복하지 않는다 | 판단 (코드 리뷰) |
| R-SEC-01, R-DB-01~02, R-GIT-01 | 위험한 파일·명령 | 가드 hook |
| R-VER-01 | 끝내기 전 검증 | Stop hook |
| R-PROC-01~02, R-FE-01 | 업무 결정은 묻기, 지어내지 않기, 프론트 작업 중 백엔드 수정 금지 | 판단 (자동화하지 않은 이유는 rules.json) |

기존 `migration.sql` 수정을 deny가 아니라 ask로 둔 이유: 이 프로젝트는 `migrate dev --create-only`로 파일을 만든 직후 Prisma 스키마로 표현할 수 없는 SQL(CHECK·EXCLUDE 제약, collation, 데이터 보정)을 직접 쓴다. 파일이 이미 있다는 것만으로는 적용 전인지 알 수 없어서, 적용 전이면 수락·적용 후면 거절을 사용자가 판단한다(2026-11-11). 규칙마다 `decision`(`deny` 기본 / `ask`)을 쓸 수 있다.

`.env` 수정을 ask로 바꾼 이유(2026-11-12 사용자 결정): `ADDONS` 같은 설정 값을 바꿀 때마다 사용자가 직접 고치기 번거로웠다. 확인 창에서 바꿀 내용을 보고 수락한 경우만 수정된다. 이 가드는 Edit·Write 도구에만 걸리므로 Claude는 `.env`를 셸 명령(sed, echo 리다이렉트 등)으로 쓰지 않는다. lock 파일은 `npm install`로만 바뀌어야 해서 계속 막는다.

문서 경로 검사(doc-paths)는 이력 문서(devlog/, design/changelog.md)를 보지 않는다. 그 시점의 사실을 적은 문서라 지금 코드와 맞출 대상이 아니기 때문이다. 아직 만들지 않은 파일은 그 줄·표 머리글·절 제목에 "예정"을 쓰면 경고만 난다.

## 5. 적용할 때 확인한 것 (2026-11-11)

- 기준선: backend·frontend tsc 오류 0, frontend eslint 0, **backend eslint 오류 43**(auth 가드·데코레이터 10개 파일, `no-unsafe-*`)
- route-guards: 컨트롤러 24개·라우트 134개 → allowlist 9개 등록 후 0건
- import-boundaries: backend 소스 214개·모듈 간 import 281개 → 0건
- doc-paths: 0건 (휴가 코드 위치 2개는 "위치(예정)"이라 경고)
- 프론트 "기능 폴더끼리 import 금지"는 11건이 걸려 **후보로만** 남겼다(`$candidateBoundaries`). AGENTS.md 12장은 "서로의 API를 import하지 않는다"까지만 정했고, 관리자 화면이 다른 기능의 훅을 재사용하는 것은 위반이 아니다.

## 6. 나중에 할 일

1. **backend lint 기준선 정리** → `stopHook.scripts.backend`에 `"lint:check"` 추가. auth 가드의 `req.user` 타입 등 강의 코드에서 온 부분이라 직접 정리하면 설명할 거리가 된다.
2. **런타임 권한 검사**: `harness/templates/roles-coverage.e2e-spec.ts`를 backend/test/로 복사(예정). import 경로는 `src/auth/decorator/roles.decorator`(`ROLES_KEY`), `src/common/decorator/is-public.decorator`(`IS_PUBLIC_KEY`).
3. 프론트 기능 폴더 규칙을 확정할지 결정 (후보 → `boundaries`로 옮기면 강제된다).
4. (선택) pre-commit: `node harness/install-git-hooks.mjs`.

## 7. 명령

| 명령 | 용도 |
|---|---|
| `node harness/verify.mjs --quick` | 하네스 검사만 (1초 안쪽) |
| `node harness/verify.mjs --stop` | Stop hook과 같은 검증 (바뀐 패키지만) |
| `node harness/verify.mjs` | 전부 (각 패키지 typecheck·lint:check·test) |
| `node --test "harness/tests/*.test.mjs"` | 하네스 자체 테스트 |
| `node harness/install-claude.mjs` | hook·`/harness` skill 설치 (처음 한 번, 고친 뒤 `--force`) |

hook·skill 원본은 `harness/claude/`다. 고칠 때는 원본을 고치고 다시 설치한다. 여기서 배운 것은 devlog에 **(하네스 개선)**으로 표시해 두고 템플릿에 되돌린다(`/harness` skill의 "템플릿 반영").
