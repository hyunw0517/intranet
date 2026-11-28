import { Injectable, Logger } from "@nestjs/common";
import { NotificationActionType } from "src/generated/prisma/client";
import { NotificationsService } from "src/common/notifications.service";
import { bestEffort } from "src/common/util/best-effort.util";

//! 인증 알림 (실패해도 업무는 그대로, bestEffort)
@Injectable()
export class AuthNotifier {

    private readonly logger = new Logger( AuthNotifier.name );

    constructor(
        private readonly notificationsService: NotificationsService,
    ){}

    //* refresh token 재사용으로 세션을 끊었을 때 세션 주인에게
    // 정상 사용자의 옛 토큰일 수도 있어서 단정하지 않고 비밀번호 변경만 안내한다.
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
