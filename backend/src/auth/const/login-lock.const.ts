//* 로그인 실패 잠금 (LoginHistoryService)

// 연속 실패 몇 회마다 잠글지
export const LOGIN_MAX_FAILS = 5;

// 단계별 잠금 시간(분): 1단계 10분, 2단계 30분, 3단계 이상 1시간 (마지막 값이 최대)
export const LOGIN_LOCK_MINUTES = [ 10, 30, 60 ] as const;

// LoginHistory.empNo 컬럼 길이 (VarChar(50))
export const LOGIN_EMPNO_MAX_LENGTH = 50;

// 사번·비밀번호 오류 공통 메시지 (어느 쪽이 틀렸는지 알려 주지 않는다 - 등록된 사번 노출 방지)
export const LOGIN_FAILED_MESSAGE = '사번 또는 비밀번호가 올바르지 않습니다.';

//* IP 기준 요청 수 제한 (ThrottlerGuard - 로그인·가입에만 적용)
// 같은 IP에서 1분에 10회까지. 넘으면 429 (비밀번호 확인 전에 거부하므로 감사 로그도 남지 않는다)
export const AUTH_THROTTLE_TTL_MS = 60 * 1000;
export const AUTH_THROTTLE_LIMIT = 10;
