# API 문서화 (Swagger) 작업 명세

> 상태: **진행 중** (2026-11-01 작성, 2026-11-21 결정 반영·착수). 도입은 2026-11-21 사용자 확인(AGENTS.md 18장 기준). 진행 상황은 4장.
> API 문서 작업을 요청받으면 이 문서를 먼저 읽고 그 규칙을 따른다.

## 0. 결정 사항 (2026-11-21)

| 항목 | 결정 | 상세 |
|---|---|---|
| 깊이 | **모든 라우트**: 요청 스키마 + 태그·summary + 권한 + 에러. **응답 스키마는 `auth`·`users`·`boards`만** | 3.3, 3.4 |
| 대상 | 핵심 + 애드온 전체 | 4장 |
| 운영 노출 | 운영에도 열고 **Nginx Basic 인증**으로 막는다(사이트 회원 계정과 별개인 `.htpasswd`) | 3.2 |
| 애드온 | 켜진 애드온의 API만 문서에 나온다(등록된 모듈만 스캔) | 3.2 |
| Bearer | 문서 전역에 걸고 `@IsPublic()` 라우트만 해제 | 3.1 |
| 권한 표시 | `@IsPublic`·`@Roles`·`@RequireAdmin` 값을 문서 생성 직후 읽어 자동 표시(데코레이터는 그대로) | 3.3 |
| 응답 클래스 | `dto/*-response.dto.ts` + 컨트롤러 반환 타입 `Promise<응답 클래스>`로 typecheck가 서비스와 맞는지 검사 | 3.4 |
| 에러 | 401/403은 자동, 라우트 고유 400 조건·404·409·429만 그 라우트에 | 3.3 |
| 필드 설명 | DTO 필드 위 `//` 주석을 `/** */`로 바꿔 `introspectComments`로 읽는다 | 3.1 |
| 페이지 응답 | 모듈별 응답 클래스(공통 제네릭 안 씀) | 3.4 |
| 소켓 | Swagger 밖. 5장 가이드에 연결 방법·이벤트 표 | 5장 |
| 하네스 | `@ApiOperation` 누락 검사 추가, rules.json에 새 태그로 등록 | 4장 |
| 언어 | 태그는 `Users (회원)`(영어+한글), summary·description·필드 설명은 한국어 | 3.3 |

## 1. 목표

- 프론트엔드 개발자가 따로 있다고 가정하고, **백엔드 API 호출 방식과 응답 결과**를 한 곳에서 확인할 수 있는 문서를 만든다.
- 엔드포인트별 요청·응답은 **Swagger(`@nestjs/swagger`)로 코드에서 자동 생성**한다. 손으로 쓴 문서는 코드와 어긋나기 때문이다.
- 엔드포인트 목록만으로 전달되지 않는 공통 규약(인증 흐름, 에러 형식, 페이지네이션 등)은 Swagger 설명 또는 이 문서 하단 가이드로 따로 정리한다.

## 2. 참고 프로젝트

`D:\VScode_Workspace\nextjs-starter\onebite-books-server-main` (한입 도서몰 API 서버, NestJS + Prisma + Swagger)

참고할 위치:

| 파일 | 참고할 내용 |
|---|---|
| `src/main.ts` | `DocumentBuilder`로 제목·설명·버전 설정 → `SwaggerModule.createDocument` → `SwaggerModule.setup('api', ...)`로 UI 경로 연결, `swagger-themes`로 다크 테마 |
| `src/book/book.controller.ts` | `@ApiTags`(모듈 묶음, 한글 설명 포함), `@ApiOperation`(summary + description), `@ApiQuery` / `@ApiParam`, `@ApiOkResponse` / `@ApiCreatedResponse` / `@ApiNotFoundResponse`, `@ApiExcludeEndpoint`(문서에서 숨길 라우트) |
| `src/book/entitiy/book.entity.ts` | 응답 타입 클래스에 `@ApiProperty({ description, example })`를 붙여 응답 스키마 정의 |

**그대로 따라 하지 않을 점:**

- **`@ApiBody({ schema: {...} })`를 손으로 쓰지 않는다.** 참고 프로젝트는 CLI 플러그인을 켜지 않아 요청 본문 스키마를 손으로 썼고, 그 결과 실제 DTO와 어긋났다.
  - `POST /book` 문서에는 `id`가 있지만 `CreateBookDto`에는 없다 → 문서대로 보내면 `forbidNonWhitelisted`로 400
  - 문서는 `title`·`author`를 `nullable: true`로 적었지만 DTO는 `@IsNonEmptyString()`(필수)
- **패키지 버전을 그대로 쓰지 않는다.** 참고 프로젝트는 `@nestjs/swagger@^7`(NestJS 10용)이다. Intranet은 NestJS 11이므로 이에 맞는 `@nestjs/swagger` 메이저 버전(11)을 설치한다. 설치 전 context7로 현재 문서를 확인한다.
- `app.enableCors()`, content-type 강제 미들웨어 등 Swagger와 무관한 설정은 가져오지 않는다.
- `swagger-themes`는 선택 사항이다. 의존성을 늘릴 가치가 없으면 기본 테마를 쓴다.

## 3. Intranet에 적용할 규칙

### 3.1 설정

- `nest-cli.json`의 `compilerOptions.plugins`에 `@nestjs/swagger` 플러그인을 켠다.
  - DTO의 필드·타입·optional 여부(`?`)와 class-validator 데코레이터를 읽어 요청 스키마를 자동으로 만든다.
  - `introspectComments: true`를 켜면 DTO 필드의 주석이 description으로 들어간다.
  - 지금 DTO 주석은 전부 `//` 형식이다. 플러그인은 TSDoc 파서로 `/** */` 주석만 읽는다(2026-11-21 설치본 `plugin/utils/ast-utils.js`의 `getDocComment`로 확인). 그래서 **필드 위 주석만 `/** */`로 바꾼다.** 내용은 그대로 두고, 클래스 위 `//*` 주석은 바꾸지 않는다.
  - 같은 옵션은 컨트롤러 메서드 위 `/** */` 주석을 `@ApiOperation`의 summary로도 쓴다. 지금 컨트롤러 주석은 `//`라 영향이 없다.
  - 플러그인은 `nest build`·`nest start`에서만 적용된다. `tsc`(typecheck)와 jest(ts-jest)에는 적용되지 않지만 이 둘은 문서가 필요 없다.
- **`@nestjs/mapped-types` → `@nestjs/swagger`로 교체했다(2026-11-21, 19개 파일).** `OmitType`·`PartialType` 등을 mapped-types에서 가져오면 Swagger 정보가 상속되지 않아, 상속받은 필드가 문서에서 빠진다. (예: `AdminUpdateUserDto extends OmitType(CreateUserDto, ...)`) package.json의 직접 의존성에서도 뺐다(`@nestjs/swagger`가 내부적으로 가지고 있다). 새 DTO도 `@nestjs/swagger`에서 가져온다.
- 설치 버전: `@nestjs/swagger@^11.4.8`(NestJS 11용, 12.x는 NestJS 12용).
- 문서 설정은 `main.ts`에 직접 쓰지 말고 `backend/src/config/swagger.ts`(`setupSwagger`)로 분리해 `main.ts`에서 호출한다.
  - e2e가 쓰는 `configureApp`(`src/app.setup.ts`)에는 넣지 않는다. 테스트에는 문서가 필요 없다.
- **인증 스킴 등록**
  - `.addBearerAuth()` + 문서 전역 보안 요구(`addSecurityRequirements`). 코드의 가드 구조(전역 `AccessTokenGuard`가 기본으로 막고 `@IsPublic()`만 예외)와 같게 만들어, 새 컨트롤러에서 표시가 빠지지 않게 한다.
  - `@IsPublic()` 라우트는 문서에서 전역 요구를 해제한다(라우트별 `security: []`). Swagger 데코레이터로는 해제를 표현할 수 없어 문서 생성 직후 처리한다(`applyAccessRules`, 3.3).
  - `.addBasicAuth()` → `POST /auth/login/emp`에 `@ApiBasicAuth()`
  - refresh 토큰은 HttpOnly 쿠키(`Path=/api/auth`)라 Swagger UI에서 직접 다루지 않는다. 설명(`@ApiOperation.description`)으로 "브라우저 쿠키로 자동 전송"이라고 적는다.

### 3.2 문서 경로와 노출 범위

- 브라우저는 `/api/*`로 호출하고 Next.js rewrite(운영은 Nginx)가 `/api`를 떼고 NestJS(3100)로 넘긴다. NestJS에는 global prefix가 없다.
  - 따라서 Swagger를 NestJS의 `api` 경로에 두면 브라우저 경로가 `/api/api`가 된다. **NestJS 쪽 경로는 `docs`로 두고, 브라우저에서는 `/api/docs`로 접근**하게 한다.
  - Swagger 문서의 서버 주소(`addServer('/api')`)를 지정해 "Try it out" 요청이 rewrite를 거치도록 한다. 그래야 refresh 쿠키(`Path=/api/auth`)도 정상 동작한다.
- **운영 노출: 운영에도 열고 Nginx Basic 인증으로 막는다.** (2026-11-21 결정)
  - Basic 인증은 Nginx의 `.htpasswd` 계정으로 확인하며 사이트 회원·role과 관계없다. 문서를 보여 줄 사람(면접관 등)에게만 계정을 알려 준다.
  - 회원 권한으로 막지 않는 이유: access token은 프론트 메모리에만 있고 refresh 쿠키는 `Path=/api/auth`라, 주소창으로 `/api/docs`를 열 때 서버가 누구인지 알 수 없다.
  - 문서를 열어도 API 자체의 인증·권한 검사는 그대로다. "Try it out"도 로그인 토큰이 있어야 동작한다. 막는 이유는 관리자 API를 포함한 목록이 드러나지 않게 하는 것이다.
  - 막을 경로는 UI와 JSON 스펙(`/api/docs`, `/api/docs-json`) 모두다. 운영 할 일은 `docs/design/need_list.md`(비공개)에 있다.
- **애드온**: 꺼진 애드온은 모듈이 등록되지 않으므로 문서에도 나오지 않는다. 문서가 실제 서버(꺼진 애드온은 404)와 일치한다. 착수 시 `ADDONS`를 바꿔 실제로 빠지는지 확인한다.
- **`/api` → `/api/docs` 이동**: 브라우저에서 `/api`로 들어오면 문서로 보낸다(2026-11-21). 개발은 `frontend/next.config.ts`의 `redirects`(rewrite보다 먼저 확인, 정확히 `/api`만), 운영은 Nginx에 같은 규칙(`docs/design/need_list.md`(비공개)). 백엔드 `GET /`("Hello World!")와 e2e는 그대로 둔다.

### 3.3 컨트롤러에 붙일 데코레이터

| 데코레이터 | 규칙 |
|---|---|
| `@ApiTags('Users (회원)')` | 컨트롤러 클래스마다. 영어 + 괄호 안 한글. 모듈 하나에 컨트롤러가 여러 개(`organization`, `boards`)면 컨트롤러별로 태그를 나눈다 |
| `@ApiOperation({ summary, description })` | 모든 라우트(하네스 검사 대상). 한국어. summary는 한 줄, description에는 **상태 제약, 트랜잭션 동작** 등 코드만 봐서는 모르는 규칙을 적는다. 권한 조건은 손으로 쓰지 않는다(아래) |
| 권한 표시 | **문서 생성 직후 `setupSwagger`의 `applyAccessRules`가 자동으로 붙인다**(2026-11-21 구현). 라우트마다 `@IsPublic`·`@Roles`·`@RequireAdmin` 값을 가드와 같은 방식(`getAllAndOverride`, 메서드 → 클래스)으로 읽어 설명 맨 앞에 "**권한**: ADMIN 이상 + 관리자 기능 `USERS`" 등을 붙이고, 401(로그인 필요)·403(권한 없음) 응답을 넣는다. 권한 데코레이터는 고치지 않아 인증 코드는 Swagger를 모르고, 문서와 실제 검사가 어긋나지 않는다. 문서 라우트와 메서드는 operationId(`컨트롤러클래스_메서드`)로 짝지으므로 **컨트롤러 클래스 이름은 겹치면 안 된다**(짝을 못 찾으면 시작 로그에 경고) |
| `@ApiOkResponse` / `@ApiCreatedResponse({ type })` | 응답 스키마 대상 모듈(`auth`·`users`·`boards`)만. 응답 타입 클래스를 지정한다 (3.4) |
| 에러 응답 | 401(Bearer)·403(권한 데코레이터)은 자동으로 붙인다. 라우트 고유 에러(400 검증 외 조건, 404, 409, 429)만 그 라우트에 붙이고 어떤 경우인지 설명을 적는다 |
| `@ApiExcludeEndpoint()` | 문서에 노출하지 않을 라우트 (예: `app.controller`의 헬스 체크) |
| `@ApiQuery` / `@ApiParam` | 쿼리를 DTO로 받는 경우 플러그인이 처리하므로 붙이지 않는다. `ParseIntPipe`로 받는 `:id`처럼 DTO가 없을 때만 필요 시 추가 |

- `@ApiBody`는 붙이지 않는다 (플러그인 + DTO로 생성). 파일 업로드(multipart)처럼 DTO로 표현되지 않는 경우만 예외.

### 3.4 응답 타입

- **대상: `auth`·`users`·`boards`만.** 나머지 모듈은 응답 스키마 없이 요청·권한·에러까지만 한다. (2026-11-21 결정. 컨트롤러에 반환 타입 표기가 없고 라우트가 238개라 전부 하면 비용이 크다)
- 서비스가 Prisma 결과를 그대로 반환하면 런타임 타입 정보가 없어 Swagger가 응답 스키마를 알 수 없다.
- 응답 전용 클래스를 둔다. 위치는 각 모듈의 `dto/` 안 `*-response.dto.ts` (예: `users/dto/user-response.dto.ts`(예정)). 참고 프로젝트의 `entitiy/` 폴더 방식은 쓰지 않는다.
  - 서비스는 그대로 Prisma 결과를 반환한다(클래스 인스턴스로 변환하지 않는다).
  - **컨트롤러 반환 타입을 `Promise<응답 클래스>`로 적는다.** 서비스 `select`의 결과와 응답 클래스의 필드가 다르면 typecheck가 잡으므로 문서와 코드가 어긋나지 않는다. 플러그인도 반환 타입으로 응답 스키마를 읽는다.
  - 비밀번호 해시 등 전역 omit 필드는 응답 클래스에 넣지 않는다.
- **BigInt id**(`Notification`, `Audit`, `ApprovalDocumentHistory`)는 응답 시 문자열로 변환되므로 `type: String`으로 문서화한다.
- **Date**는 ISO 문자열로 나간다.
- **페이지네이션**: `common/dto`의 `PagePaginationDto` / `CursorPaginationDto`가 요청 쪽이다. 응답(목록 + 전체 개수 / 다음 커서)은 **모듈별 응답 클래스**로 둔다(예: `UserListResponse`). 대상 모듈이 3개뿐이라 공통 제네릭(`ApiExtraModels` + `getSchemaPath`)은 쓰지 않는다.
- enum(`UserRole`, `UserStatus`, `BoardType` 등)은 `@ApiProperty({ enum: ..., enumName: ... })`로 이름을 붙여 스키마에서 재사용되게 한다.
- **기본값이 있는 필드**(`page: number = 1`처럼 `?` 없이 초기값만 있는 필드)는 플러그인이 필수로 표시한다. 실제로는 생략할 수 있으므로 `@ApiProperty({ required: false, default: ... })`를 붙인다. 공통 페이지 DTO(`take`·`order`·`page`)는 2026-11-21에 처리했고, 모듈 DTO의 `order`·`scope` 등은 그 모듈 차례에 같은 규칙으로 처리한다.

## 4. 작업 순서

브랜치는 `feature/swagger` 하나에서 진행한다.

1. ✅ `@nestjs/swagger` 설치 (NestJS 11 호환 버전 확인), `nest-cli.json` 플러그인 설정, `@nestjs/mapped-types` import 교체
2. ✅ `backend/src/config/swagger.ts` 작성 → `main.ts`에서 호출, `/api/docs` 접근 확인, `ADDONS`를 바꿔 꺼진 애드온이 빠지는지 확인 (2026-11-21: 전부 켬 238개 라우트 / 전부 끔 97개, 토큰 없이 문서 200·API 401, 화면 파일은 상대 경로 `./docs/...`라 `/api/docs`에서도 맞다. 브라우저에서 `/api/docs` 직접 확인은 아직)
3. ✅ 인증 스킴(Bearer 전역 / Basic) 등록, `@IsPublic()` 해제 처리, `@Roles`·`@RequireAdmin` 권한 표시 (2026-11-21: 238개 중 공개 9 · 로그인만 9 · USER 이상 149 · ADMIN 71, 경고 없음. `POST /auth/login/emp`만 Basic. UI에서 로그인 → 토큰 넣고 호출은 브라우저 확인 필요)
4. 모듈 단위로 진행: `auth` → `users` → `organization` → `boards` → `common` → 애드온(`reservations` → `approvals` → `chats` → `projects`)
   - 모듈마다 DTO 필드 주석 `/** */` 변환 → `@ApiTags`·`@ApiOperation` → (대상 모듈만) 응답 클래스 → 에러 응답 순서
   - ✅ `auth` (2026-11-21): 12개 라우트 태그·summary·에러, 응답 클래스 `auth/dto/auth-response.dto.ts`(컨트롤러 반환 타입으로 지정), DTO 필드 설명. 회원가입이 쓰는 `users/dto/create-user.dto.ts`는 주석이 없어 검증 규칙으로 확인되는 설명을 새로 썼다. `GET /`("Hello World!")는 `@ApiExcludeEndpoint()`로 문서에서 숨김(라우트·e2e는 유지)
   - 참고: 이 저장소에서 사용자 입력 오류·없는 회원은 대부분 400(`BadRequestException`)이다(중복 사번·이메일, 존재하지 않는 회원 포함). 문서도 실제 코드대로 400으로 적는다
   - ✅ `users` (2026-11-21): 17개 라우트, 응답 클래스 `users/dto/user-response.dto.ts`(내 정보·목록·상세·현황·검색), 페이지 meta는 users·boards 공용 `common/dto/page-meta-response.dto.ts`. 요청 DTO enum에 이름(`UserRole`·`UserStatus`·`AdminPermission`·`UserSortBy`·`SortOrder`)
   - ✅ `organization` (2026-11-21): 컨트롤러 5개(부서·직급·직책·회원 소속·조직도) 27개 라우트, 태그는 컨트롤러별. 응답 스키마 대상 아님. 직급·직책 목록의 `sortBy`·`order`(기본 ASC) 기본값 표시
   - ✅ `boards` (2026-11-21): 컨트롤러 5개(게시판·게시판 권한·게시글·댓글·캘린더) 27개 라우트, 응답 클래스 `boards/dto/board-response.dto.ts`·`post-response.dto.ts`·`comment-response.dto.ts`(익명 게시판·삭제 댓글처럼 형태가 갈리는 응답도 typecheck 통과). 첨부 다운로드는 `@ApiProduces('application/octet-stream')` + binary 응답.
   - 발견 후 수정(2026-11-21 사용자 결정): 게시판명 길이가 생성 1~50자·수정 1~100자로 달라 1~100자로 맞췄다(백엔드 `CreateBoardDto`, 프론트 `board-form-dialog.tsx` 검사). `CreateBoardDto`의 `isAnonymous`·`allowSecret`에 `?`를 붙여 타입과 `@IsOptional`을 맞췄다(동작 변화 없음, 생략 시 DB 기본값 false)
   - 발견 후 수정(2026-11-21 사용자 결정): 댓글 목록은 API가 페이지 없이 전체 트리를 주고 화면(`comment-section.tsx`)이 스레드 단위로 페이지를 나누는데, 컨트롤러 주석은 "(페이지)", 서비스 메서드는 `paginateComment`였다. 주석을 실제 동작으로 고치고 메서드 이름을 `getCommentTree`로 바꿨다
   - ✅ `common` (2026-11-21): 컨트롤러 5개(파일·알림·감사 로그·공휴일·애드온) 13개 라우트. 업로드 2개는 `@ApiConsumes('multipart/form-data')` + `@ApiBody`(multipart 예외), 공개 이미지·썸네일은 binary 응답. 감사 로그 enum 이름(`AuditActionType`·`AuditTargetType`). 라우트가 없는 `CommonController`는 손대지 않았다. **핵심 모듈 완료, 남은 것: 애드온 4개(141개 라우트)**
   - ✅ `reservations` (2026-11-21): 컨트롤러 4개(시설 분류·시설·사용 불가 기간·예약) 27개 라우트. 설명은 features.md 6장 규칙과 서비스 검사(분류 규칙 위반 400, 겹침 409, 지난 예약 권한 표)로 썼다. `FacilityReservationStatus` enum 이름
5. 모듈마다 생성된 스키마가 실제 DTO·응답과 맞는지 UI에서 요청을 보내 확인한다 (참고 프로젝트처럼 문서와 코드가 어긋나지 않도록)
6. 하네스 검사 추가: `@ApiOperation`이 없는 라우트를 찾는다(라우트 권한 데코레이터 검사와 같은 방식). `harness/rules.json`에 새 태그로 등록하고 [harness.md](harness.md)에 반영한다
7. 공통 규약 가이드를 이 문서 5장에 작성한다

## 5. 공통 규약 가이드 (작업 시 작성)

Swagger로 표현하기 어려운 내용을 여기에 정리한다. 작성할 항목:

- 호출 경로 규칙: 브라우저는 `/api/*`, rewrite·Nginx가 `/api` 제거
- 인증 흐름: 로그인(Basic) → access(메모리, 10분) / refresh(HttpOnly 쿠키, 로그인 유지 선택에 따라 세션 쿠키 또는 기간 쿠키) → 401 시 재발급 → 403은 재발급 금지. 상세는 [frontend/fe-01-auth.md](frontend/fe-01-auth.md)
- 로그인·가입 IP 요청 수 제한(429), 로그인 실패 계정 잠금
- 채팅 Socket.IO: 연결 방법(handshake 토큰, access token 만료 시 서버가 끊음 → 새 토큰으로 재연결)과 서버 → 클라이언트 이벤트 이름·payload 표
- 에러 응답 형식: NestJS 기본 `{ statusCode, message, error }`, 검증 실패 시 `message`가 배열
- 일괄 처리 API(`ids` 배열)는 하나라도 실패하면 전체 롤백
- 페이지네이션 요청·응답 형식
- BigInt id는 문자열, 날짜는 ISO 문자열

## 6. 완료 기준

- `/api/docs`에서 모든 컨트롤러가 태그별로 보이고, `@ApiExcludeEndpoint` 대상 외에 누락이 없다
- 모든 라우트에 summary가 있고(하네스 검사 통과), 권한 조건이 데코레이터로 자동 표시된다
- 공개 라우트(`@IsPublic()`)에는 자물쇠 표시가 없고, 나머지에는 있다
- 요청 본문은 플러그인으로 생성되며 `@ApiBody` 수동 스키마가 없다 (multipart 예외). 상속 DTO의 필드가 빠지지 않는다
- `auth`·`users`·`boards`의 라우트에 응답 클래스가 지정되어 있고, 컨트롤러 반환 타입이 그 클래스다
- 꺼진 애드온의 API가 문서에 없다
- UI의 "Try it out"으로 로그인 → 보호된 API 호출이 동작한다
- 운영 Nginx Basic 인증 설정이 `docs/design/need_list.md`(비공개)에 있다
- 작업 중 결정 사항을 `docs/devlog/`에 기록한다
