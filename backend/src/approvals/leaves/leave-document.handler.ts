import { Injectable, OnModuleInit } from "@nestjs/common";
import { ApprovalDocumentType, Prisma } from "src/generated/prisma/client";
import { ApprovalDocumentHandler, ApprovalHandlerRegistry, HandledDocument } from "../approval-handler.registry";
import { LeaveRequestsService } from "./leave-requests.service";

//! 휴가 문서(LEAVE) 처리기 - 휴가 옵션이 켜지면 결재의 등록 지점에 자기를 등록한다. (features.md 7.4)
// 결재 본체는 휴가를 import하지 않고, 상신·최종 승인·다시 기안 때 같은 tx로 이 처리기를 부른다.
// 예외를 던지면 상신·승인 전체가 롤백된다. (승인됐는데 연차 확인이 빠지는 일이 없다)
@Injectable()
export class LeaveDocumentHandler implements OnModuleInit, ApprovalDocumentHandler {

    readonly type = ApprovalDocumentType.LEAVE;
    readonly directCreate = false; // 기간 등 휴가 항목이 필요하므로 휴가 API(POST /approvals/leaves)로 만든다

    constructor(
        private readonly registry: ApprovalHandlerRegistry,
        private readonly leaves: LeaveRequestsService,
    ){}

    onModuleInit(){
        this.registry.register( this );
    }

    //* 상신: 하루 합계 + 연차 잔여 (진행 중 포함)
    onSubmit( tx: Prisma.TransactionClient, doc: HandledDocument ){
        return this.leaves.assertCanUse( tx, doc.id );
    }

    //* 최종 승인: 같은 검사를 한 번 더 (그사이 관리자 조정으로 부여가 줄었을 수 있음)
    // 사용 일수는 저장하지 않으므로(승인된 신청의 합계) 문서가 APPROVED가 되는 것이 곧 차감이다.
    onFinalApproved( tx: Prisma.TransactionClient, doc: HandledDocument ){
        return this.leaves.assertCanUse( tx, doc.id );
    }

    //* 다시 기안: 휴가 항목 복사
    onCopy( tx: Prisma.TransactionClient, sourceId: number, newId: number ){
        return this.leaves.copy( tx, sourceId, newId );
    }
}
