import { AdminPermission, UserRole } from 'src/generated/prisma/client';

export type TokenType = 'access' | 'refresh';

//* JWT payload (서명 범위에 포함되므로 위조할 수 없지만, 암호화되지 않으므로 누구나 읽을 수 있다)
export interface JwtPayload {
  sub: number;      // 회원 id
  empNo: string;    // 사번
  type: TokenType;
  ver: number;      // 발급 당시 tokenVersion (재발급 때 DB 값과 비교)
  role?: UserRole;  // access만. RolesGuard가 이 값으로 판단한다
  perms?: AdminPermission[]; // access만, ADMIN만 값이 있음
  sid?: string;     // AuthSession.id
  jti?: string;     // refresh만. AuthSession.currentJti와 비교
  iat: number;
  exp: number;
}

//* access token으로 만든 요청 사용자 (req.user)
// 이 밖의 회원 정보가 필요하면 서비스가 DB에서 읽는다.
export interface TokenUserPayload {
  id: number;
  empNo: string;
  role: UserRole;
  adminPermissions: AdminPermission[]; // ADMIN이 아니면 빈 배열
  tokenVersion: number;
}
