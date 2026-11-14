import { Injectable, Logger } from "@nestjs/common";
import { AdminPermission, NotificationActionType, NotificationTargetType, Users, UserStatus } from "src/generated/prisma/client";
import { adminPermissionWhere } from "src/auth/util/admin-permission.util";
import { NotificationsService } from "src/common/notifications.service";
import { bestEffort } from "src/common/util/best-effort.util";
import { PrismaService } from "src/prisma/prisma.service";

//! 회원 알림 규칙 (가입 승인 대기·승인 완료)
// - UsersService가 업무 트랜잭션이 **커밋된 뒤** 한 줄 호출한다. 실패해도 업무를 막지 않는다(bestEffort).
// - 받는 사람·문구·이동 주소는 여기서 정한다.
@Injectable()
export class UserNotifier {

    private readonly logger = new Logger( UserNotifier.name );

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationsService: NotificationsService,
    ){}

    //* 신규 가입 → 재직 중인 회원 관리 담당(슈퍼관리자 + 회원 관리 기능을 가진 관리자)에게 승인 대기 알림 (발신자 = 가입한 회원, 로그인 전 요청이라 명시)
    signupRequested( newUser: Pick<Users, 'id' | 'name' | 'empNo'> ){
        return bestEffort( this.logger, `가입 승인 대기 알림(user ${newUser.id})`, async () => {
            const admins = await this.prisma.users.findMany({
                select: { id: true },
                where: {
                    ...adminPermissionWhere( AdminPermission.USERS ),
                    status: UserStatus.ACTIVE,
                    deleted: false,
                },
            });

            await this.notificationsService.send({
                userIds: admins.map( ( a ) => a.id ),
                actionType: NotificationActionType.SIGNUP_REQUESTED,
                targetType: NotificationTargetType.USER,
                targetId: newUser.id,
                title: '가입 승인 대기 회원이 있습니다.',
                content: `${newUser.name}(${newUser.empNo})님이 가입했습니다. 입사일을 등록한 뒤 승인해 주세요.`,
                link: `/admin/users/${newUser.id}`,
                senderId: newUser.id,
            });
        });
    }

    //* 가입 승인(GUEST → USER/ADMIN) → 승인된 회원 각자에게
    // 승인된 회원의 access token은 다음 재발급(최대 10분)까지 GUEST 권한이라 그동안은 알림 API를 호출할 수 없다.
    signupApproved( userIds: number[] ){
        return bestEffort( this.logger, `가입 승인 알림(${userIds.length}명)`, async () => {
            await this.notificationsService.send({
                userIds,
                actionType: NotificationActionType.SIGNUP_APPROVED,
                title: '가입이 승인되었습니다.',
                content: '이제 인트라넷의 모든 기능을 사용할 수 있습니다.',
                link: '/',
            });
        });
    }
}
