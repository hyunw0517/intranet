import { Injectable, Logger } from "@nestjs/common";
import { NotificationActionType, NotificationTargetType } from "src/generated/prisma/client";
import { NotificationsService } from "src/common/notifications.service";
import { bestEffort } from "src/common/util/best-effort.util";
import { approvalDocumentLink } from "./const/approval.const";

//* 알림에 필요한 문서 정보
export interface NotifiedDocument {
    id: number;
    title: string;
    requesterId: number;
    requesterName: string;
}

//! 전자결재 알림 규칙 (features.md 7.5, 2026-11-10 사용자 결정)
// - 내 차례 도착 → 그 결재자 (상신, 중간 승인 후 다음 결재자, 관리자 교체로 새 결재자가 PENDING이 된 경우)
// - 최종 승인·반려 → 기안자. 중간 승인은 기안자에게 알리지 않는다.
// - 서비스는 트랜잭션이 커밋된 뒤 호출하고, 실패해도 결재는 성공한다(bestEffort). 다른 모듈 알림과 같은 방식.
@Injectable()
export class ApprovalNotifier {

    private readonly logger = new Logger( ApprovalNotifier.name );

    constructor(
        private readonly notificationsService: NotificationsService,
    ){}

    //* 내 차례 도착
    requested( doc: NotifiedDocument, approverId: number, senderId: number | null ){
        return bestEffort( this.logger, `결재 요청 알림(${doc.id})`, () => this.notificationsService.send({
            userIds: [ approverId ],
            actionType: NotificationActionType.APPROVAL_REQUESTED,
            targetType: NotificationTargetType.APPROVAL,
            targetId: doc.id,
            title: '결재할 문서가 도착했습니다.',
            content: `[${doc.requesterName}] ${doc.title}`,
            link: approvalDocumentLink( doc.id ),
            senderId,
        }) );
    }

    //* 최종 승인
    approved( doc: NotifiedDocument, actorId: number ){
        return bestEffort( this.logger, `결재 완료 알림(${doc.id})`, () => this.notificationsService.send({
            userIds: [ doc.requesterId ],
            actionType: NotificationActionType.APPROVAL_APPROVED,
            targetType: NotificationTargetType.APPROVAL,
            targetId: doc.id,
            title: '기안한 문서가 최종 승인되었습니다.',
            content: doc.title,
            link: approvalDocumentLink( doc.id ),
            senderId: actorId,
        }) );
    }

    //* 반려 (내용에 반려 의견)
    rejected( doc: NotifiedDocument, actorId: number, comment: string ){
        return bestEffort( this.logger, `결재 반려 알림(${doc.id})`, () => this.notificationsService.send({
            userIds: [ doc.requesterId ],
            actionType: NotificationActionType.APPROVAL_REJECTED,
            targetType: NotificationTargetType.APPROVAL,
            targetId: doc.id,
            title: '기안한 문서가 반려되었습니다.',
            content: `${doc.title} - ${comment}`,
            link: approvalDocumentLink( doc.id ),
            senderId: actorId,
        }) );
    }
}
