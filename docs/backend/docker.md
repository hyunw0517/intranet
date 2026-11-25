# 백엔드 Docker 이미지

> 작성: 2026-11-24 · 배포 방식 결정은 [deploy.md](../design/deploy.md) 2장. 이 문서는 "어떻게 빌드하고, 막히면 무엇을 보나"를 적는다.

## 1. 한 줄 요약

로컬 PC(x86)에서 서버(EC2 t4g, arm64)용 이미지를 만들어 GHCR에 올리고, 서버는 받아서 실행만 한다. 이미지 하나를 백엔드와 마이그레이션 컨테이너가 함께 쓴다.

```text
로컬 PC ── scripts/build-backend.ps1 ──▶ ghcr.io/hyunw0517/intranet-backend:<태그> ──▶ EC2: docker compose pull && up -d
```

## 2. 파일

| 파일 | 역할 |
|---|---|
| [backend/Dockerfile](../../backend/Dockerfile) | 멀티 스테이지 빌드 (build → prod-deps → runtime) |
| [backend/.dockerignore](../../backend/.dockerignore) | 빌드 컨텍스트에서 `.env`·`node_modules`·`dist` 등을 뺀다 |
| [scripts/build-backend.ps1](../../scripts/build-backend.ps1) | arm64 빌드 + 네이티브 모듈 확인, `-Push`면 GHCR에 올린다 |

## 3. 빌드하기

`intranet` 폴더에서 실행한다.

```powershell
.\scripts\build-backend.ps1 v1.0.0          # 로컬에 빌드하고 확인만
.\scripts\build-backend.ps1 v1.0.0 -Push    # GHCR에 올리기 (docker login ghcr.io가 먼저 필요)
```

- 성공하면 마지막 줄이 `arm64 OK`(로컬) 또는 `올림: ...`(`-Push`)다.
- 코드만 고친 빌드는 `npm ci`·`prisma generate`가 `CACHED`로 건너뛰어 빠르다. `package*.json`을 바꾸면 `npm ci`부터, `prisma/`를 바꾸면 `prisma generate`부터 다시 한다(레이어 캐시, 4장).
- 태그는 `main`의 git 태그와 같게 붙인다(deploy.md 2장).

## 4. Dockerfile 구조

| 단계 | 플랫폼 | 하는 일 | 최종 이미지에 남나 |
|---|---|---|---|
| `build` | **빌드하는 PC**(`$BUILDPLATFORM`) | `npm ci`(개발용 포함) → `prisma generate` → `nest build` | `dist/`만 옮김 |
| `prod-deps` | **arm64** | `npm ci --omit=dev` (bcrypt·sharp는 CPU별 바이너리) | `node_modules`만 옮김 |
| `runtime` | **arm64** | `dist` + `node_modules` + `prisma/`(마이그레이션) + `prisma.config.ts`, `USER node` | 이것이 최종 이미지 |

- `build`의 결과물(JS, Prisma 생성 코드)은 CPU와 무관해서 PC에서 돌린다. 에뮬레이션이 없어 빠르고, 5장의 Prisma 오류도 피한다.
- 자주 바뀌는 것을 아래에 둔다: `package*.json` → `prisma/` → `src/` 순서로 복사한다.
- `prisma` CLI는 dependencies에 있다(마이그레이션 컨테이너가 같은 이미지로 `prisma migrate deploy`를 실행, [docker-compose.prod.yaml](../../docker-compose.prod.yaml) `intranet-migrate`).
- 베이스 `node:26-trixie-slim`에는 `curl`이 없다. healthcheck는 `node`로 쓴다.

## 5. 막혔을 때 (2026-11-24에 실제로 만난 것)

| 증상 | 원인 | 해결 |
|---|---|---|
| 컨테이너 시작 시 `Cannot find module './internal/class.ts'` | `prisma generate`가 import 확장자를 tsconfig로 추측하는데, Docker에서는 generate 시점에 tsconfig가 없어 `.ts`로 생성됨 | `schema.prisma` generator에 `importFileExtension = "js"` 고정 |
| arm64 빌드의 `prisma generate`에서 `unknown fields: , .` 검증 오류 수백 개 | x86 PC에서 arm64를 에뮬레이션(QEMU)하면 스키마 검증(WebAssembly)이 필드 이름을 빈 문자열로 읽음. 같은 스키마가 amd64에서는 통과 | `build` 단계를 `FROM --platform=$BUILDPLATFORM`으로 |
| 빌드는 성공했는데 화면이 빨간 오류로 가득 | Docker는 빌드 로그를 stderr로 낸다. Windows PowerShell 5.1에서 `2>&1`로 합치면 줄마다 오류로 감싼다 | `2>&1`을 붙이지 않는다. 진짜 실패는 `ERROR: failed to build`·`exit code` 문구로 판단 |
| `--env-file`로 실행하자 DB 연결 실패 | `docker run --env-file`은 따옴표를 벗기지 않아 값에 `"`가 들어감 | Docker용 env 파일은 따옴표 없이 쓴다 |
| 컨테이너에서 `localhost:5433` DB에 못 붙음 | 컨테이너 안의 `localhost`는 컨테이너 자신 | `--network infra-db-net` + `infra-postgres18:5432` (운영은 RDS 주소) |
| `Ctrl+C`·`docker stop`으로 바로 안 멈추고 10초 뒤 강제 종료 | Node가 PID 1로 실행되면 처리기 없는 SIGINT·SIGTERM을 무시. Docker는 10초 뒤 SIGKILL | `docker run --init` / compose `init: true` |
| 업로드 실패(로컬 저장소) | `UPLOAD_ROOT`가 없으면 `../uploads` = 컨테이너의 `/uploads`인데 `node` 사용자는 `/`에 쓸 수 없음 | env에 `UPLOAD_ROOT`를 주고 볼륨 연결 (S3 전환 전까지) |
| 로컬 compose 시험에서 로그인은 되는데 조회 API가 500, 로그에 `PrismaClientUnknownRequestError`·`memory access out of bounds` (2026-11-25) | arm64 이미지를 PC(x86)에서 에뮬레이션(QEMU)으로 돌리면 Prisma 7의 쿼리 엔진(WASM)이 깨진다(빌드 단계 `prisma generate` 실패와 같은 계열). 같은 코드의 x86 이미지는 같은 API가 200 | 로컬 시험의 백엔드는 x86 이미지(`:local-amd64`)로. 실제 ARM 서버는 에뮬레이션이 없어 해당 없음(서버에서 확인 예정) |

## 6. 로컬에서 이미지 확인하기

이미지 안 보기 (`.env`·`src`가 없어야 한다):

```powershell
docker run --rm ghcr.io/hyunw0517/intranet-backend:local sh -c "whoami; ls -a /app"
```

운영 compose로 로컬 DB에 붙여 실행 (2026-11-25부터, `docker run --env-file`로 하던 방법을 대신함):

- [docker-compose.prod.yaml](../../docker-compose.prod.yaml)(운영)에 [docker-compose.local.yaml](../../docker-compose.local.yaml)(로컬에서만 다른 점: 로컬 이미지, `infra-db-net` 네트워크, nginx `127.0.0.1:8080`·백엔드 `127.0.0.1:3200` 포트)을 덧붙인다.
- 백엔드는 **x86 이미지**로 시험한다(5장 표 마지막 줄: arm64 에뮬레이션에서는 조회가 500). 스크립트의 arm64 `:local`과 섞이지 않게 태그를 따로 붙인다. 프론트는 스크립트로 만든 arm64 `:local`을 그대로 쓴다.

```powershell
docker buildx build --platform linux/amd64 -t ghcr.io/hyunw0517/intranet-backend:local-amd64 --load backend
```
- env 파일은 `intranet/env/intranet.backend.env`(git 제외). `.env`를 복사해 DB 호스트를 `infra-postgres18:5432`로 바꾼다. `UPLOAD_ROOT`·`TZ`는 compose가 정한다.

```powershell
docker compose -f docker-compose.prod.yaml -f docker-compose.local.yaml up -d
docker compose -f docker-compose.prod.yaml -f docker-compose.local.yaml ps -a              # migrate Exited (0), backend healthy
docker compose -f docker-compose.prod.yaml -f docker-compose.local.yaml logs intranet-migrate
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3200/                                  # 200 (백엔드 직접)
# 브라우저 http://localhost:8080 : nginx를 거쳐 화면·로그인·조회·채팅 확인
docker compose -f docker-compose.prod.yaml -f docker-compose.local.yaml down
```

- 3200으로 연결하는 이유: 개발 서버(3100)와 겹치지 않게.
- 컨테이너에는 `/api` 접두사가 없다(Nginx·Next.js가 떼고 넘김). Swagger는 `http://localhost:3200/docs`.
- `down`은 이 compose가 만든 컨테이너·네트워크만 지운다. `infra-db-net`은 `external`이라 그대로 둔다.
- 2026-11-25 확인: migrate `No pending migrations to apply.` 후 backend 시작, 약 20초 뒤 `healthy`, `GET /` 200, 시각 KST, `/app/uploads`에 `node` 사용자로 쓰기 가능.

## 7. 남은 것

- 프론트엔드·nginx 서비스 추가 (compose 다음 단계)
- 서버 첫 실행 전 `uploads` 폴더 소유자를 uid 1000으로 (로컬 Windows는 권한 제한이 없어 확인되지 않음)
- `X-Powered-By: Express` 헤더 제거
- 결정 필요: env 필수 키 시작 검증(`ConfigModule` `validate`), `app.enableShutdownHooks()`
- 서버에서 확인: arm64에서 `prisma migrate deploy`(generate와 다른 엔진)
