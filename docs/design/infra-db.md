# infra-db 운영 상세 (PostgreSQL)

> [AGENTS.md](../../AGENTS.md) 3장(PostgreSQL 구성 원칙)의 상세. DB 초기화·계정 추가·이관 작업 시 참고한다.

## 1. 폴더 구성

`D:\VScode_Workspace\portfolio\infra-db\` (이 저장소 밖, AGENTS.md 2장에서 옮김 2026-11-21)

```text
infra-db\
├── docker-compose.yaml           # postgres17 / postgres18 서비스
├── .env                          # git 제외
├── .env.example
├── .gitignore / .gitattributes   # .sh 파일은 LF 강제
├── init\
│   └── 01-create-project-dbs.sh  # 프로젝트 DB/계정 생성 (멱등)
├── scripts\
│   └── migrate-sns.sh            # 1회성 SNS 데이터 이관 (완료)
├── postgres17-data\              # git 제외
└── postgres18-data\              # git 제외
```

## 2. 환경변수

`infra-db/.env`는 PostgreSQL 컨테이너 실행과 초기화(프로젝트 DB/계정 생성)를 위한 환경변수만 관리한다.

예:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=...

PG17_PORT=5432  # sns
PG18_PORT=5433  # intranet

# 규칙: DB 이름 = <name>, 계정 = <name>_user, 비밀번호 = <NAME>_DB_PASSWORD
SNS_DATABASES=sns
INTRANET_DATABASES="intranet intranet_test"   # intranet_test: e2e 테스트 전용
SNS_DB_PASSWORD='...'
INTRANET_DB_PASSWORD='...'
INTRANET_TEST_DB_PASSWORD='...'
```

프로젝트 DB/계정 생성:

- `init/01-create-project-dbs.sh`는 데이터 폴더가 비어 있는 최초 기동 시에만 자동 실행된다.
- 이미 초기화된 인스턴스에 DB를 추가하거나 비밀번호를 변경할 때는 수동 실행한다. (멱등)

```bash
docker compose exec postgres18 bash /docker-entrypoint-initdb.d/01-create-project-dbs.sh
```

- Git Bash에서는 컨테이너 경로가 Windows 경로로 바뀌므로 앞에 `MSYS_NO_PATHCONV=1`을 붙인다.
- compose `environment`에 새 비밀번호 변수를 추가하고 컨테이너를 다시 만들지 않았다면, 값을 `-e`로 넘겨 실행한다. (2026-11-09 `intranet_test` 추가 시 사용)
  `docker compose exec -e PROJECT_DATABASES=intranet_test -e INTRANET_TEST_DB_PASSWORD='...' postgres18 bash /docker-entrypoint-initdb.d/01-create-project-dbs.sh`

테스트 DB `intranet_test` (2026-11-09): e2e 테스트(`npm run test:e2e`) 전용. 계정은 규칙대로 `intranet_test_user`라 개발 DB `intranet`에 접속할 수 없다(테스트의 TRUNCATE가 개발 DB에 닿지 않음). 백엔드 연결은 `backend/.env.test`, 구조는 docs/backend/testing.md.

- Windows Git Bash에서는 컨테이너 경로가 변환되므로 `MSYS_NO_PATHCONV=1`을 붙이거나 PowerShell에서 실행한다.
- PostgreSQL 18 이미지는 데이터 볼륨 마운트 위치가 `/var/lib/postgresql`이다. (17 이하는 `/var/lib/postgresql/data`)

기존 SNS 데이터 이관 (완료):

- 기존 `NestJS_SNS/postgres-data`를 `infra-db/postgres17-data`로 이동
- 기존 `postgres` DB의 데이터를 `sns` DB로 덤프/복원 (`scripts/migrate-sns.sh`)
- 원본 `postgres` DB의 테이블은 정상 동작 확인 후 정리

주의:

기존 SNS 프로젝트에서 사용하던 아래 형태는 애플리케이션 DB 접속 정보와 PostgreSQL 초기화 정보를 같이 사용했던 구조다.

```yaml
environment:
  POSTGRES_USER: ${DB_USERNAME}
  POSTGRES_PASSWORD: ${DB_PASSWORD}
  POSTGRES_DB: ${DB_DATABASE}
```

공용 PostgreSQL 구조로 변경한 이후에는 인프라 환경변수와 애플리케이션 DB 접속 정보를 분리한다.


---

## 애플리케이션 `.env` 예시와 비밀번호 주의 (AGENTS.md 3장에서 옮김, 2026-11-10)

애플리케이션별 `.env`는 분리한다.

```env
# NestJS_SNS (TypeORM)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=sns_user
DB_PASSWORD='...'
DB_DATABASE=sns
```

```env
# intranet (Prisma)
DATABASE_URL="postgresql://intranet_user:<URL 인코딩된 비밀번호>@localhost:5433/intranet"
```

비밀번호 주의사항:

- 비밀번호에 `$`, `#` 등 특수문자가 포함되므로 `.env`에서는 작은따옴표로 감싼다.
  - docker compose는 `$`를 변수 치환으로 해석한다.
  - dotenv는 따옴표 없는 값에서 `#` 이후를 주석으로 잘라낸다.
- Prisma의 `DATABASE_URL`은 URL이므로 비밀번호를 퍼센트 인코딩한다.
  - `@` → `%40`, `#` → `%23`, `$` → `%24`, `!` → `%21`
