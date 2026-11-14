import { AdminPermission, UserRole } from 'src/generated/prisma/client';

export type TokenType = 'access' | 'refresh';

//* JWT payload (서명 범위에 포함되므로 위조할 수 없지만, 암호화되지 않으므로 누구나 읽을 수 있다)
export interface JwtPayload {
  sub: number;      // 회원 id
  empNo: string;    // 사번
  type: TokenType;  // 토큰 종류 - 가드가 용도에 맞는 토큰인지 확인한다
  ver: number;      // 발급 당시 Users.tokenVersion - 재발급 때 DB 값과 다르면 무효
  role?: UserRole;  // 발급 당시 권한 (access만) - access 검증은 DB를 보지 않으므로 RolesGuard가 이 값을 쓴다
  perms?: AdminPermission[]; // 발급 당시 관리자 기능 (access만, ADMIN만 값이 있음) - RolesGuard·서비스 분기가 쓴다
  sid?: string;     // 세션 id (AuthSession.id) - access·refresh 공통
  jti?: string;     // refresh token 고유 id - AuthSession.currentJti와 비교 (refresh만)
  iat: number;      // 발급 시각 (라이브러리가 자동으로 넣음)
  exp: number;      // 만료 시각 (expiresIn으로 계산)
}

//* access token만으로 만든 요청 사용자 (req.user) - DB 조회 없이 payload에서 채운다.
//  - 컨트롤러는 @User()로 id·role·adminPermissions·tokenVersion만 쓴다. 그 외 회원 정보가 필요하면 서비스가 DB에서 조회한다.
export interface TokenUserPayload {
  id: number;
  empNo: string;
  role: UserRole;
  adminPermissions: AdminPermission[]; // ADMIN의 관리자 기능 (그 외 권한은 빈 배열)
  tokenVersion: number;
}
