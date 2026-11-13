import type { NextConfig } from "next";

// 브라우저는 NestJS를 직접 호출하지 않고 같은 출처의 /api/* 로 요청한다.
// /api/* → NestJS (접두사 /api 제거 후 전달, 운영에서는 Nginx가 같은 규칙으로 처리)
// 같은 출처이므로 CORS 설정이 필요 없고, NestJS가 내려주는 Set-Cookie(refresh token)도 그대로 저장된다.
const apiServerUrl = process.env.API_SERVER_URL ?? "http://localhost:3100";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // 채팅 소켓 (Socket.IO). 서버 주소는 끝 슬래시가 있어야 하는데(/socket.io/), Next는 끝 슬래시 주소를 308로 지운다.
      // 클라이언트가 슬래시 없이 보내고(services/chat-socket.ts) 여기서 붙인다. 쿼리(?EIO=4&transport=...)는 그대로 전달된다.
      {
        source: "/api/socket.io",
        destination: `${apiServerUrl}/socket.io/`,
      },
      {
        source: "/api/:path*",
        destination: `${apiServerUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
