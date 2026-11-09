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
 * *[로그인 실패 잠금] - 계정(사번) 기준, 단계별 잠금 (2026-11-09 사용자 결정)
 *
 * - 5회 연속 실패 → 1단계 10분 / 다시 5회 → 2단계 30분 / 그 뒤로는 1시간 (최대 1시간)
 *   최대를 짧게 둔 이유: 계정 기준 잠금은 남이 일부러 틀려서 잠글 수 있으므로 피해 시간을 제한한다.
 * - 잠긴 동안에는 비밀번호를 확인하지 않고 거부한다. (맞는 비밀번호도 거부 → 잠긴 동안 추측 불가)
 * - 로그인 성공 또는 관리자 해제 시 행을 지워 단계를 초기화한다.
 * - 없는 사번도 같은 방식으로 센다. (잠금 여부로 등록된 사번을 알아낼 수 없도록)
 * - IP 기준 요청 수 제한(ThrottlerGuard)과 함께 쓴다. 여러 사번에 한 번씩 시도하는 공격은 계정 잠금으로 막을 수 없다.
 */
@Injectable()
export class LoginHistoryService {

  private readonly logger = new Logger(LoginHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  //* 저장 키 (사번 컬럼 길이 제한 - Basic 토큰의 사번은 DTO 검증을 거치지 않으므로 서버에서 자른다)
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

  //* 실패 기록 → 5회째면 잠금을 걸고 잠금 정보를 돌려준다. (아니면 null)
  async recordFailure(empNo: string, userId: number | null): Promise<LoginLock | null> {
    const key = this.toKey(empNo);
    const now = new Date();

    const row = await this.increaseFailCount(key, userId, now);

    if( row.failCount < LOGIN_MAX_FAILS ){
      return null;
    }

    const lockLevel = Math.min(row.lockLevel + 1, LOGIN_LOCK_MINUTES.length);
    const lockedUntil = new Date(now.getTime() + LOGIN_LOCK_MINUTES[lockLevel - 1] * 60 * 1000);

    // 동시에 5회째가 여러 번 들어와도 한 번만 잠근다. (WHERE에 failCount를 다시 걸어, 먼저 잠근 요청 뒤에는 count 0)
    const { count } = await this.prisma.loginHistory.updateMany({
      where: { id: row.id, failCount: { gte: LOGIN_MAX_FAILS } },
      data: { failCount: 0, lockLevel, lockedUntil },
    });

    return ( count === 1 ) ? { lockLevel, lockedUntil } : null;
  }

  //* 실패 횟수 +1 (없으면 생성)
  //  - 같은 사번의 첫 실패가 동시에 들어오면 한쪽 create가 unique 충돌(P2002) → 한 번 더 시도하면 update로 처리된다.
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

  //* 단계 초기화 (로그인 성공, 관리자 해제·비밀번호 초기화) - 지운 행이 있으면 true
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
  //  - 있는 회원의 행은 성공·관리자 해제 전까지 단계가 유지되어야 하므로 지우지 않는다.
  //  - 없는 사번은 성공할 일이 없어 계속 쌓이므로, 마지막 실패 후 하루가 지났고 잠금도 끝난 행을 지운다.
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
