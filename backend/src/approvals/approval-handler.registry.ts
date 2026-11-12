import { BadRequestException, Injectable, OnModuleInit } from "@nestjs/common";
import { ApprovalDocumentType, Prisma } from "src/generated/prisma/client";

//* 처리기가 받는 문서 정보
export interface HandledDocument {
    id: number;
    requesterId: number;
    documentType: ApprovalDocumentType;
    title: string;
}

//* 문서 유형별 처리기 (features.md 7.4 "문서 유형별 처리기 등록", 2026-11-07 사용자 결정)
// - 결재 본체는 업무(휴가 등)를 import하지 않는다. 업무 모듈이 켜지면 자기 처리기를 등록한다.
// - 결재가 같은 트랜잭션(tx)을 넘겨 호출한다 → 처리기가 예외를 던지면 상신·승인 전체가 롤백된다.
export interface ApprovalDocumentHandler {
    type: ApprovalDocumentType;

    // 결재 문서 API(POST /approvals/documents)로 바로 만들 수 있는지.
    // 휴가처럼 업무 데이터(기간 등)가 함께 필요한 유형은 false로 두고 자기 API에서 문서를 만든다.
    directCreate: boolean;

    // 상신 직전 검사 (예: 휴가 잔여 확인)
    onSubmit?( tx: Prisma.TransactionClient, doc: HandledDocument ): Promise<void>;

    // 최종 승인 시 업무 반영 (예: 휴가 확정)
    onFinalApproved?( tx: Prisma.TransactionClient, doc: HandledDocument ): Promise<void>;

    // 다시 기안 시 업무 데이터 복사 (새 DRAFT 문서와 같은 tx). directCreate: false 유형은 이것이 있어야 다시 기안할 수 있다.
    onCopy?( tx: Prisma.TransactionClient, sourceId: number, newId: number ): Promise<void>;
}

//* 업무 데이터를 문서와 같은 트랜잭션에서 저장하는 콜백 (휴가 신청 생성·수정)
export type DraftDataWriter = ( tx: Prisma.TransactionClient, documentId: number ) => Promise<unknown>;

//! 문서 유형 → 처리기 등록 지점
// 처리기가 등록되지 않은 유형(옵션이 꺼진 업무)은 문서를 만들 수 없다.
// 업무 모듈은 이 서비스를 주입받아 onModuleInit에서 register()한다. (GeneralDocumentHandler 참고)
@Injectable()
export class ApprovalHandlerRegistry {

    private readonly handlers = new Map<ApprovalDocumentType, ApprovalDocumentHandler>();

    register( handler: ApprovalDocumentHandler ){
        if ( this.handlers.has( handler.type ) ) {
            throw new Error( `결재 문서 유형 처리기가 중복 등록되었습니다: ${handler.type}` );
        }
        this.handlers.set( handler.type, handler );
    }

    //* 등록된 처리기 (없으면 400 - 꺼진 업무의 문서 유형)
    get( type: ApprovalDocumentType ): ApprovalDocumentHandler {
        const handler = this.handlers.get( type );
        if ( !handler ) {
            throw new BadRequestException( '사용할 수 없는 문서 유형입니다.' );
        }
        return handler;
    }

    //* 쓸 수 있는 문서 유형 (등록 순서)
    list(){
        return [ ...this.handlers.values() ].map( ( h ) => ({ type: h.type, directCreate: h.directCreate }) );
    }
}

//* 일반 문서 - 결재 본체가 직접 등록한다. 업무 처리 없음 (승인 = 결재 완료)
@Injectable()
export class GeneralDocumentHandler implements OnModuleInit, ApprovalDocumentHandler {

    readonly type = ApprovalDocumentType.GENERAL;
    readonly directCreate = true;

    constructor(
        private readonly registry: ApprovalHandlerRegistry,
    ){}

    onModuleInit(){
        this.registry.register( this );
    }
}
