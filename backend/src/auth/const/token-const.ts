//* 토큰·세션 시간 (단위: 초, docs/backend/jwt-auth.md와 맞춘다)

// Access Token 유효시간 - DB를 보지 않고 검증하므로 짧게 둔다
export const ACCESS_TOKEN_EXPIRES_IN = 60 * 10; // 10분

// Refresh Token 유효시간 (유휴 만료) - 이 시간 동안 재발급이 없으면 로그인이 풀린다
export const REFRESH_TOKEN_EXPIRES_IN = 60 * 60 * 24; // 1일

// 세션 절대 만료 - rotation으로 로그인이 끝없이 연장되지 않게 막는 상한
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7일

// 재사용 감지 유예 - 교체 직후 들어온 직전 토큰은 다른 탭의 동시 재발급으로 보고 허용한다.
// 길게 잡을수록 직전 토큰을 가진 공격자도 그만큼 통과한다.
export const REFRESH_REUSE_GRACE = 60; // 1분
