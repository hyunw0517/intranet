import type { NextConfig } from "next";

// 브라우저는 NestJS를 직접 호출하지 않고 같은 출처의 /api/* 로 요청한다.
// /api/* → NestJS (접두사 /api 제거 후 전달, 운영에서는 Nginx가 같은 규칙으로 처리)
// 같은 출처이므로 CORS 설정이 필요 없고, NestJS가 내려주는 Set-Cookie(refresh token)도 그대로 저장된다.
const apiServerUrl = process.env.API_SERVER_URL ?? "http://localhost:3100";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiServerUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
