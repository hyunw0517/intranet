// 예약 수정·취소·삭제 버튼을 보일지 (서버 규칙과 같게 맞춘 화면용 판단, 최종 확인은 서버)
// - 수정·취소: 본인·관리자, 예약됨, 시작 전
// - 삭제: 본인은 시작 전, 관리자는 언제나
// 지난 예약 = 시작 시각이 지난 예약 (2026-11-09 사용자 결정)
import type { UserRole } from "@/types/user";
import type { ReservationStatus } from "@/types/reservation";
import { hasStarted } from "./reservation-time";

export function reservationActions(
  reservation: { userId: number; status: ReservationStatus; startAt: string },
  user: { id: number; role: UserRole } | null,
) {
  if (!user) return { canChange: false, canDelete: false };

  const isAdmin = user.role === "ADMIN";
  const isMine = reservation.userId === user.id;
  const started = hasStarted(reservation.startAt);

  return {
    canChange: (isMine || isAdmin) && reservation.status === "RESERVED" && !started,
    canDelete: isAdmin || (isMine && !started),
  };
}
