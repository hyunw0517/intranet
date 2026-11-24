# 인트라넷 백엔드 이미지 (docs/design/deploy.md 2장)
# 빌드: docker buildx build --platform linux/arm64 -t ghcr.io/<계정>/intranet-backend:<태그> backend
# 같은 이미지를 백엔드(node dist/main)와 마이그레이션(npx prisma migrate deploy) 컨테이너가 함께 쓴다.

# ── 1단계 build: 개발용 패키지까지 설치해 Prisma 클라이언트 생성 + nest build ──
# 결과물(dist의 JS, Prisma 생성 코드)은 CPU와 무관하므로 빌드하는 PC의 플랫폼($BUILDPLATFORM)에서 돌린다.
# x86 PC에서 arm64를 에뮬레이션(QEMU)으로 돌리면 prisma generate의 스키마 검증(WebAssembly)이 필드 이름을
# 빈 문자열로 읽어 실패했다(2026-11-24). 에뮬레이션이 없으니 빌드도 빨라진다.
FROM --platform=$BUILDPLATFORM node:26-trixie-slim AS build
WORKDIR /app

# 자주 바뀌지 않는 것부터 복사한다(레이어 캐시). package*.json이 그대로면 npm ci를 다시 하지 않는다.
COPY package.json package-lock.json ./
RUN npm ci

# 스키마가 그대로면 generate를 다시 하지 않는다. 결과는 src/generated/prisma (git·.dockerignore 제외 → 여기서 새로 만든다)
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

# 소스는 가장 자주 바뀌므로 마지막에 복사한다.
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ── 2단계 prod-deps: 운영용 node_modules만 (jest·eslint·@nestjs/cli 등 제외) ──
# bcrypt·sharp 바이너리가 CPU마다 다르므로 이 단계는 대상 플랫폼(--platform linux/arm64)으로 설치한다.
FROM node:26-trixie-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── 3단계 runtime: 최종 이미지. 앞 단계에서 결과물만 가져온다 ──
FROM node:26-trixie-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# 마이그레이션 컨테이너가 쓰는 파일 (migrate deploy가 prisma/migrations를 적용한다)
COPY package.json prisma.config.ts ./
COPY prisma ./prisma

# root가 아니라 베이스 이미지의 node 사용자(uid 1000)로 실행한다.
USER node

# 문서용 표시일 뿐 포트를 열지는 않는다. 실제 포트는 env의 PORT (AGENTS.md 4장: 3100)
EXPOSE 3100
CMD ["node", "dist/main"]
