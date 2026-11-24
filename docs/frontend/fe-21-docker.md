# FE-21 · 프론트엔드 Docker 이미지

> 작성: 2026-11-24 · 이미지·컨테이너·레이어 캐시·멀티 스테이지 같은 공통 개념과 "막혔을 때" 표는 [backend/docker.md](../backend/docker.md). 배포 방식 결정은 [deploy.md](../design/deploy.md) 2장.

## 1. 한 줄 요약

`next build`의 `standalone` 출력(실행에 필요한 파일만 모은 폴더)으로 arm64 이미지를 만든다. 인스턴스별 값이 없어 이미지 하나를 모든 인스턴스가 같이 쓴다.

```text
로컬 PC ── scripts/build-frontend.ps1 ──▶ ghcr.io/hyunw0517/intranet-frontend:<태그> ──▶ EC2: docker compose pull && up -d
```

## 2. 파일

| 파일 | 역할 |
|---|---|
| [frontend/next.config.ts](../../frontend/next.config.ts) | `output: "standalone"` |
| [frontend/Dockerfile](../../frontend/Dockerfile) | `build`(`npm ci` → `next build`) → `runtime`(standalone + `.next/static`) |
| [frontend/.dockerignore](../../frontend/.dockerignore) | `.env`·`node_modules`·`.next` 등을 컨텍스트에서 뺀다 |
| [scripts/build-frontend.ps1](../../scripts/build-frontend.ps1) | arm64 빌드 + `server.js`·정적 파일·`sharp` 확인, `-Push`면 GHCR에 올린다 |

## 3. 빌드하기

`intranet` 폴더에서 실행한다.

```powershell
.\scripts\build-frontend.ps1 v1.0.0          # 로컬에 빌드하고 확인만 (성공하면 마지막 줄 arm64 OK)
.\scripts\build-frontend.ps1 v1.0.0 -Push    # GHCR에 올리기 (docker login ghcr.io가 먼저 필요)
```

- 캐시가 없으면 약 7분(2026-11-24: `npm ci` 298초 + `next build` 140초). 화면 코드만 고치면 `npm ci`를 건너뛰고 `next build`만 다시 한다.
- 백엔드와 같은 태그로 함께 빌드한다(deploy.md 2장).

## 4. standalone 출력

- `next start`는 `node_modules` 전체가 필요하다. `output: "standalone"`이면 `next build`가 실제로 쓰는 파일만 추적해 `.next/standalone`(최소 `server.js` + 필요한 `node_modules` 일부)에 모은다. 그래서 백엔드의 `prod-deps` 단계가 없다.
- `.next/static`(JS·CSS 묶음)과 `public`은 standalone에 들어가지 않아 Dockerfile에서 따로 복사한다(설치된 Next 문서 `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`). 지금은 `public` 폴더가 없어서 `.next/static`만 복사한다. `public`이 생기면 Dockerfile의 주석 줄을 살린다.
- 실행은 `node server.js`. 포트는 `PORT`(3000), 받는 주소는 `HOSTNAME`이다.

## 5. 이 프로젝트에서 챙긴 것

| 항목 | 이유 |
|---|---|
| `HOSTNAME=0.0.0.0` | Docker는 `HOSTNAME`을 컨테이너 ID로 넣는다. `server.js`가 이 주소로 받으므로 고정하지 않으면 컨테이너 밖에서 접속되지 않을 수 있다 |
| `build` 단계도 **arm64**로 | standalone이 이미지 최적화(`next/image`)용 `sharp`를 함께 챙긴다. 백엔드처럼 PC(x86)에서 빌드했더니 `sharp-linux-x64` 바이너리가 arm64 이미지에 들어갔다. 지금은 `next/image`를 쓰지 않지만 나중에 쓸 수 있어 arm64에서 빌드한다(사용자 결정). 대신 에뮬레이션이라 느리다 |
| `--chown=node:node` | `node` 사용자로 실행하는데, 실행 중 `.next/cache`에 쓴다 |
| `API_SERVER_URL`은 넣지 않음 | `rewrites()`(`/api/*` → 백엔드)는 빌드 때 고정되지만 운영에서는 Nginx가 `/api`를 백엔드로 바로 보내 Next까지 오지 않는다. 빌드 결과에는 기본값(`http://localhost:3100`)이 들어가고 운영에서는 쓰이지 않는다 |
| `NEXT_TELEMETRY_DISABLED=1` | 빌드·실행 때 Next 사용 통계를 보내지 않는다 |

주의: 나중에 Server Component에서 백엔드를 직접 호출하거나 `NEXT_PUBLIC_*` 값을 쓰게 되면 인스턴스별 값이 생긴다. `NEXT_PUBLIC_*`은 빌드 때 고정되므로 그때는 이미지를 인스턴스별로 빌드해야 한다.

## 6. 로컬에서 확인하기

```powershell
docker run --rm --init --platform linux/arm64 --name intranet-frontend-test -p 3201:3000 ghcr.io/hyunw0517/intranet-frontend:local
# 다른 터미널에서
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3201/login   # 200
docker stop intranet-frontend-test
```

- 3201로 연결하는 이유: 개발 서버(3000)와 겹치지 않게.
- 이 상태에서는 화면만 뜨고 API(`/api/*`)는 동작하지 않는다. 빌드 결과의 rewrite 대상이 컨테이너 자신의 `localhost:3100`이기 때문이다. 화면과 API를 함께 확인하는 것은 Nginx까지 넣은 compose 단계에서 한다(예정).

2026-11-24 확인: arm64(에뮬레이션)로 `Ready`, `Network: http://0.0.0.0:3000`, `GET /`·`/login` 200, `require('sharp')` → `arm64`, 압축 크기 102MB, 실행 사용자 `node`.
