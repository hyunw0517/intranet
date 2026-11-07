import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthSession, Users } from 'src/generated/prisma/client';
import { JwtPayload } from './types/jwt-payload.type';
import { REFRESH_REUSE_GRACE, REFRESH_TOKEN_EXPIRES_IN, SESSION_MAX_AGE } from './const/token-const';

//* 토큰 발급에 필요한 세션 정보
export type SessionForToken = Pick<AuthSession, 'id' | 'currentJti' | 'expiresAt'>;

const SESSION_FOR_TOKEN_SELECT = {
  id: true,
  currentJti: true,
  expiresAt: true,
} as const;

type SessionUser = Pick<Users, 'id' | 'tokenVersion'>;

/**
 * *[로그인 세션 관리] - refresh token을 서버에서 폐기·교체하기 위한 테이블
 *
 * - 로그인 1번 = 세션 1개 (기기·브라우저별)
 * - refresh token payload: sid(세션 id) + jti(이 토큰의 고유 id)
 * - 재발급할 때마다 jti를 새 값으로 바꾼다 (rotation)
 * - 이미 바뀐 jti가 다시 들어오면 = 누군가 옛 토큰을 복사해 갖고 있다 → 세션 폐기 (재사용 감지)
 *
 * access token은 이 테이블을 보지 않는다. (요청마다 DB 조회를 하지 않기 위해 stateless 유지)
 */
@Injectable()
export class AuthSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  //* 세션 생성 (로그인, 가입)
  //  - 만들기 전에 그 사용자의 끝난 세션을 지운다. (스케줄러 없이 테이블이 계속 쌓이지 않게)
  async createSession(user: SessionUser, userAgent?: string): Promise<SessionForToken> {
    await this.deleteDeadSessions(user);

    return this.prisma.authSession.create({
      data: {
        userId: user.id,
        tokenVersion: user.tokenVersion,
        currentJti: randomUUID(),
        userAgent: userAgent?.slice(0, 500) || null,
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000),
      },
      select: SESSION_FOR_TOKEN_SELECT,
    });
  }

  //* 세션 교체 (refresh token으로 재발급할 때)
  //  - 가드가 서명·만료·type·tokenVersion·회원 상태를 이미 확인한 뒤 호출된다.
  //  - 결과는 세 가지 중 하나다.
  //    ① jti === currentJti                  → 정상. 새 jti로 교체
  //    ② jti === previousJti, 교체 후 유예 시간(1분) 이내 → 다른 탭이 방금 교체함. 교체하지 않고 현재 jti로 발급
  //    ③ 그 외 (더 오래된 jti)                  → 재사용 감지. 세션 폐기 후 401
  async rotateSession(payload: JwtPayload, user: SessionUser): Promise<SessionForToken> {
    if( !payload.sid || !payload.jti ){
      // 세션 도입 전에 발급된 토큰
      throw new UnauthorizedException('로그인 정보가 만료되었습니다. 다시 로그인해 주세요.');
    }

    // 두 요청이 동시에 ①에 들어오면 한쪽은 교체에 실패한다(count 0).
    // 그때는 세션을 다시 읽으면 ②(방금 교체됨)에 해당하므로 한 번 더 판단한다.
    for( let attempt = 0; attempt < 2; attempt++ ){
      const session = await this.findUsableSession(payload.sid, user);
      const now = new Date();

      // ① 정상 교체
      if( payload.jti === session.currentJti ){
        const newJti = randomUUID();

        // WHERE에 currentJti를 다시 걸어, 그 사이 다른 요청이 먼저 교체했으면 count가 0이 된다.
        const { count } = await this.prisma.authSession.updateMany({
          where: {
            id: session.id,
            currentJti: payload.jti,
            revokedAt: null,
          },
          data: {
            previousJti: payload.jti,
            currentJti: newJti,
            rotatedAt: now,
            lastUsedAt: now,
          },
        });

        if( count === 1 ){
          return { id: session.id, currentJti: newJti, expiresAt: session.expiresAt };
        }

        continue; // 다른 요청이 먼저 교체 → 다시 읽어서 ②인지 확인
      }

      // ② 유예 시간 안의 직전 토큰 (여러 탭이 거의 동시에 재발급)
      if(
        payload.jti === session.previousJti &&
        session.rotatedAt &&
        now.getTime() - session.rotatedAt.getTime() <= REFRESH_REUSE_GRACE * 1000
      ){
        return { id: session.id, currentJti: session.currentJti, expiresAt: session.expiresAt };
      }

      // ③ 재사용 감지 - 정상 사용자와 탈취자 중 누가 옛 토큰을 냈는지 서버는 구분할 수 없으므로 세션 전체를 끊는다.
      await this.revokeSession(session.id, user.id);

      throw new UnauthorizedException('보안을 위해 로그아웃되었습니다. 다시 로그인해 주세요.');
    }

    throw new UnauthorizedException('로그인 정보를 갱신하지 못했습니다. 다시 시도해 주세요.');
  }

  //* 현재 세션 갱신 (비밀번호 변경, 전체 로그아웃 후 지금 기기만 유지)
  //  - tokenVersion이 올라간 뒤 호출된다. 현재 세션의 jti와 tokenVersion을 새로 맞춘다.
  //  - 직전 jti는 남기지 않는다. (옛 refresh token은 tokenVersion이 달라 어차피 가드에서 거부됨)
  //  - 현재 세션을 찾지 못하면(세션 도입 전 토큰, 이미 만료) 새 세션을 만든다.
  async renewSession(sessionId: string | undefined, user: SessionUser, userAgent?: string): Promise<SessionForToken> {
    if( sessionId ){
      const newJti = randomUUID();
      const now = new Date();

      const { count } = await this.prisma.authSession.updateMany({
        where: {
          id: sessionId,
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          tokenVersion: user.tokenVersion,
          currentJti: newJti,
          previousJti: null,
          rotatedAt: now,
          lastUsedAt: now,
        },
      });

      if( count === 1 ){
        return this.prisma.authSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: SESSION_FOR_TOKEN_SELECT,
        });
      }
    }

    return this.createSession(user, userAgent);
  }

  //* 세션 폐기 (로그아웃, 기기 로그아웃, 재사용 감지)
  //  - 본인 세션만 폐기되도록 userId를 함께 건다.
  //  - 폐기해도 그 기기에 이미 발급된 access token은 만료(최대 10분)까지 유효하다. (stateless)
  async revokeSession(sessionId: string, userId: number) {
    const { count } = await this.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return count === 1;
  }

  //* 로그인된 기기 목록 (마이페이지)
  async getActiveSessions(user: SessionUser, currentSessionId?: string) {
    const sessions = await this.prisma.authSession.findMany({
      where: {
        userId: user.id,
        ...this.activeSessionWhere(user),
      },
      select: {
        id: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    return sessions.map((session) => ({
      ...session,
      current: session.id === currentSessionId,
    }));
  }

  //* 쓸 수 있는 세션 조회 - 없거나 끝난 세션이면 401
  private async findUsableSession(sessionId: string, user: SessionUser) {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
        ...this.activeSessionWhere(user),
      },
    });

    if( !session ){
      throw new UnauthorizedException('로그인 정보가 만료되었습니다. 다시 로그인해 주세요.');
    }

    return session;
  }

  //* 살아 있는 세션 조건
  //  - 폐기되지 않음 / 절대 만료 전 / 유휴 만료 전(마지막 재발급 후 1일 이내) / tokenVersion 일치
  private activeSessionWhere(user: SessionUser) {
    const now = Date.now();

    return {
      revokedAt: null,
      tokenVersion: user.tokenVersion,
      expiresAt: { gt: new Date(now) },
      lastUsedAt: { gt: new Date(now - REFRESH_TOKEN_EXPIRES_IN * 1000) },
    };
  }

  //* 끝난 세션 삭제 (로그인할 때 그 사용자 것만)
  //  - 폐기됨 / 절대 만료 / 유휴 만료 / tokenVersion 불일치(비밀번호 변경·전체 로그아웃으로 끊김)
  private async deleteDeadSessions(user: SessionUser) {
    const now = Date.now();

    await this.prisma.authSession.deleteMany({
      where: {
        userId: user.id,
        OR: [
          { revokedAt: { not: null } },
          { expiresAt: { lte: new Date(now) } },
          { lastUsedAt: { lte: new Date(now - REFRESH_TOKEN_EXPIRES_IN * 1000) } },
          { tokenVersion: { not: user.tokenVersion } },
        ],
      },
    });
  }
}
