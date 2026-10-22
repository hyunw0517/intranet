export const REFRESH_TOKEN_EXPIRES_IN = 60 * 60 * 24; // 1일 (초)

export const refreshTokenCookieOptions = () => ({
  httpOnly: true,
  path: '/api/auth',
  sameSite: 'lax' as const,
  secure: process.env.PROTOCOL === 'https',
  maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000,
});