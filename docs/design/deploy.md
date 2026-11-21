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

운영 배포 시에는 하나의 `docker-compose.prod.yaml`에서 전체 서비스를 관리할 수 있다.

예상 서비스: `postgres17`, `postgres18`, `sns-backend`, `sns-frontend`, `intranet-backend`, `intranet-frontend`, `nginx`

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
