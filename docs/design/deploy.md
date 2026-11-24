# 운영 환경 구성 (AWS EC2)

> AGENTS.md 4장에서 옮김 (2026-11-10). 원칙 요약은 AGENTS.md 4장, 배포 때 할 일 체크리스트는 `need_list.md`(비공개).

## 1. 노출 범위

외부에는 Nginx(80/443)만 노출하고, 애플리케이션과 DB는 `127.0.0.1` 또는 Docker 내부 네트워크로만 접근한다.
EC2 보안 그룹은 22 / 80 / 443만 연다.

```text
인터넷 → :443 Nginx ─┬ (배포 보류) sns 도메인 → SNS 정적 파일 (vite build 결과물)
                     ├ sns 도메인/api      → SNS NestJS (3101, /api 접두사 제거)
                     ├ sns 도메인/socket.io → SNS NestJS (3101, WebSocket upgrade)
                     ├ intranet 도메인      → Next.js (3000)
                     └ intranet 도메인/api  → Intranet NestJS (3100)
```

## 2. 서버 안의 구성

```text
EC2
├── Nginx
├── PostgreSQL 17 (sns)
├── PostgreSQL 18 (intranet)
│
├── SNS
│   ├── Frontend Container
│   └── Backend Container
│
└── Intranet
    ├── Frontend Container
    └── Backend Container
```

> **첫 배포에서는 위 그림의 PostgreSQL 컨테이너 두 개와 SNS를 두지 않는다. DB는 RDS 인스턴스 하나(PostgreSQL 18, Single-AZ, 비공개)에 `intranet` DB를 둔다**(2026-11-22 인트라넷만 RDS → 11/24 오전 SNS도 함께 → 11/24 SNS는 배포에서 뺌, 사용자 결정).
> - SNS를 뺀 이유: 학습용이고 프론트엔드를 직접 설명하기 어려워, 면접관이 눌러 볼 공개 사이트로 두기에 맞지 않다. SNS를 올리려던 목적(한 서버에 서비스 여러 개, 서브도메인 라우팅, RDS 하나에 DB 여러 개)은 나중에 추가할 친구용 인트라넷 인스턴스가 대신한다(같은 이미지를 환경변수·DB만 바꿔 두 벌 실행). SNS는 로컬(PostgreSQL 17)과 GitHub 저장소로 남긴다.
> - RDS는 인스턴스 단위로 과금하므로 친구용 DB(`intranet_friends`)를 더 넣어도 인스턴스 비용은 그대로다(스토리지만 데이터만큼).
> - DB·계정 분리는 로컬과 같다: `intranet`(owner `intranet_user`), `REVOKE ALL ... FROM PUBLIC`. DB를 더 넣을 때도 한 DB에 계정만 나누지 않고 DB를 따로 만든다(마이그레이션이 같은 `public` 스키마에 섞인다).
> - RDS 보안 그룹은 EC2 보안 그룹에서 오는 5432만 허용한다.
> - 크레딧으로 덮이지 않는 청구가 처음 생긴 달에 EC2 Docker(PostgreSQL 18 컨테이너 하나)로 DB를 옮긴다. 설정·이전 절차는 `need_list.md`(비공개) 1장.

운영 배포 시에는 하나의 `docker-compose.prod.yaml`에서 전체 서비스를 관리할 수 있다.

예상 서비스: `intranet-backend`, `intranet-frontend`, `nginx` (DB는 RDS, SNS는 배포하지 않음)

### 이미지 빌드·배포 방식 (2026-11-24 결정, 11/25 빌드를 GitHub Actions로)

- 운영 서버에서 `git pull` 후 빌드하지 않는다(서버 메모리를 빌드가 차지하고, 서버에 소스·빌드 도구가 필요함). `linux/arm64` 이미지를 빌드해 레지스트리 **GHCR(GitHub Container Registry, 공개 이미지)**에 push하고, EC2는 `docker compose pull && docker compose up -d`만 한다. 서버에는 compose 파일·env 파일·Nginx 설정만 둔다.
- **빌드는 GitHub Actions가 한다**(2026-11-25 사용자 결정, 11/24에는 로컬 PC에서 `docker buildx`). `main`에 `v*` 태그를 push하면 워크플로(`.github/workflows/`, 예정)가 ARM 러너에서 빌드 → 이미지 확인(`bcrypt`·`sharp` 로드 등, 지금 `scripts/build-*.ps1`의 확인과 같음) → GHCR push를 한다. 이미지 태그는 git 태그 이름을 그대로 쓰고, GHCR 로그인은 워크플로의 `GITHUB_TOKEN`으로 한다.
  - 이유: ARM 러너는 에뮬레이션(QEMU)이 없어 느린 arm64 빌드와 크로스 빌드 문제를 피하고, 빌드 결과가 PC 상태(커밋하지 않은 파일, 로그인 토큰)와 무관해진다. 확인을 통과한 이미지만 올라간다(지금 스크립트는 `-Push`이면 확인을 건너뜀).
  - **서버 반영은 사람이 한다**: Actions 성공을 확인한 뒤 EC2에서 이미지 태그를 바꾸고 `pull && up -d`. Actions가 SSH로 EC2에 접속해 자동 배포하는 방식은 하지 않는다(SSH 키를 GitHub Secrets에 맡기고 22번 포트를 고정 IP가 없는 러너 쪽에도 열어야 함, 사용자 결정).
  - 순서: 첫 배포(1주차)는 지금 로컬 스크립트로 단계를 직접 해 보고, 워크플로는 2주차에 만든다(Claude 제안). `scripts/build-*.ps1`은 로컬에서 이미지를 시험할 때 쓰도록 남긴다.
  - 확인할 것: Actions가 처음 만든 GHCR 패키지는 비공개일 수 있어 공개로 바꿔야 서버가 로그인 없이 pull한다. ARM 러너가 공개 저장소에서 무료인지 적용 전에 확인한다.
- GHCR을 고른 이유: 공개 이미지는 저장·전송이 무료이고 서버에서 로그인 없이 pull한다(ECR은 GB당 과금, 크레딧 만료 후에도 계속). 저장소가 이미 공개라 새로 드러나는 코드는 없다. 대신 **이미지에 비밀값을 넣지 않는다**(`.dockerignore`에 `.env`·`uploads`, 빌드 인자로 비밀값 금지).
- 빌드 방법·Dockerfile 구조·막혔을 때 볼 표는 [docs/backend/docker.md](../backend/docker.md).
- 버전은 `main`의 태그(`v1.0.0` 등)로 표시하고 이미지 태그도 같게 붙인다. 되돌리기는 compose의 이미지 태그를 이전 버전으로 바꿔 다시 `up`. `release/` 브랜치는 두지 않는다(혼자 개발).
- EC2 서버 OS는 **Ubuntu Server LTS(arm64)**, 이미지 베이스는 공식 `node` 이미지의 Debian slim(배포판 코드명까지 태그 고정). 컨테이너는 서버 커널만 빌려 쓰므로 둘이 달라도 되고, 맞춰야 하는 것은 CPU 아키텍처(arm64)뿐이다. alpine(musl)은 `bcrypt`·`sharp` 네이티브 모듈 때문에 쓰지 않는다. `prisma` CLI는 마이그레이션 컨테이너가 같은 이미지로 `migrate deploy`를 실행하도록 dependencies에 둔다(2026-11-24).
- 로컬 PC가 x86이라 로컬 arm64 빌드는 에뮬레이션(QEMU)으로 느리다. 이 문제는 위의 GitHub Actions ARM 러너로 해결한다(11/25).
- 쿠버네티스는 쓰지 않는다(AGENTS.md 17장, 서버 1대에서 Compose와 차이가 없고 EKS는 제어부 비용이 따로 든다).
- 첫 배포는 **인트라넷 데모 한 벌**(SNS는 2026-11-24 제외). 친구용 인스턴스는 데모가 안정된 뒤 추가한다(실제 데이터라 초기화 스크립트·백업을 확인한 뒤에 받는다, `domain_allocation.md`(비공개)).

## 3. Frontend와 Backend를 다른 컨테이너로

같은 컨테이너로 합치지 않는다. 목적:

- 독립적인 빌드·재배포·재시작
- 로그 분리
- 장애 범위 분리
- 환경변수 분리

```bash
docker compose up -d --build intranet-frontend
docker compose up -d --build intranet-backend intranet-frontend
```

## 4. SNS 프로젝트 관련 메모

> 2026-11-24 SNS는 배포에서 뺐다(2장). 나중에 배포하게 되면 참고한다.

- SNS의 Vite dev 서버 프록시(`vite.config.ts`의 `/api`, `/public`, `/socket.io`)는 개발 전용이며 백엔드 포트(3101)를 가리킨다.
- SNS 프론트는 상대 경로(`/api`, `/socket.io`)로 요청하므로 운영 도메인이 생겨도 프론트 코드는 변경하지 않는다.
- 운영 도메인이 생기면 SNS 백엔드 `.env`의 `PROTOCOL`, `HOST`(응답 URL 생성용)를 운영 값으로 변경한다.
