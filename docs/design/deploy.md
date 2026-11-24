# 운영 환경 구성 (AWS EC2)

> AGENTS.md 4장에서 옮김 (2026-11-10). 원칙 요약은 AGENTS.md 4장, 배포 때 할 일 체크리스트는 `need_list.md`(비공개).

## 1. 노출 범위

외부에는 Nginx(80/443)만 노출하고, 애플리케이션과 DB는 `127.0.0.1` 또는 Docker 내부 네트워크로만 접근한다.
EC2 보안 그룹은 22 / 80 / 443만 연다.

```text
인터넷 → :443 Nginx ─┬ sns 도메인          → SNS 정적 파일 (vite build 결과물)
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

> **첫 배포에서는 위 그림의 PostgreSQL 컨테이너 두 개를 두지 않고, RDS 인스턴스 하나(PostgreSQL 18, Single-AZ, 비공개)에 `sns`·`intranet` DB를 함께 둔다**(2026-11-22 인트라넷만 RDS → 2026-11-24 SNS도 함께, 사용자 결정).
> - SNS는 17 → 18로 올린다(`pg_dump` 후 18에 복원, 화면 동작 확인). SNS는 학습용이라 면접 시연 화면만 동작하면 된다.
> - RDS는 인스턴스 단위로 과금하므로 DB를 하나 더 넣어도 인스턴스 비용은 그대로다(스토리지만 데이터만큼).
> - DB·계정 분리는 로컬과 같다: `sns`(owner `sns_user`), `intranet`(owner `intranet_user`), `REVOKE ALL ... FROM PUBLIC`. 한 DB에 계정만 둘로 나누지 않는다(두 앱의 마이그레이션이 같은 `public` 스키마에 섞인다).
> - RDS 보안 그룹은 EC2 보안 그룹에서 오는 5432만 허용한다.
> - 크레딧으로 덮이지 않는 청구가 처음 생긴 달에 EC2 Docker(PostgreSQL 18 컨테이너 하나)로 두 DB를 함께 옮긴다. 설정·이전 절차는 `need_list.md`(비공개) 1장.

운영 배포 시에는 하나의 `docker-compose.prod.yaml`에서 전체 서비스를 관리할 수 있다.

예상 서비스: `sns-backend`, `sns-frontend`, `intranet-backend`, `intranet-frontend`, `nginx` (DB는 RDS)

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

- SNS의 Vite dev 서버 프록시(`vite.config.ts`의 `/api`, `/public`, `/socket.io`)는 개발 전용이며 백엔드 포트(3101)를 가리킨다.
- SNS 프론트는 상대 경로(`/api`, `/socket.io`)로 요청하므로 운영 도메인이 생겨도 프론트 코드는 변경하지 않는다.
- 운영 도메인이 생기면 SNS 백엔드 `.env`의 `PROTOCOL`, `HOST`(응답 URL 생성용)를 운영 값으로 변경한다.
