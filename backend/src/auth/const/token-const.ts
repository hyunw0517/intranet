//* 토큰·세션 시간 정책 (단위: 초)
//  - 한 곳에 모아 두어 문서(docs/backend/jwt-auth.md)와 값을 맞추기 쉽게 한다.

// Access Token 유효시간 - 짧게 두고 stateless로 검증한다. (요청마다 세션 DB를 보지 않음)
export const ACCESS_TOKEN_EXPIRES_IN = 60 * 10; // 10분

// Refresh Token 유효시간 (유휴 만료) - 재발급할 때마다 새 토큰으로 교체되므로,
// 이 시간 동안 한 번도 재발급하지 않으면 로그인이 풀린다.
export const REFRESH_TOKEN_EXPIRES_IN = 60 * 60 * 24; // 1일

// 세션 절대 만료 - 재발급을 계속해도 로그인 후 이 시간이 지나면 다시 로그인해야 한다.
// (rotation으로 refresh token이 계속 연장되는 것을 막는 상한)
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7일

// 재사용 감지 유예 시간 - refresh token을 교체한 직후 이 시간 안에 들어온 "직전 토큰"은
// 탈취가 아니라 다른 탭의 동시 재발급 요청으로 보고 허용한다.
// 길수록 탭·네트워크 지연에 관대하지만, 그만큼 직전 토큰을 가진 공격자도 통과하는 시간이 길어진다.
export const REFRESH_REUSE_GRACE = 60; // 1분
