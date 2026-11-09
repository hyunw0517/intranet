import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { NotificationActionType, NotificationTargetType, Prisma } from "src/generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { RequestContext } from "./context/request-context";
import { NotificationListDto } from "./dto/notification-list.dto";
import { CursorArgs, CursorResult } from "./util/pagination.util";

//* 알림 보내기 입력
export interface SendNotificationInput {
    userIds: number[];                      // 받는 사람 (중복은 제거)
    actionType: NotificationActionType;
    targetType?: NotificationTargetType;
    targetId?: number;
    title: string;
    content?: string;
    link?: string;                          // 눌렀을 때 이동할 프론트 주소 (예: `/boards/${boardId}/posts/${postId}`)
    senderId?: number | null;               // 생략하면 요청 컨텍스트의 로그인 회원, 명시적 null이면 시스템 알림
}

// 알림 보관 기간 (지나면 배치로 물리 삭제)
export const NOTIFICATION_RETENTION_DAYS = 90;

const NOTIFICATION_SELECT = {
    id: true,
    targetType: true,
    targetId: true,
    actionType: true,
    title: true,
    content: true,
    link: true,
    isRead: true,
    readAt: true,
    createdAt: true,
    sender: { select: { id: true, name: true } },
} satisfies Prisma.NotificationSelect;

//! 알림 (핵심 - common)
// - 알림이 필요한 곳(사용자가 정한 곳)에서 send()를 호출한다. 업무 모듈을 모르고, 이동 주소(link)는 보내는 쪽이 정한다.
// - 받는 사람마다 행 1개.
// - 업무 쪽 규칙(*-notifier)은 업무 트랜잭션이 **커밋된 뒤** 호출하고, 실패해도 업무를 막지 않는다(bestEffort). (2026-11-09 사용자 결정)
//   알림은 빠져도 불편에 그치고, 공지처럼 받는 사람이 많으면 트랜잭션이 길어지기 때문. 감사 로그는 반대로 같은 트랜잭션.
//   tx 인자는 트랜잭션 안에서 꼭 보내야 하는 경우를 위해 남겨 둔다(현재 사용처 없음).
// - 삭제는 물리 삭제: 본인 삭제 + 보관 기간(90일)이 지난 알림은 하루 1회 배치로 정리.
@Injectable()
export class NotificationsService {

    private readonly logger = new Logger( NotificationsService.name );

    constructor(
        private readonly prisma: PrismaService,
    ){}

    //* 알림 보내기 (보낸 사람 본인은 받는 사람에서 제외)
    // ex) await this.notificationsService.send({ userIds: [post.authorId], actionType: NotificationActionType.POST_COMMENTED,
    //         targetType: NotificationTargetType.POST, targetId: post.id, title: '내 글에 댓글이 달렸습니다.', link: `/boards/${boardId}/posts/${post.id}` }, tx);
    async send( input: SendNotificationInput, tx?: Prisma.TransactionClient ): Promise<number> {
        const db = tx ?? this.prisma;
        const senderId = input.senderId !== undefined ? input.senderId : RequestContext.userId() ?? null;
        const userIds = [ ...new Set( input.userIds ) ].filter( ( id ) => id !== senderId );

        if ( userIds.length === 0 ) return 0;

        const { count } = await db.notification.createMany({
            data: userIds.map( ( userId ) => ({
                userId,
                actionType: input.actionType,
                targetType: input.targetType,
                targetId: input.targetId,
                title: input.title,
                content: input.content,
                link: input.link,
                createdId: senderId,
            }) ),
        });

        return count;
    }

    //* 내 알림 목록 (최신순, 커서 페이지네이션)
    async findMine( userId: number, dto: NotificationListDto ) {
        const rows = await this.prisma.notification.findMany({
            where: {
                userId,
                ...( dto.unreadOnly && { isRead: false } ),
            },
            select: NOTIFICATION_SELECT,
            orderBy: [ { createdAt: 'desc' }, { id: 'desc' } ],
            ...CursorArgs( dto ),
        });

        return CursorResult( rows, dto );
    }

    //* 안 읽은 알림 수 (헤더 배지)
    async countUnread( userId: number ) {
        const count = await this.prisma.notification.count({
            where: { userId, isRead: false },
        });

        return { count };
    }

    //* 읽음 처리 (이미 읽은 알림이면 그대로 둔다 - readAt은 처음 읽은 시각)
    async markRead( userId: number, id: bigint ) {
        const notification = await this.prisma.notification.findFirst({
            where: { id, userId },
            select: { id: true, isRead: true },
        });

        if ( !notification ) {
            throw new NotFoundException( '알림을 찾을 수 없습니다.' );
        }

        if ( !notification.isRead ) {
            await this.prisma.notification.update({
                where: { id },
                data: { isRead: true, readAt: new Date() },
            });
        }
    }

    //* 모두 읽음 처리
    async markAllRead( userId: number ) {
        const { count } = await this.prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true, readAt: new Date() },
        });

        return { count };
    }

    //* 알림 삭제 (본인 알림만, 물리 삭제)
    async remove( userId: number, id: bigint ) {
        const { count } = await this.prisma.notification.deleteMany({
            where: { id, userId },
        });

        if ( count === 0 ) {
            throw new NotFoundException( '알림을 찾을 수 없습니다.' );
        }
    }

    //* 보관 기간이 지난 알림 정리 (매일 04:00 KST)
    // - 서버가 여러 대면 각각 실행되지만, 같은 조건의 DELETE라 중복 실행돼도 결과는 같다.
    // - 규모가 커지면 월별 파티션 + 오래된 파티션 DROP으로 바꾼다. (대량 DELETE의 시간·VACUUM 부담)
    @Cron( '0 0 4 * * *', { name: 'notification-cleanup', timeZone: 'Asia/Seoul' } )
    async deleteExpired() {
        const threshold = new Date( Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000 );

        const { count } = await this.prisma.notification.deleteMany({
            where: { createdAt: { lt: threshold } },
        });

        this.logger.log( `보관 기간(${NOTIFICATION_RETENTION_DAYS}일) 지난 알림 ${count}건 삭제` );
        return count;
    }
}
