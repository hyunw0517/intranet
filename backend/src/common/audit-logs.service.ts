import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditTargetType, Prisma } from "src/generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { AddonsService } from "./addons.service";
import { AUDIT_TARGET_ADDON } from "./const/audit-target-addon.const";
import { AuditLogListDto } from "./dto/audit-log-list.dto";
import { CursorResult } from "./util/pagination.util";
import { addKstDays, kstDateAt } from "./util/date.util";

//! 감사 로그 조회 (핵심 - common). 기록은 AuditService가 맡는다.
@Injectable()
export class AuditLogsService {

    constructor(
        private readonly prisma: PrismaService,
        private readonly addonsService: AddonsService,
    ){}

    //* 감사 로그 목록 (최신순, 커서 페이지네이션)
    // id는 시간순으로 늘어나므로 기본키 순서로 정렬한다. (별도 인덱스 없이 최신순 조회)
    async findList( dto: AuditLogListDto ) {
        if ( dto.from && dto.to && dto.from > dto.to ) {
            throw new BadRequestException('조회 시작일은 종료일보다 늦을 수 없습니다.');
        }

        const rows = await this.prisma.audit.findMany({
            select: {
                id: true,
                targetType: true,
                targetId: true,
                actionType: true,
                content: true,
                detail: true,
                ipAddress: true,
                userAgent: true,
                createdAt: true,
                actor: { select: { id: true, name: true, empNo: true } },
            },
            where: this.buildWhere( dto ),
            orderBy: { id: 'desc' },
            take: dto.take + 1,
        });

        const result = CursorResult( rows, dto );

        // BigInt는 JSON으로 직렬화할 수 없어 문자열로 내려준다.
        return {
            ...result,
            data: result.data.map( ( row ) => ({ ...row, id: String( row.id ) }) ),
        };
    }

    private buildWhere( dto: AuditLogListDto ): Prisma.AuditWhereInput {
        const disabledTargets = ( Object.keys( AUDIT_TARGET_ADDON ) as AuditTargetType[] ).filter( ( target ) => {
            const addon = AUDIT_TARGET_ADDON[target];
            return addon !== null && !this.addonsService.isEnabled( addon );
        });

        return {
            id: dto.cursor !== undefined ? { lt: BigInt( dto.cursor ) } : undefined,
            actionType: dto.actionType,
            createdAt: ( dto.from || dto.to ) ? {
                gte: dto.from ? kstDateAt( dto.from, 0 ) : undefined,
                lt: dto.to ? kstDateAt( addKstDays( dto.to, 1 ), 0 ) : undefined,
            } : undefined,
            actor: dto.actor ? {
                OR: [
                    { name: { contains: dto.actor, mode: 'insensitive' } },
                    { empNo: { contains: dto.actor } },
                ],
            } : undefined,
            AND: [
                ...( dto.targetType ? [ { targetType: dto.targetType } ] : [] ),
                // 대상이 없는 행(targetType NULL)은 SQL의 NOT IN에서 빠지므로 따로 포함한다.
                ...( disabledTargets.length > 0
                    ? [ { OR: [ { targetType: null }, { targetType: { notIn: disabledTargets } } ] } ]
                    : [] ),
            ],
        };
    }
}
