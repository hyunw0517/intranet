import { Injectable } from "@nestjs/common";
import { AuditActionType, AuditTargetType, Prisma } from "src/generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { RequestContext } from "./context/request-context";
import { AuditBatchChanges, AuditChanges, toAuditJson } from "./util/audit-detail.util";

//* 단건 기록 입력
export interface AuditLogInput {
    targetType: AuditTargetType;
    targetId?: number | null;           // 대상 pk (없으면 NULL - 예: 로그인 실패)
    actionType: AuditActionType;
    content?: string;                   // 사람이 읽는 요약 (예: '게시판 생성: 공지사항')
    detail?: Record<string, unknown>;   // 변경 내용 (diffChanges 결과는 { changes } 로 넣는다)
    actorId?: number | null;            // 작업자. 생략하면 요청 컨텍스트의 로그인 회원, 명시적 null이면 작업자 없음
}

//* 일괄 처리 입력 (targetIds 배열 → 묶어서 1행)
export interface AuditBatchLogInput {
    targetType: AuditTargetType;
    targetIds: number[];                // 처리한 대상 pk 배열
    actionType: AuditActionType;
    content?: string;
    changes?: AuditBatchChanges;        // batchChanges 결과
    extra?: Record<string, unknown>;    // 그 밖의 추가 정보
    actorId?: number | null;
}

const USER_AGENT_MAX_LENGTH = 500;

//! 감사 로그 (핵심 - common)
// - 모든 CRUD에서 호출한다. 수정·삭제 없이 쌓기만 한다.
// - 업무 작업과 같은 트랜잭션에 기록한다: 업무 서비스의 tx를 넘기면 업무가 롤백될 때 로그도 같이 롤백된다.
//   ("로그는 있는데 실제로는 안 된 작업"이 생기지 않는다. 대신 로그 저장이 실패하면 업무도 실패한다.)
// - 작업자·IP·User-Agent는 요청 컨텍스트(AsyncLocalStorage)에서 읽는다. 호출하는 쪽은 넘기지 않는다.
// - 업무 모듈을 모른다. 대상은 targetType + targetId로만 가리킨다.
@Injectable()
export class AuditService {

    constructor(
        private readonly prisma: PrismaService,
    ){}

    //* 대상 종류를 고정한 기록 도구 (서비스마다 대상이 정해져 있어 호출을 짧게 쓰기 위함)
    // ex) 생성자에서 this.audit = auditService.target( AuditTargetType.BOARD );
    //     await this.audit.created( tx, board.id, `게시판 생성: ${board.name}` );
    target( targetType: AuditTargetType ): TargetAudit {
        return new TargetAudit( this, targetType );
    }

    //* 단건 기록
    // ex) await this.auditService.log({ targetType: AuditTargetType.BOARD, targetId: board.id, actionType: AuditActionType.CREATE, content: `게시판 생성: ${board.name}` }, tx);
    async log( input: AuditLogInput, tx?: Prisma.TransactionClient ): Promise<void> {
        const db = tx ?? this.prisma;

        await db.audit.create({
            data: {
                targetType: input.targetType,
                targetId: input.targetId ?? null,
                actionType: input.actionType,
                content: input.content,
                detail: input.detail ? toAuditJson( input.detail ) : undefined,
                createdId: input.actorId !== undefined ? input.actorId : RequestContext.userId() ?? null,
                ipAddress: RequestContext.ip()?.slice( 0, 45 ),
                userAgent: RequestContext.userAgent()?.slice( 0, USER_AGENT_MAX_LENGTH ),
            },
        });
    }

    //* 일괄 처리 기록 (묶어서 1행, targetId = NULL, detail.batch = true)
    // - 대상이 1개면 단건과 같은 형태로 남긴다. (targetId로 대상별 이력 조회가 되도록)
    async logBatch( input: AuditBatchLogInput, tx?: Prisma.TransactionClient ): Promise<void> {
        const targetIds = [ ...new Set( input.targetIds ) ];
        if ( targetIds.length === 0 ) return;

        if ( targetIds.length === 1 ) {
            const id = targetIds[0];
            const changes = input.changes
                ? Object.fromEntries( Object.entries( input.changes ).map( ([field, c]) =>
                    [ field, { before: c.before[String( id )] ?? null, after: c.after } ] ) )
                : undefined;

            return this.log({
                targetType: input.targetType,
                targetId: id,
                actionType: input.actionType,
                content: input.content,
                detail: changes || input.extra ? { ...input.extra, ...( changes && { changes } ) } : undefined,
                actorId: input.actorId,
            }, tx );
        }

        return this.log({
            targetType: input.targetType,
            targetId: null,
            actionType: input.actionType,
            content: input.content,
            detail: { ...input.extra, batch: true, targetIds, ...( input.changes && { changes: input.changes } ) },
            actorId: input.actorId,
        }, tx );
    }
}

type Tx = Prisma.TransactionClient | undefined;

//* 대상 종류가 고정된 감사 로그 (AuditService.target()으로 만든다)
// - 생성·수정·삭제는 한 줄로: created / updated / deleted
// - 그 밖의 동작(권한 변경·로그인·복구 등)과 일괄 처리는 log / logBatch에 actionType을 넘긴다.
// - tx를 첫 인자로 받는다. (업무와 같은 트랜잭션에 기록하는 것이 기본이므로)
export class TargetAudit {

    constructor(
        private readonly auditService: AuditService,
        private readonly targetType: AuditTargetType,
    ){}

    log( input: Omit<AuditLogInput, 'targetType'>, tx?: Tx ){
        return this.auditService.log( { ...input, targetType: this.targetType }, tx );
    }

    logBatch( input: Omit<AuditBatchLogInput, 'targetType'>, tx?: Tx ){
        return this.auditService.logBatch( { ...input, targetType: this.targetType }, tx );
    }

    //* 생성 (detail: 생성 당시 주요 값)
    created( tx: Tx, targetId: number, content: string, detail?: Record<string, unknown> ){
        return this.log( { targetId, actionType: AuditActionType.CREATE, content, detail }, tx );
    }

    //* 수정 (changes: diffChanges 결과, extra: 그 밖의 정보 - detail에 함께 저장)
    updated( tx: Tx, targetId: number, content: string, changes: AuditChanges, extra?: Record<string, unknown> ){
        return this.log( { targetId, actionType: AuditActionType.UPDATE, content, detail: { ...extra, changes } }, tx );
    }

    //* 삭제
    deleted( tx: Tx, targetId: number, content: string, detail?: Record<string, unknown> ){
        return this.log( { targetId, actionType: AuditActionType.DELETE, content, detail }, tx );
    }
}
