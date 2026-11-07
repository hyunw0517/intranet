export type TokenType = 'access' | 'refresh';

//* JWT payload (서명 범위에 포함되므로 위조할 수 없지만, 암호화되지 않으므로 누구나 읽을 수 있다)
export interface JwtPayload {
  sub: number;      // 회원 id
  empNo: string;    // 사번
  type: TokenType;  // 토큰 종류 - 가드가 용도에 맞는 토큰인지 확인한다
  ver: number;      // 발급 당시 Users.tokenVersion - DB 값과 다르면 무효
  sid?: string;     // 세션 id (AuthSession.id) - access·refresh 공통
  jti?: string;     // refresh token 고유 id - AuthSession.currentJti와 비교 (refresh만)
  iat: number;      // 발급 시각 (라이브러리가 자동으로 넣음)
  exp: number;      // 만료 시각 (expiresIn으로 계산)
}
