# API 문서화 (Swagger) 작업 명세

> 상태: **미착수** (2026-11-01 작성). 백엔드 기능이 대부분 완성된 뒤 진행한다.
> API 문서 작업을 요청받으면 이 문서를 먼저 읽고 그 규칙을 따른다.
> 새 라이브러리 도입이므로 착수 전에 AGENTS.md 18장 기준(필요 이유·대안·복잡도)을 사용자와 한 번 더 확인한다.

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
  - `introspectComments: true`를 켜면 DTO 필드의 주석이 description으로 들어간다. (DTO에 이미 주석이 있으므로 활용)
- 문서 설정은 `main.ts`에 직접 쓰지 말고 `src/config/swagger.ts` 같은 함수로 분리해 `main.ts`에서 호출한다.
- **인증 스킴 등록**
  - `.addBearerAuth()` → 전역 `AccessTokenGuard` 대상 API에 `@ApiBearerAuth()` (컨트롤러 클래스 단위로 붙이고, `@IsPublic()` 라우트는 예외 처리)
  - `.addBasicAuth()` → `POST /auth/login/emp`에 `@ApiBasicAuth()`
  - refresh 토큰은 HttpOnly 쿠키(`Path=/api/auth`)라 Swagger UI에서 직접 다루지 않는다. 설명(`@ApiOperation.description`)으로 "브라우저 쿠키로 자동 전송"이라고 적는다.

### 3.2 문서 경로와 노출 범위

- 브라우저는 `/api/*`로 호출하고 Next.js rewrite(운영은 Nginx)가 `/api`를 떼고 NestJS(3100)로 넘긴다. NestJS에는 global prefix가 없다.
  - 따라서 Swagger를 NestJS의 `api` 경로에 두면 브라우저 경로가 `/api/api`가 된다. **NestJS 쪽 경로는 `docs`로 두고, 브라우저에서는 `/api/docs`로 접근**하게 한다.
  - Swagger 문서의 서버 주소(`addServer('/api')`)를 지정해 "Try it out" 요청이 rewrite를 거치도록 한다. 그래야 refresh 쿠키(`Path=/api/auth`)도 정상 동작한다.
- **운영 노출 여부는 착수 시 결정한다.** 선택지: 개발 환경에서만 `setup` 호출 / 운영도 열되 Nginx Basic 인증 / 포트폴리오 시연용으로 공개. 공개한다면 관리자 API 존재가 드러나는 점을 감안한다.

### 3.3 컨트롤러에 붙일 데코레이터

| 데코레이터 | 규칙 |
|---|---|
| `@ApiTags('Users (회원)')` | 컨트롤러 클래스마다. 모듈 하나에 컨트롤러가 여러 개(`organization`, `boards`)면 컨트롤러별로 태그를 나눈다 |
| `@ApiOperation({ summary, description })` | 모든 라우트. summary는 한 줄, description에는 **권한 조건(USER/ADMIN), 상태 제약, 트랜잭션 동작** 등 코드만 봐서는 모르는 규칙을 적는다 |
| `@ApiOkResponse` / `@ApiCreatedResponse({ type })` | 응답 타입 클래스를 지정한다 (3.4) |
| 에러 응답 | 공통 401/403은 컨트롤러 단위로 한 번, 라우트 고유 에러(400 검증 실패 조건, 404, 409 등)만 라우트에 붙인다 |
| `@ApiExcludeEndpoint()` | 문서에 노출하지 않을 라우트 (예: `app.controller`의 헬스 체크) |
| `@ApiQuery` / `@ApiParam` | 쿼리를 DTO로 받는 경우 플러그인이 처리하므로 붙이지 않는다. `ParseIntPipe`로 받는 `:id`처럼 DTO가 없을 때만 필요 시 추가 |

- `@ApiBody`는 붙이지 않는다 (플러그인 + DTO로 생성). 파일 업로드(multipart)처럼 DTO로 표현되지 않는 경우만 예외.

### 3.4 응답 타입

- 서비스가 Prisma 결과를 그대로 반환하면 런타임 타입 정보가 없어 Swagger가 응답 스키마를 알 수 없다.
- 응답 전용 클래스를 둔다. 위치는 각 모듈의 `dto/` 안 `*-response.dto.ts` (예: `users/dto/user-response.dto.ts`). 참고 프로젝트의 `entitiy/` 폴더 방식은 쓰지 않는다.
  - 클래스는 문서용이며 서비스 반환 타입을 억지로 바꾸지 않는다. 다만 `select`/`omit`과 필드가 맞는지 확인한다.
  - 비밀번호 해시 등 전역 omit 필드는 응답 클래스에 넣지 않는다.
- **BigInt id**(`Notification`, `Audit`, `ApprovalDocumentHistory`)는 응답 시 문자열로 변환되므로 `type: String`으로 문서화한다.
- **Date**는 ISO 문자열로 나간다.
- **페이지네이션**: `common/dto`의 `PagePaginationDto` / `CursorPaginationDto`가 요청 쪽이다. 응답 래퍼(목록 + 전체 개수 / 다음 커서)는 제네릭 응답이 필요하면 `ApiExtraModels` + `getSchemaPath` 패턴을 쓴다. 과하면 모듈별 응답 클래스로 단순하게 처리한다.
- enum(`UserRole`, `UserStatus`, `BoardType` 등)은 `@ApiProperty({ enum: ..., enumName: ... })`로 이름을 붙여 스키마에서 재사용되게 한다.

## 4. 작업 순서

1. `@nestjs/swagger` 설치 (NestJS 11 호환 버전 확인), `nest-cli.json` 플러그인 설정
2. `src/config/swagger.ts` 작성 → `main.ts`에서 호출, `/api/docs` 접근 확인
3. 인증 스킴(Bearer / Basic) 등록, 로그인 → 토큰 넣고 보호된 API 호출이 UI에서 되는지 확인
4. 모듈 단위로 진행: `auth` → `users` → `organization` → `boards` → 이후 모듈
   - 모듈마다 `@ApiTags`·`@ApiOperation` → 응답 클래스 → 에러 응답 순서
5. 모듈마다 생성된 스키마가 실제 DTO·응답과 맞는지 UI에서 요청을 보내 확인한다 (참고 프로젝트처럼 문서와 코드가 어긋나지 않도록)
6. 공통 규약 가이드를 이 문서 5장에 작성한다

## 5. 공통 규약 가이드 (작업 시 작성)

Swagger로 표현하기 어려운 내용을 여기에 정리한다. 작성할 항목:

- 호출 경로 규칙: 브라우저는 `/api/*`, rewrite·Nginx가 `/api` 제거
- 인증 흐름: 로그인(Basic) → access(메모리, 10분) / refresh(HttpOnly 쿠키, 1일) → 401 시 재발급 → 403은 재발급 금지. 상세는 [frontend/fe-01-auth.md](frontend/fe-01-auth.md)
- 에러 응답 형식: NestJS 기본 `{ statusCode, message, error }`, 검증 실패 시 `message`가 배열
- 일괄 처리 API(`ids` 배열)는 하나라도 실패하면 전체 롤백
- 페이지네이션 요청·응답 형식
- BigInt id는 문자열, 날짜는 ISO 문자열

## 6. 완료 기준

- `/api/docs`에서 모든 컨트롤러가 태그별로 보이고, `@ApiExcludeEndpoint` 대상 외에 누락이 없다
- 모든 라우트에 summary가 있고, 권한 조건이 description에 적혀 있다
- 요청 본문은 플러그인으로 생성되며 `@ApiBody` 수동 스키마가 없다 (multipart 예외)
- 주요 응답에 응답 클래스가 지정되어 있다
- UI의 "Try it out"으로 로그인 → 보호된 API 호출이 동작한다
- 작업 중 결정 사항(운영 노출 여부, 응답 클래스 방식 등)을 `docs/devlog/`에 기록한다
