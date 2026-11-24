# Intranet Portfolio Project Context

> 상위 설계 문서 (Source of Truth) · Claude Code, Codex 등 모든 코딩 에이전트가 공통으로 읽는다.
> 버전: v1.98 · 최종 갱신: 2026-11-25
> 기능·구조가 바뀌면 이 문서(또는 해당 `docs/design/` 문서)를 먼저 갱신하고 [docs/design/changelog.md](docs/design/changelog.md)에 기록한다.
> **이 파일은 30KB 이하로 유지한다**(Codex 기본 읽기 한도 32KiB). 기능 상세는 [docs/design/features.md](docs/design/features.md)에 쓰고 여기에는 요약만 둔다. [R-DOC-01]
> 규칙 앞의 `[R-XXX-00]` 태그는 규칙 대장 [harness/rules.json](harness/rules.json)과 짝이다. 무엇이 강제하는지는 [docs/harness.md](docs/harness.md). [R-DOC-03]

## 1. 프로젝트 목적

취업용 포트폴리오로 사용할 사내 인트라넷 웹 시스템을 개발한다.

기존 PHP 백엔드 개발 경험을 바탕으로 TypeScript 기반 풀스택 개발 역량을 보여주는 것이 목적이다.

주요 목표 기술 스택:

- Backend: NestJS
- Frontend: Next.js
- Language: TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Realtime: Socket.IO
- Container: Docker / Docker Compose
- Web Server / Reverse Proxy: Nginx
- Deployment: AWS EC2

별도로 이미 개발한 `NestJS_SNS` 프로젝트가 존재하며, 운영(AWS)에는 Intranet만 배포한다. SNS는 로컬 개발·GitHub 저장소로만 남긴다(2026-11-24 결정, [deploy.md](docs/design/deploy.md) 2장).

---

# 2. 현재 로컬 프로젝트 구조

Windows 개발 환경 (`infra-db`에 PostgreSQL 전용 `docker-compose.yaml`을 둔다):

```text
D:\VScode_Workspace\portfolio\
├── infra-db\                         # SNS·Intranet 공용 PostgreSQL (폴더 구성: infra-db.md 1장)
├── NestJS_SNS\                       # 기존 SNS 프로젝트
│   ├── backend\
│   └── frontend\
│
└── intranet\                         # 이 프로젝트
    ├── backend\
    └── frontend\
```

---

# 3. PostgreSQL 구성 원칙

SNS와 Intranet은 `infra-db`의 docker-compose 하나로 함께 관리하되, PostgreSQL 메이저 버전이 다르므로 컨테이너(인스턴스)는 버전별로 분리한다.

- SNS: 기존대로 PostgreSQL 17 유지
- Intranet: PostgreSQL 18 사용

PostgreSQL은 하나의 인스턴스(클러스터)에 서로 다른 메이저 버전이 공존할 수 없기 때문이다.

구조:

```text
infra-db (docker-compose, network: infra-db-net)
├── postgres17 (container: infra-postgres17, host port 127.0.0.1:5432)
│   └── sns        ← owner: sns_user
└── postgres18 (container: infra-postgres18, host port 127.0.0.1:5433)
    ├── intranet       ← owner: intranet_user
    └── intranet_test  ← owner: intranet_test_user (e2e 테스트 전용)
```

DB 계정은 프로젝트별로 분리한다.

```text
sns_user
→ sns DB 전용 (DB owner)

intranet_user
→ intranet DB 전용 (DB owner)
```

각 DB는 `REVOKE ALL ... FROM PUBLIC`으로 해당 프로젝트 계정 외에는 접속할 수 없도록 격리한다.

포트는 `127.0.0.1`에만 바인딩하여 EC2 외부로 DB를 노출하지 않는다.
컨테이너 내부 포트는 둘 다 5432이며, 호스트 포트만 5432 / 5433으로 구분한다.
같은 Docker 네트워크(`infra-db-net`) 안의 컨테이너에서는 `infra-postgres17:5432`, `infra-postgres18:5432`로 접근한다.

위 구성은 로컬 기준이다. **운영(AWS)은 RDS 인스턴스 하나(PostgreSQL 18)에 `intranet` DB를 두고**(친구용 인스턴스를 추가하면 같은 RDS에 DB를 하나 더 둔다), 계정 분리·`REVOKE`는 같게 한다. SNS는 배포하지 않는다(2026-11-24 결정, [deploy.md](docs/design/deploy.md) 2장).

애플리케이션별 `.env`도 분리한다. `.env` 예시, **비밀번호 특수문자 주의**(`.env`는 작은따옴표, Prisma `DATABASE_URL`은 퍼센트 인코딩), `infra-db/.env` 구성, DB/계정 생성 스크립트, SNS 데이터 이관 기록은 [docs/design/infra-db.md](docs/design/infra-db.md) 참고.

---

# 4. 로컬 개발과 운영 환경

로컬 개발은 PostgreSQL만 Docker, NestJS는 `npm run start:dev`, Next.js는 `npm run dev`로 한다. (앱까지 Docker에 넣지 않는다)

## 포트 배정

동일 EC2 서버에서 프로세스 간 호스트 포트가 겹치지 않도록 다음과 같이 배정한다.

| 프로젝트 | 구성 | 포트 |
|---|---|---|
| SNS | React (Vite) | 5173 |
| SNS | NestJS | 3101 |
| Intranet | Next.js | 3000 |
| Intranet | NestJS | 3100 |
| infra-db | PostgreSQL 17 (sns) | 5432 |
| infra-db | PostgreSQL 18 (intranet) | 5433 |

- NestJS는 `.env`의 `PORT`로 포트를 지정한다. (`process.env.PORT`)

## 운영 환경 (AWS EC2)

- 외부에는 Nginx(80/443)만 노출하고, 애플리케이션과 DB는 `127.0.0.1` 또는 Docker 내부 네트워크로만 접근한다. 보안 그룹은 22 / 80 / 443만.
- Frontend와 Backend는 **별도 컨테이너**로 운영한다(독립 빌드·재배포·재시작, 로그·장애 범위·환경변수 분리). 전체는 `docker-compose.prod.yaml` 하나로 관리할 수 있다.
- Nginx 라우팅 그림, 서비스 목록, SNS 관련 메모는 [docs/design/deploy.md](docs/design/deploy.md), 배포 때 할 일 체크리스트는 `docs/design/need_list.md`(비공개, 새 운영 할 일이 생기면 여기에 추가).

---

# 5~9. 기능별 규칙 (요약)

> 상세 규칙·Entity·동작 흐름은 [docs/design/features.md](docs/design/features.md)에 있다. 장 번호(5.1~9)는 그 문서에서 그대로 쓴다.
> 해당 기능을 작업할 때는 **features.md의 그 장을 먼저 읽는다.** 아래는 모든 작업에서 지켜야 하는 규칙만 모은 것이다.

## 5.1 회원 (상세: features.md 5.1)

- 권한은 별도 테이블 없이 `Users.role` enum(`GUEST / USER / ADMIN / SUPER_ADMIN`), 직급은 `Users.positionId`(사람 단위), 소속은 `UserDepartment`(겸직 시 여러 행, `isPrimary`).
- 가입 전 이용약관·개인정보 수집·이용 필수 동의, 이력은 `UserConsent`에 행 추가로만 기록한다.
- 가입 승인(GUEST → USER/ADMIN)은 입사일(`joinAt`)이 등록된 회원만 가능하고, 승인된 회원은 입사일을 비울 수 없다.
- 관리자의 권한·상태 변경과 삭제는 단건·일괄이 같은 서비스(`ids` 배열)를 쓰고, 한 명이라도 처리할 수 없으면 전체 실패(트랜잭션).
## 5.2 인증 (상세: features.md 5.2, [docs/backend/jwt-auth.md](docs/backend/jwt-auth.md))

- Access Token(10분)은 `Authorization: Bearer`, **stateless**: `AccessTokenGuard`는 payload만 검증하고 DB를 보지 않는다. `req.user`는 payload(`id`·`empNo`·`role`·`tokenVersion`).
- Refresh Token은 HttpOnly 쿠키(`Path=/api/auth`), **stateful**: 로그인마다 `AuthSession` 행, 재발급마다 rotation, 재사용 감지(유예 1분). 회원 조회(`tokenVersion`·상태)는 재발급에서만 한다.
- 로그인 유지(기본 해제): 체크하지 않으면 refresh 쿠키를 세션 쿠키로 발급한다. 선택은 `AuthSession.rememberMe`에 저장해 쿠키를 다시 발급할 때도 유지한다.
- [R-AUTH-01] **새 API는 반드시 `@Roles(UserRole.USER)` 이상(관리자 API는 기능별 `@RequireAdmin`, features.md 5.1)을 붙인다**(애드온 포함). `RolesGuard`는 `@Roles`가 없으면 통과시킨다. `@Roles` 없이 두는 것은 본인 계정용(마이페이지·비밀번호 변경·기기 세션·내 소속)뿐이고, 로그인 없이 쓰는 API는 `@IsPublic()`. 본인 계정용 목록은 `harness/harness.config.json`의 `routeGuards.allowlist`(이유 포함)이고, 누락은 검사가 잡는다.
- 로그인 실패는 계정 기준 단계 잠금(5회마다 10분 → 30분 → 1시간, `LoginHistory`, 성공·관리자 해제 시 초기화) + 로그인·가입 IP 요청 수 제한(`@nestjs/throttler`). 실패 메시지는 원인을 구분하지 않는다.
- 프론트 연동은 [docs/frontend/fe-01-auth.md](docs/frontend/fe-01-auth.md).

## 5.3 게시판 (상세: features.md 5.3)

- 관리자가 게시판을 만든다. `BoardType`: `CATEGORY / NORMAL / NOTICE / CALENDAR / ALBUM`. 계층은 최대 2단계(`CATEGORY`는 최상위에만).
- `BoardAuth` 규칙이 없는 게시판은 관리자만 본다(기본 거부). 권한 검사는 게시판 단위.
- 에디터는 Tiptap(`useEditor({ immediatelyRender: false })`). 본문 HTML은 **백엔드에서 저장 시 허용 태그만 남기도록 정제**한다. 영상은 YouTube·Vimeo 임베드 iframe만 허용.

## 6. 시설 예약 (애드온 `reservations`, 상세: features.md 6)

- `FacilityCategory`(관리자가 만드는 분류, 필수, 시설이 남은 분류는 삭제 불가) / `Facility` / `FacilityReservation` / `FacilityUnavailable`. 회의실·차량·장비 등을 같은 규칙으로 예약한다.
- **시간 중복 예약 방지가 핵심**이며 시설 단위로 막는다(같은 분류의 다른 시설끼리는 겹쳐도 됨). 분류가 예약 단위·운영 시간·운영 요일·최대 예약 가능 기간을 정한다. 범위는 `[시작, 종료)`, 하루 안에서만, 트랜잭션 검사 + exclusion constraint 이중 방어. 지난 예약(시작 후)은 본인 불가·관리자 삭제만.
- 주차 자리처럼 해지할 때까지 유지되는 배정은 시설 예약에 넣지 않는다(별도 애드온 후보, Plan.md).

## 7. 전자결재 / 휴가 (애드온, 상세: features.md 7)

- 전자결재는 공통 승인 기능, 휴가(`LeaveRequest`)는 별도 업무 데이터로 분리해 결재 문서와 1:1로 결합한다. 휴가는 결재의 옵션(`approvals/leaves/`).
- 결재라인은 문서별 `ApprovalDocumentStep`에 스냅샷(결재 당시 이름·부서·직급·직책 포함)으로 복사한다. 단계는 순차, 한 단계에 여러 명이면 병렬(모두 승인).
- 최종 승인 → 업무 처리는 **문서 유형별 처리기 등록 + 같은 트랜잭션(`tx`) 전달**. 결재 본체는 휴가를 import하지 않는다.
- 결재 규칙(임시저장·회수·다시 기안·결재함·결재라인 관리자 위임)은 features.md 7.5, 연차 계산식·관리자 조정은 [leave_calculate_manual.md](docs/design/leave_calculate_manual.md). 상태 변경은 문서 행 조건부 UPDATE를 먼저 해 동시 처리를 막는다.
- 휴가: 종일 = 달력 일수(쉬는 날은 신청자가 나눠 신청), 같은 회원 휴가끼리 시간 겹침 불가 + 하루 합계 1일까지, 연차 잔여는 진행 중 포함. 상신·최종 승인 처리기가 **회원 행 잠금** 안에서 검사한다(features.md 7.4 "휴가 신청 규칙").

## 8. 채팅 (애드온, 상세: features.md 8)

- **보내기·수정·삭제·방 관리는 REST**(기존 가드·검증·트랜잭션 그대로), 소켓은 서버 → 클라이언트 푸시만. 서비스가 커밋 후 푸시한다.
- 받는 사람은 매번 DB의 활성 참여자로 정해 각자의 `user:{id}` room으로 보낸다(채팅방 room 없음).
- 소켓 handshake에서 JWT + `tokenVersion`·status를 검증하고, **access token 만료 시각에 서버가 연결을 끊는다**(클라이언트가 새 토큰으로 재연결). 채팅은 `Notification` 행을 만들지 않는다.

## 과제 관리 (애드온 `projects`, 상세: [docs/design/projects.md](docs/design/projects.md))

- 프로젝트·과제·거래처·협력사·견적서·매출·예산을 애드온 하나로 함께 켠다(하위 옵션 없음). 프로젝트는 참여자·과제 관리 관리자만 보고, 금액도 볼 수 있는 사람 모두가 본다(원화 정수 `Decimal(15,0)`).
- 견적서 결재 연동은 결재가 켜져 있을 때만: 연결 모듈 `ProjectsApprovalModule`을 `addonModule([ 'projects', 'approvals' ], ...)`로 둘 다 켜졌을 때만 등록한다. `ProjectsModule`은 결재를 import하지 않는다.

## 9. 알림 · 감사 로그 · 파일 (핵심, 상세: features.md 9)

- `Notification`, `Audit`, `Files`는 `targetType` + `targetId` 다형 참조라 `targetId`에 FK를 걸지 않는다.
- `Notification`, `Audit`, `ApprovalDocumentHistory`의 id는 `BigInt` → 응답 시 문자열로 변환한다.
- 알림·감사 로그 enum은 분리(`Notification*Type` / `Audit*Type`). 알림은 만드는 쪽이 `link`(프론트 주소)를 저장하고 물리 삭제(90일 배치), 감사 로그는 `detail Json?`에 변경 내용, 일괄 처리는 1행(`batch: true` + pk 배열).
- 핵심(`common`) 모듈이며 애드온을 모른다. 애드온이 직접 호출한다.
- 감사 로그 조회는 `common/audit-logs`(`AUDIT` 기능), 꺼진 애드온의 로그는 조회에서 뺀다. 대시보드는 카드별로 각 API를 호출한다([fe-17-dashboard.md](docs/frontend/fe-17-dashboard.md)).
- 호출 방식: 감사 로그는 서비스 생성자에서 `auditService.target(대상)`으로 만든 헬퍼(`created/updated/deleted/log/logBatch`)를 같은 `tx`로 호출, 알림 규칙(받는 사람·문구·link)은 모듈별 `*-notifier.ts`에 두고 서비스는 **트랜잭션 커밋 후** 한 줄 호출(실패해도 업무 성공, `bestEffort`). 상세는 [docs/backend/audit-notifications.md](docs/backend/audit-notifications.md) 7장.

---

# 10. NestJS Backend 구조

도메인 중심 모듈 구조를 사용한다.

예:

```text
intranet/backend/
├── src/
│   ├── auth/
│   ├── users/
│   ├── organization/     # 부서·직급·직책·소속 (컨트롤러·서비스 여러 개, 모듈 하나)
│   ├── boards/           # 게시판·게시판 권한·게시글·댓글 (모듈 하나)
│   ├── reservations/
│   ├── approvals/        # 전자결재 (approval-lines 포함) + 옵션 leaves/ (휴가, 결재가 켜져 있을 때만)
│   ├── chats/
│   ├── projects/         # 과제 관리
│   ├── common/           # 공용 데코레이터·DTO·유틸 + 파일·알림·감사 로그 (핵심, 업무 권한은 모름)
│   ├── config/
│   ├── prisma/
│   ├── app.module.ts
│   └── main.ts
├── prisma/               # 11장
└── test/                 # e2e
```

- 함께 생기고 함께 사라지는 데이터는 한 모듈로 묶는다. (조직 마스터 데이터 → `organization`, 게시판·글·댓글 → `boards`)
- [R-ARCH-01] 파일 기능은 `common`에 두되 **common은 업무 모듈을 import하지 않는다.** 첨부 다운로드 권한은 각 업무 모듈 컨트롤러가 검사한 뒤 `FilesService`로 스트리밍한다. (예: `GET /boards/:boardId/posts/:postId/files/:fileId`)
  - 먼저 업로드(`POST /common/files/images` 공개 uuid 주소 / `attachments` 비공개)하고 저장 시 연결한다. 저장 위치는 `FileStorage` 추상 클래스 뒤(현재 로컬 `UPLOAD_ROOT=../uploads`, 운영 S3는 구현체만 추가). 경로 규칙·업로드 흐름은 [docs/backend/files.md](docs/backend/files.md).
- 게시글 하위 리소스(댓글·첨부)의 경로는 `boards/:boardId/posts/:postId/...`로 통일하고, 권한은 `PostsService.checkPost`(URL의 게시판 권한 → 그 게시판의 글인지 확인)를 재사용한다.
- 정기 작업(`@Cron`)은 그 일을 하는 서비스에 둔다(애드온이 꺼지면 함께 빠진다). 한눈에 보는 목록은 [docs/backend/cron-jobs.md](docs/backend/cron-jobs.md)이고, 새 작업을 추가하면 그 표도 고친다.
- [R-DOC-04] API 문서는 Swagger(`/api/docs`): 새 라우트에는 `@ApiOperation`(한국어 summary), 컨트롤러에는 `@ApiTags`를 붙인다. 권한은 데코레이터에서 자동 표시. 규칙은 [docs/api.md](docs/api.md) 3장.

각 업무 모듈은 `users/` = `users.module.ts`·`users.controller.ts`·`users.service.ts`·`dto/`처럼 구성한다. 최상위에서 controller/service/entity 형식으로 나누지 않고 도메인을 기준으로 분리한다.

## 10.1 핵심 모듈과 애드온 (ON/OFF)

사이트 운영에 필요한 모듈은 **핵심**, 이후 추가하는 업무 기능은 **애드온**으로 두고 배포 설정으로 켜고 끈다. (2026-11-07 사용자 결정)

| 구분 | 모듈 |
|---|---|
| 핵심 | `auth`, `users`, `organization`, `boards`(게시판·게시글·댓글·에디터·캘린더), `common`(파일, **알림, 감사 로그**), `prisma` |
| 애드온 | `reservations`(시설 예약), `approvals`(전자결재), `chats`, `projects`(과제 관리) |
| 애드온의 옵션 | 휴가(연차) = **결재의 옵션**. 결재가 켜져 있을 때만 켤 수 있고, 코드는 `approvals/leaves/`(결재 본체와 별도 서비스·테이블) |

> 상세(켜고 끄기 동작, 등록 지점, 허용한 타협)는 [docs/design/addons.md](docs/design/addons.md).

- **의존 방향**: 애드온 → 핵심 허용. [R-ARCH-01] 핵심 → 애드온 금지(import하지 않음), 애드온 → 애드온은 선언한 경우만(휴가 → 결재, 과제 관리 ↔ 결재 연결 모듈). [R-ARCH-02] 새 모듈 폴더는 `harness/harness.config.json` `boundaries`에 분류해 넣는다(분류는 사용자에게 확인).
- **켜고 끄기**: `backend/.env`의 `ADDONS`(쉼표 목록)로 `AppModule`에 등록할지 정한다(`addonModule(...)`, 목록은 `src/config/addons.config.ts`). 없거나 비면 전부 꺼짐. 꺼진 애드온은 API가 없고(404) 데이터는 그대로 둔다. 모르는 이름·본체 없는 옵션은 시작 단계 오류. 프론트는 `GET /common/addons`로 메뉴·화면을 제어한다.
- **등록 지점**: 핵심이 애드온 데이터를 확인해야 하면 핵심이 provider 배열을 열고 애드온이 등록한다(아직 사용처 없음). 핵심은 애드온 테이블을 직접 조회하지 않는다.
- **허용한 타협**: 스키마는 하나라 애드온 테이블·핵심 enum의 애드온 값은 있어도 된다. **코드 의존만 끊는다.** 플러그인 로더 같은 동적 로딩은 만들지 않는다.

---

# 11. Prisma

Intranet은 PostgreSQL + Prisma(SNS는 TypeORM). 스키마·마이그레이션·seed는 `backend/prisma/`(`schema.prisma`, `migrations/`, `seed.ts`), NestJS 접근 계층은 `src/prisma/`(`prisma.module.ts`, `prisma.service.ts`).

---

# 12. Next.js Frontend 구조

> **프론트엔드 작업 시 필수 참조**: `frontend/` 관련 작업(화면 구현, 레이아웃, 스타일, API 연동 등)을 요청받으면, 사용자가 따로 언급하지 않아도 **작업 전에 [docs/frontend_requirements.md](docs/frontend_requirements.md)를 읽고 그 규칙을 따른다.**
> - 디자인 시스템, 레이아웃, 반응형, API 연동, 작업 범위, 완료 기준이 정의되어 있다.
> - 기능별 요구사항은 매 작업 요청에서 지정한다.
> - 작업 후에는 구조·역할 설명을 `docs/frontend/`에 작업별 파일로 기록한다. (요구사항 문서 7장)
> - 초기 설정의 구조 설명은 [docs/frontend/00-setup.md](docs/frontend/00-setup.md)를 참고한다.
> - 로그인·토큰 관련 작업(FE-01)은 [docs/frontend/fe-01-auth.md](docs/frontend/fe-01-auth.md)의 백엔드 API 계약과 결정 사항을 따른다.

Next.js App Router를 사용한다. `frontend/src/` 아래 `app/`(`(auth)`·`(main)`·`admin`), `features/`, `components/`, `hooks/`, `services/`, `lib/`, `providers/`, `types/`를 둔다. `frontend/.env`는 `API_SERVER_URL`(git 제외, `.env.example` 참고).

페이지 라우팅은 `app`에서 관리하되 실제 업무 기능과 UI 로직은 `features`로 분리한다.

**API 호출 함수는 `services/api/`에 모으고, 화면·훅은 `features/`에 둔다.** (혼합 방식)

```text
services/
├── api-client.ts     # 공통 통신 도구 (fetch, 토큰 첨부, 401 재발급, 에러 변환)
└── api/              # 엔드포인트 함수. 백엔드 컨트롤러와 1:1 (auth.ts ↔ auth.controller)
    ├── auth.ts
    ├── users.ts
    └── boards.ts     # 요청 타입(DTO 대응)도 같은 파일에 둔다
types/                # 여러 기능이 같이 쓰는 응답 타입 (예: user.ts의 CurrentUser)
features/
└── board/
    ├── components/   # 화면 (폼, 목록 등 그 기능 화면에서만 쓰는 UI)
    ├── hooks/        # useQuery·useMutation 훅 + queryKey → services/api/boards.ts 호출
    └── guards/       # 다른 레이아웃이 가져다 쓰는 접근 제어 컴포넌트 (예: features/auth/guards/)
```

- API 함수는 여러 화면이 같이 쓰고 백엔드 구조를 따르므로 한 곳에 모은다. 기능 폴더끼리 서로의 API를 import하지 않게 하기 위함이다.
- 화면·훅은 기능 단위로 작업하므로 `features/<기능>/`에 모은다.
- **조회(`useQuery`)는 처음부터 `features/<기능>/hooks/`에 훅으로 만든다.** queryKey를 기능별 객체(예: `postKeys.list(boardId, page)`)로 한 곳에서 관리해, 같은 데이터를 화면마다 다른 키로 캐시하거나 수정 후 `invalidateQueries`가 누락되는 일을 막는다.
- **변경(`useMutation`)은 한 화면에서만 쓰면 컴포넌트 안에 둔다.** 여러 화면에서 쓰거나 성공 후 목록 갱신(`invalidateQueries`)이 필요하면 queryKey와 같은 훅 파일로 옮긴다.
- 기능 폴더 안에서 **화면(components)과 접근 제어(guards)를 섞지 않는다.**
- 기준: **여러 기능이 쓰면 공용 위치**(`services/api/`, `types/`, `lib/` - 예: `lib/validation/user.ts` 회원 입력 규칙), **한 기능만 쓰면 그 기능 폴더**(예: `features/auth/safe-redirect.ts`).

페이지 파일에는 가능한 한 많은 업무 로직을 넣지 않는다.

---

# 13. Next.js 라우팅

Route Group: `(auth)` = 로그인·회원가입 별도 레이아웃, `(main)` = 로그인 이후 공통 레이아웃(헤더·사이드바), 관리자는 같은 앱의 `/admin` 하위. 실제 경로는 `frontend/src/app/` 폴더가 기준이고, 화면별 경로는 `docs/frontend/fe-*.md`에 있다. (예전 "예상 라우팅" 목록은 실제와 달라 삭제, 2026-11-10)

---

# 14. 공용 Shared Package

만들지 않는다(17장). Frontend와 Backend는 각자 `package.json`을 유지하고, 필요해지면 공용 Type·Schema 공유를 그때 검토한다.

---

# 15. 개발 우선순위

일정과 진행 상황은 `docs/Plan.md`(비공개)가 기준이다. (초기 순서 목록은 지금 일정과 달라 삭제, 2026-11-10)

---

# 16. 설계 원칙

코딩 에이전트가 코드를 생성하거나 수정할 때 다음 원칙을 따른다.

## Backend

- NestJS 공식적인 Module / Controller / Service 구조 유지
- 기능별 Domain Module 구조 사용
- Controller에 비즈니스 로직을 과도하게 작성하지 않음
- DTO + Validation 사용
- 공통 예외 처리 적극 활용
- 인증은 Guard 중심
- 권한 검사는 Decorator + Guard 조합 고려
- Prisma 접근 코드는 Service 계층 중심
- Transaction이 필요한 기능은 명확하게 구분
- REST API와 Socket.IO 책임 분리

## Frontend

- Next.js App Router 사용
- TypeScript 사용
- 페이지 컴포넌트에 과도한 로직 작성 금지
- 재사용 가능한 기능은 `features` 또는 `components`로 분리
- API 호출 로직 분리
- Server Component와 Client Component의 역할을 명확히 구분
- 불필요하게 모든 컴포넌트에 `"use client"`를 사용하지 않음

## Database

- SNS와 Intranet DB는 완전히 분리
- PostgreSQL은 `infra-db`에서 공용 관리하되, 메이저 버전별로 인스턴스 분리 (로컬 SNS: 17, Intranet: 18 / 운영은 RDS 18에 Intranet만, 3장)
- 프로젝트별 DB User 사용 (`sns_user`, `intranet_user`), 애플리케이션에서 슈퍼유저 사용 금지
- Prisma Migration으로 Intranet Schema 관리
- 운영 DB에 직접 수동 변경하는 방식은 지양

## Docker

- Frontend / Backend / PostgreSQL / Nginx 책임 분리
- Frontend와 Backend를 하나의 컨테이너에 합치지 않음
- 환경변수를 이미지에 하드코딩하지 않음
- Volume과 Source Code 역할 구분

---

# 17. 과설계 방지 원칙

이 프로젝트는 포트폴리오 프로젝트이므로 실제 대규모 엔터프라이즈 시스템처럼 지나치게 복잡하게 만들 필요는 없다.

초기 단계에서는 다음 요소를 도입하지 않는다.

- Kubernetes
- Microservice Architecture
- Kafka
- Redis Cluster
- CQRS
- Event Sourcing
- 복잡한 DDD Layer
- Turborepo
- 별도의 Shared Package

단, 실제 기능 요구상 필요해진 기술은 이후 추가할 수 있다.

핵심 목표는 다음과 같다.

```text
"설명이 가능한 구조 + 실제로 동작하는 기능 + 배포 가능한 결과물"
```

---

# 18. 에이전트 작업 방식

코딩 에이전트(Claude Code, Codex 등)는 이 문서를 프로젝트 기본 Context로 참고한다.

프론트엔드(`frontend/`) 작업은 이 문서와 함께 [docs/frontend_requirements.md](docs/frontend_requirements.md)를 반드시 먼저 읽는다. (12장 참고)

코드를 작성하기 전 기존 프로젝트 구조와 파일을 먼저 확인한다.

기존 구현을 무시하고 전체 구조를 임의로 재작성하지 않는다.

새 라이브러리 또는 구조를 도입해야 할 경우:

1. 현재 구조에서 필요한 이유
2. 다른 대안
3. 프로젝트 복잡도 증가 여부

를 먼저 판단한다.

대규모 변경이 필요한 경우 한 번에 전체를 수정하기보다 단계적으로 변경한다.

새 기능 구현 시 가능한 한 다음 순서를 따른다.

```text
1. 요구사항 확인
2. DB 모델
3. Backend API
4. API 동작 확인
5. Frontend 연동
6. 예외 처리
7. 테스트
8. 리팩터링
```

현재 프로젝트의 최우선 목표는 빠른 코드 생성이 아니라, 개발자가 직접 구조를 이해하고 면접에서 설명할 수 있는 수준으로 완성하는 것이다.

## 18.1 하네스 (자동 검증·가드)

상세는 [docs/harness.md](docs/harness.md). 확인 명령: `node harness/verify.mjs --quick`

- [R-VER-01] 응답을 끝내기 전에 Stop hook이 바뀐 패키지의 검증을 돌린다(backend `typecheck`, frontend `typecheck`·`lint:check`). 실패하면 고친다. 업무 결정을 물으려고 멈춘 상태면 고치지 말고 질문과 함께 알린다.
- [R-SEC-01] `.env`는 Edit·Write 도구로만 고친다(확인 창에서 사용자가 수락해야 수정됨, 셸 명령으로 쓰지 않음). lock 파일은 고치지 않는다. [R-DB-01] 이미 적용한 마이그레이션은 고치지 않고 새로 만든다(`--create-only`로 만든 적용 전 SQL은 사용자 확인 후 수정). [R-DB-02] `prisma migrate reset`·`db push`는 사용자가 실행한다. [R-GIT-01] `--no-verify`·강제 푸시를 쓰지 않는다. hook이 막으면 우회하지 말고 이유를 읽는다.
- [R-DOC-02] 문서의 링크와 저장소 경로는 실제로 있어야 한다. 아직 없는 파일은 그 줄이나 표 머리글에 "예정"을 붙인다(이력 문서 devlog·changelog는 검사 제외).
- 새 규칙을 만들면 태그를 붙이고 rules.json에 강제 수단과 함께 등록한다. 같은 실수가 두 번 나오면 규칙 후보로 제안한다(`/harness` skill).

---

# 19. 포트폴리오 문서화

프로젝트 결과물은 Notion 포트폴리오 페이지로 정리한다. Notion 구성, 공개 영역 작성 기준, 트러블슈팅 후보 표, 문서화 흐름은 `docs/portfolio.md`(비공개)에 있다. 일정·진행 상황은 `docs/Plan.md`(비공개).

- 의미 있는 설계 결정, 버그 수정, 고민한 대안(시행착오 포함)은 세션 마무리 시 [docs/devlog/](docs/devlog/README.md)(주 단위 파일)에 기록한다.
- 면접에서 설명할 가치가 있는 설계 결정이나 버그 수정이 생기면 docs/portfolio.md의 트러블슈팅 후보 표에 추가할지 제안한다.
- [R-PROC-02] 코드에서 확인되지 않는 내용은 지어내지 않는다.
- 저장소는 공개한다. 개인 일정·운영 계획은 `.gitignore` "비공개 문서" 목록에 두고, 공개 문서에서는 링크 대신 `경로`(비공개)로 적는다.
