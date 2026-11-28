import { Injectable, OnModuleInit } from "@nestjs/common";
import { ApprovalDocumentType, Prisma } from "src/generated/prisma/client";
import { ApprovalDocumentHandler, ApprovalHandlerRegistry, HandledDocument } from "../approval-handler.registry";
import { LeaveRequestsService } from "./leave-requests.service";

//! 휴가 문서(LEAVE) 처리기
// 결재가 상신·최종 승인·다시 기안 때 같은 tx로 부른다. 예외를 던지면 전체가 롤백된다.
@Injectable()
export class LeaveDocumentHandler implements OnModuleInit, ApprovalDocumentHandler {

    readonly type = ApprovalDocumentType.LEAVE;
    readonly directCreate = false; // 휴가 항목이 필요해서 휴가 API로 만든다

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
    // 사용 일수는 저장하지 않아서, 문서가 APPROVED가 되는 것이 곧 차감이다.
    onFinalApproved( tx: Prisma.TransactionClient, doc: HandledDocument ){
        return this.leaves.assertCanUse( tx, doc.id );
    }

    //* 다시 기안: 휴가 항목 복사
    onCopy( tx: Prisma.TransactionClient, sourceId: number, newId: number ){
        return this.leaves.copy( tx, sourceId, newId );
    }
}
