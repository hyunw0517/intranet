import type { Response } from "express";

//* Refresh 토큰 유효시간 (초)
//  - JWT 만료(expiresIn)와 쿠키 만료(maxAge)에 같은 값을 쓴다.
export const REFRESH_TOKEN_EXPIRES_IN = 60 * 60 * 24; // 1일 (초)

//* Refresh 토큰 쿠키 옵션
//  - 쿠키를 등록하지는 않고 옵션 객체만 반환한다. (등록은 컨트롤러의 res.cookie)
//  - 등록과 삭제에 같은 옵션을 써야 하므로 한 곳에서 관리한다.
export const refreshTokenCookieOptions = () => ({
  httpOnly: true,                                // JS(document.cookie)에서 읽을 수 없음 -> XSS로 탈취 방지
  path: '/api/auth',                             // 인증 라우트 요청에만 브라우저가 쿠키를 보냄
  sameSite: 'lax' as const,                      // 다른 사이트에서 보내는 POST 요청에는 쿠키를 보내지 않음 (CSRF 완화)
  secure: process.env.PROTOCOL === 'https',      // https일 때만 켬 (로컬 http 개발 환경 고려)
  maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000,       // 쿠키 만료 (ms 단위)
});

//* Refresh 토큰 쿠키 삭제 (로그아웃, 회원 탈퇴)
//  - 저장할 때와 path 등이 같아야 지워진다. (maxAge는 clearCookie에서 쓰지 않음)
export const clearRefreshTokenCookie = (res: Response) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { maxAge, ...options } = refreshTokenCookieOptions();

  res.clearCookie('refreshToken', options);
  
};
