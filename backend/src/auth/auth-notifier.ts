import { Injectable, Logger } from "@nestjs/common";
import { NotificationActionType } from "src/generated/prisma/client";
import { NotificationsService } from "src/common/notifications.service";
import { bestEffort } from "src/common/util/best-effort.util";

//! 인증 알림 규칙 (보안 안내) - 실패해도 업무를 막지 않는다(bestEffort)
@Injectable()
export class AuthNotifier {

    private readonly logger = new Logger( AuthNotifier.name );

    constructor(
        private readonly notificationsService: NotificationsService,
    ){}

    //* refresh token 재사용 감지로 세션을 폐기했을 때 → 세션 주인 (다른 기기에서 로그인 중이면 알림으로 확인할 수 있다)
    // 정상 사용자가 낸 옛 토큰일 수도 있으므로 단정하지 않고, 본인이 아니면 비밀번호 변경을 안내한다.
    sessionRevoked( userId: number ){
        return bestEffort( this.logger, `세션 폐기 알림(user ${userId})`, async () => {
            await this.notificationsService.send({
                userIds: [ userId ],
                actionType: NotificationActionType.SESSION_REVOKED,
                title: '보안을 위해 한 기기의 로그인이 해제되었습니다.',
                content: '이미 사용된 로그인 정보가 다시 사용되어 해당 기기를 로그아웃했습니다. 본인이 아니라면 비밀번호를 변경하세요.',
                link: '/mypage',
                senderId: null,
            });
        });
    }
}
