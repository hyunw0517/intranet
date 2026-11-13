import { Injectable, Logger } from "@nestjs/common";
import { NotificationActionType, NotificationTargetType } from "src/generated/prisma/client";
import { NotificationsService } from "src/common/notifications.service";
import { bestEffort } from "src/common/util/best-effort.util";
import { MY_RESERVATIONS_LINK } from "./const/reservation.const";
import { formatReservationTime } from "./util/reservation-rules.util";

//* 알림에 필요한 예약 정보
export interface NotifiedReservation {
    id: number;
    userId: number;
    startAt: Date;
    endAt: Date;
    facility: { name: string };
}

//! 시설 예약 알림 규칙 (2026-11-09 사용자 결정)
// - 관리자가 남의 예약을 취소·삭제하거나 시간을 바꾸면 예약자에게 알린다. 본인 예약을 직접 처리한 경우는 보내지 않는다.
//   (제목·설명만 고친 경우는 보내지 않는다 - 사용자가 정한 대상은 "시간 수정")
// - 사용 불가 기간 등록으로 겹친 예약에는 보내지 않는다. (관리자 화면 경고만)
// - 서비스는 트랜잭션이 커밋된 뒤 호출하고, 실패해도 업무는 성공한다(bestEffort). 게시판 알림과 같은 방식.
// - 발신자는 남기지 않는다(NULL). 게시판의 관리자 삭제 알림과 같이, 처리한 관리자 개인은 감사 로그에만 남긴다.
@Injectable()
export class ReservationNotifier {

    private readonly logger = new Logger( ReservationNotifier.name );

    constructor(
        private readonly notificationsService: NotificationsService,
    ){}

    //* 관리자가 취소
    cancelledByAdmin( reservations: NotifiedReservation[], adminId: number ){
        return this.notify( reservations, adminId, NotificationActionType.RESERVATION_CANCELLED_BY_ADMIN, '관리자가 내 시설 예약을 취소했습니다.' );
    }

    //* 관리자가 시간 변경 (2026-11-09 사용자 결정) - 내용에 바뀌기 전 시간 → 바뀐 시간
    timeChangedByAdmin( before: NotifiedReservation, after: Pick<NotifiedReservation, 'startAt' | 'endAt'>, adminId: number ){
        return bestEffort( this.logger, `예약 시간 변경 알림(${before.id})`, async () => {
            if ( before.userId === adminId ) return; // 본인 예약

            await this.notificationsService.send({
                userIds: [ before.userId ],
                actionType: NotificationActionType.RESERVATION_UPDATED_BY_ADMIN,
                targetType: NotificationTargetType.FACILITY_RESERVATION,
                targetId: before.id,
                title: '관리자가 내 시설 예약 시간을 변경했습니다.',
                content: `[${before.facility.name}] ${formatReservationTime( before.startAt, before.endAt )} → ${formatReservationTime( after.startAt, after.endAt )}`,
                link: MY_RESERVATIONS_LINK,
                senderId: null,
            });
        });
    }

    //* 관리자가 삭제
    deletedByAdmin( reservations: NotifiedReservation[], adminId: number ){
        return this.notify( reservations, adminId, NotificationActionType.RESERVATION_DELETED_BY_ADMIN, '관리자가 내 시설 예약을 삭제했습니다.' );
    }

    // 예약마다 1건 (일괄 취소면 예약자별로 여러 건이 될 수 있다)
    private notify( reservations: NotifiedReservation[], adminId: number, actionType: NotificationActionType, title: string ){
        return bestEffort( this.logger, `예약 알림(${actionType}, ${reservations.map( ( r ) => r.id ).join( ',' )})`, async () => {
            for ( const r of reservations ) {
                if ( r.userId === adminId ) continue; // 본인 예약

                await this.notificationsService.send({
                    userIds: [ r.userId ],
                    actionType,
                    targetType: NotificationTargetType.FACILITY_RESERVATION,
                    targetId: r.id,
                    title,
                    content: `[${r.facility.name}] ${formatReservationTime( r.startAt, r.endAt )}`,
                    link: MY_RESERVATIONS_LINK,
                    senderId: null,
                });
            }
        });
    }
}
