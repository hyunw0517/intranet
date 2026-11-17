import { Injectable, Logger } from "@nestjs/common";
import { NotificationActionType, NotificationTargetType } from "src/generated/prisma/client";
import { NotificationsService } from "src/common/notifications.service";
import { bestEffort } from "src/common/util/best-effort.util";
import { projectLink, projectTaskLink } from "./const/project.const";

//! 과제 관리 알림 규칙 (2026-11-17 사용자 결정, docs/design/projects.md 5장)
// - 참여자로 추가됨 → 추가된 사람 / 담당자로 지정됨 → 새 담당자 / 마감 임박 → 담당자 (전날 배치)
// - 본인이 한 일은 본인에게 보내지 않는다. (NotificationsService.send가 보낸 사람을 받는 사람에서 뺀다)
// - 서비스는 트랜잭션이 커밋된 뒤 호출하고, 실패해도 업무는 성공한다(bestEffort).
@Injectable()
export class ProjectNotifier {

    private readonly logger = new Logger( ProjectNotifier.name );

    constructor(
        private readonly notificationsService: NotificationsService,
    ){}

    //* 참여자로 추가됨
    memberAdded( project: { id: number; name: string }, userIds: number[] ){
        return bestEffort( this.logger, `프로젝트 참여자 추가 알림(${project.id})`, async () => {
            if ( userIds.length === 0 ) return;
            await this.notificationsService.send({
                userIds,
                actionType: NotificationActionType.PROJECT_MEMBER_ADDED,
                targetType: NotificationTargetType.PROJECT,
                targetId: project.id,
                title: '프로젝트 참여자로 추가되었습니다.',
                content: project.name,
                link: projectLink( project.id ),
            });
        });
    }

    //* 과제 담당자로 지정됨 (생성 시 지정·담당자 변경·부재 담당 교체)
    taskAssigned( project: { id: number; name: string }, task: { id: number; title: string }, assigneeId: number ){
        return bestEffort( this.logger, `과제 담당 지정 알림(${task.id})`, async () => {
            await this.notificationsService.send({
                userIds: [ assigneeId ],
                actionType: NotificationActionType.PROJECT_TASK_ASSIGNED,
                targetType: NotificationTargetType.PROJECT_TASK,
                targetId: task.id,
                title: '과제 담당자로 지정되었습니다.',
                content: `[${project.name}] ${task.title}`,
                link: projectTaskLink( project.id, task.id ),
            });
        });
    }

    //* 마감 임박 (배치 - 보낸 사람 없음)
    taskDueSoon( tasks: { id: number; title: string; assigneeId: number; project: { id: number; name: string } }[] ){
        return bestEffort( this.logger, `과제 마감 임박 알림(${tasks.length}건)`, async () => {
            for ( const task of tasks ) {
                await this.notificationsService.send({
                    userIds: [ task.assigneeId ],
                    actionType: NotificationActionType.PROJECT_TASK_DUE_SOON,
                    targetType: NotificationTargetType.PROJECT_TASK,
                    targetId: task.id,
                    title: '내일 마감인 과제가 있습니다.',
                    content: `[${task.project.name}] ${task.title}`,
                    link: projectTaskLink( task.project.id, task.id ),
                    senderId: null,
                });
            }
        });
    }
}
