import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { LOGIN_EMPNO_MAX_LENGTH, LOGIN_LOCK_MINUTES, LOGIN_MAX_FAILS } from './const/login-lock.const';

//* 잠금이 걸렸을 때 돌려주는 정보 (감사 로그·응답 메시지용)
export interface LoginLock {
  lockLevel: number;
  lockedUntil: Date;
}

/**
 * *[로그인 실패 잠금] 사번 기준 단계별 잠금
 *
 * - 5회 연속 실패할 때마다 10분, 30분, 1시간 순으로 잠근다. 남이 일부러 틀려 잠글 수 있어서 최대를 1시간으로 둔다.
 * - 잠긴 동안에는 비밀번호를 확인하지 않는다. 맞는 비밀번호도 거부해서 잠긴 동안 추측할 수 없다.
 * - 없는 사번도 똑같이 센다. 잠금 여부로 등록된 사번을 알 수 없게 하기 위해서다.
 * - 여러 사번에 한 번씩 시도하는 공격은 IP 요청 수 제한(ThrottlerGuard)으로 막는다.
 */
@Injectable()
export class LoginHistoryService {

  private readonly logger = new Logger(LoginHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  //* 저장 키 (Basic 토큰의 사번은 DTO 검증을 안 거쳐서 컬럼 길이에 맞게 자른다)
  toKey(empNo: string) {
    return empNo.slice(0, LOGIN_EMPNO_MAX_LENGTH);
  }

  //* 잠겨 있으면 429 (남은 시간 안내)
  async assertNotLocked(empNo: string) {
    const row = await this.prisma.loginHistory.findUnique({
      select: { lockedUntil: true },
      where: { empNo: this.toKey(empNo) },
    });

    if( row?.lockedUntil && row.lockedUntil > new Date() ){
      throw this.lockedException(row.lockedUntil);
    }
  }

  //* 실패 기록 (5회째면 잠그고 잠금 정보를 돌려준다)
  async recordFailure(empNo: string, userId: number | null): Promise<LoginLock | null> {
    const key = this.toKey(empNo);
    const now = new Date();

    const row = await this.increaseFailCount(key, userId, now);

    if( row.failCount < LOGIN_MAX_FAILS ){
      return null;
    }

    const lockLevel = Math.min(row.lockLevel + 1, LOGIN_LOCK_MINUTES.length);
    const lockedUntil = new Date(now.getTime() + LOGIN_LOCK_MINUTES[lockLevel - 1] * 60 * 1000);

    // 동시에 5회째가 여러 번 와도 한 번만 잠그도록 WHERE에 failCount를 다시 건다
    const { count } = await this.prisma.loginHistory.updateMany({
      where: { id: row.id, failCount: { gte: LOGIN_MAX_FAILS } },
      data: { failCount: 0, lockLevel, lockedUntil },
    });

    return ( count === 1 ) ? { lockLevel, lockedUntil } : null;
  }

  //* 실패 횟수 +1 (없으면 생성)
  // 첫 실패가 동시에 오면 한쪽 create가 unique 충돌(P2002)하고, 다시 하면 update가 된다.
  private async increaseFailCount(empNo: string, userId: number | null, now: Date) {
    const upsert = () => this.prisma.loginHistory.upsert({
      where: { empNo },
      create: { empNo, userId, failCount: 1, lastFailedAt: now },
      update: { userId, failCount: { increment: 1 }, lastFailedAt: now },
    });

    try{
      return await upsert();
    }catch( e ){
      if( e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ){
        return await upsert();
      }
      throw e;
    }
  }

  //* 단계 초기화 (지운 행이 있으면 true)
  async reset(empNo: string) {
    const { count } = await this.prisma.loginHistory.deleteMany({
      where: { empNo: this.toKey(empNo) },
    });

    return count > 0;
  }

  //* 회원의 잠금 상태 (관리자 회원 상세 표시용)
  async getStatus(empNo: string) {
    const row = await this.prisma.loginHistory.findUnique({
      select: { failCount: true, lockLevel: true, lockedUntil: true },
      where: { empNo: this.toKey(empNo) },
    });

    if( !row ){
      return null;
    }

    return {
      ...row,
      isLocked: !!row.lockedUntil && row.lockedUntil > new Date(),
    };
  }

  //* 잠금 응답 (429, 남은 시간은 올림한 분 단위)
  lockedException(lockedUntil: Date) {
    const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60000));

    return new HttpException(
      `로그인 시도가 너무 많아 잠시 잠겼습니다. ${minutes}분 후 다시 시도해 주세요.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  //* 없는 사번 행 정리 (매일 04:30 KST)
  // 없는 사번은 로그인에 성공할 일이 없어 계속 쌓이므로, 하루 지나고 잠금도 끝난 행을 지운다.
  @Cron('0 30 4 * * *', { name: 'login-history-cleanup', timeZone: 'Asia/Seoul' })
  async deleteUnknownEmpNos() {
    const now = new Date();
    const { count } = await this.prisma.loginHistory.deleteMany({
      where: {
        userId: null,
        lastFailedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        OR: [ { lockedUntil: null }, { lockedUntil: { lt: now } } ],
      },
    });

    this.logger.log(`없는 사번 로그인 실패 기록 ${count}건 삭제`);
    return count;
  }
}
