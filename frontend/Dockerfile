# 인트라넷 프론트엔드 이미지 (docs/frontend/fe-21-docker.md, 공통 개념은 docs/backend/docker.md)
# 빌드: scripts/build-frontend.ps1 <태그> [-Push]
# 인스턴스별 값이 없어 이미지 하나를 모든 인스턴스가 같이 쓴다(운영의 /api는 Nginx가 백엔드로 바로 보냄).

# ── 1단계 build: next build → .next/standalone ──
# 백엔드와 달리 대상 플랫폼(arm64)에서 돌린다: standalone이 이미지 최적화(next/image)용 sharp를 함께 챙기는데,
# PC(x86)에서 빌드하면 sharp-linux-x64 바이너리가 arm64 이미지에 들어갔다(2026-11-24 확인). 에뮬레이션이라 느리다.
FROM node:26-trixie-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 의존성 목록이 그대로면 npm ci를 다시 하지 않는다(레이어 캐시).
COPY package.json package-lock.json ./
RUN npm ci

# 설정 파일(next.config.ts, tsconfig, postcss 등)과 src. 빼야 할 것은 .dockerignore가 거른다.
COPY . .
RUN npm run build

# ── 2단계 runtime: standalone 결과물 + 정적 파일만 ──
FROM node:26-trixie-slim AS runtime
WORKDIR /app
# HOSTNAME: Docker는 이 값을 컨테이너 ID로 넣는다. server.js가 이 주소로 받으므로 모든 인터페이스(0.0.0.0)로 고정한다.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# node 사용자 소유로 복사한다(실행 중 .next/cache에 쓴다).
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# public 폴더가 생기면 여기에 추가: COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
