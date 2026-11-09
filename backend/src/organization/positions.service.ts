import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditActionType, AuditTargetType, Users, UserStatus } from 'src/generated/prisma/client';
import { AuditService, TargetAudit } from 'src/common/audit.service';
import { diffChanges } from 'src/common/util/audit-detail.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateSortOrderDto } from './dto/update-sort-order.dto';
import { isSameIdSet } from 'src/common/util/id-set.util';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { PaginatePositionQueryDto } from './dto/paginate-position-query.dto';
import { PaginatePage } from 'src/common/util/pagination.util';

@Injectable()
export class PositionsService {
  
    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.POSITION );
    }
    
    //* 전체 직급 조회
    async paginatePosition(query: PaginatePositionQueryDto) {
        
        const where = {
            deleted: false,
            // 값이 없으면 undefined -> Prisma가 조건에서 제외
            name: query.name ? { contains: query.name } : undefined,
        }

        return PaginatePage( query,
            (page) => this.prisma.position.findMany({
                where,
                orderBy: [
                    { [query.sortBy]: query.order },
                    { id: query.order }
                ],
                ...page,
            }),
            () => this.prisma.position.count({ where }),
        );
    }

    //* 직급 생성
    async createPosition(
        user: Pick<Users, 'id'>, 
        body: CreatePositionDto,
    ){
        // 중복 확인 데이터
        const nameExists = await this.prisma.position.findFirst({
            where: {
                name: body.name,
                deleted: false, 
            }
        });
        
        if( nameExists ){
            throw new BadRequestException('이미 존재하는 직급명입니다.');
        }
        
        // 카운트 세어서 sortOrder에 정렬순서 대조 
        const positionCount = await this.prisma.position.count({
            where: {
                deleted: false, 
            }
        });
        
        // INSERT
        return await this.prisma.$transaction( async (tx) => {
            const newPosition = await tx.position.create({
                data: {
                    name: body.name,
                    sortOrder: positionCount,
                    createdId: user.id,
                    updatedId: user.id,
                },
            });

            await this.audit.created( tx, newPosition.id, `직급 생성: ${newPosition.name}` );

            return newPosition;
        });
    }

    //* 직급 수정
    async updatePosition(
        user: Pick<Users, 'id'>, 
        positionId: number,
        body: UpdatePositionDto,
    ){
        // 존재 확인 
        const thisPosition = await this.prisma.position.findFirst({
            where: {
                id: positionId, //직급명이 다른 경우엔 name 중복 허용
                deleted: false,
            }
        });
        
        if( !thisPosition ){
            throw new BadRequestException('존재하지 않는 직급입니다.');
        }

        // 중복 확인
        const nameExists = await this.prisma.position.findFirst({
            where: {
                id: { not: thisPosition.id }, // 자기 자신 제외
                name: body.name,
                deleted: false,
            }
        });

        if( nameExists ){
            throw new BadRequestException('이미 존재하는 직급명입니다.');
        }

        // UPDATE
        return await this.prisma.$transaction( async (tx) => {
            const updatePosition = await tx.position.update({
                where: {
                    id: thisPosition.id,
                    deleted: false,
                },
                data: {
                    name: body.name,
                    updatedId: user.id,
                },
            });

            await this.audit.updated( tx, thisPosition.id, `직급 수정: ${updatePosition.name}`, diffChanges( thisPosition, { name: body.name } ) );

            return updatePosition;
        });
    }

    //* 직급 순서 변경 (드래그 정렬)
    // - 화면의 최종 순서대로 받은 id 배열의 위치를 sortOrder로 저장한다. (sortOrder는 "이 직급 이상" 판단에도 쓰인다)
    // - 현재 직급 전체와 정확히 일치해야 한다. (다른 관리자가 추가·삭제했다면 순서가 어긋나므로 거부)
    async updatePositionOrder(
        user: Pick<Users, 'id'>,
        body: UpdateSortOrderDto,
    ){
        await this.prisma.$transaction( async (tx) => {
            const positions = await tx.position.findMany({
                select: { id: true },
                where: { deleted: false },
                orderBy: { sortOrder: 'asc' },
            });

            if( !isSameIdSet( positions.map( (p) => p.id ), body.ids ) ){
                throw new BadRequestException('직급 목록이 변경되었습니다. 새로고침 후 다시 시도하세요.');
            }

            // 직급 수가 적으므로(최대 100) 한 건씩 UPDATE
            for( const [ index, id ] of body.ids.entries() ){
                await tx.position.update({
                    where: { id },
                    data: {
                        sortOrder: index,
                        updatedId: user.id,
                    },
                });
            }

            // 변경 전·후 순서를 id 배열로 남김 (직급 순서는 게시판 권한 "이 직급 이상" 판단에도 쓰이므로 중요)
            await this.audit.logBatch({
                targetIds: body.ids,
                actionType: AuditActionType.UPDATE,
                content: '직급 순서 변경',
                extra: { orderBefore: positions.map( (p) => p.id ), orderAfter: body.ids },
            }, tx);
        });

        return true;
    }

    //* 직급 삭제
    async deletePosition(
        user: Pick<Users, 'id'>, 
        positionId: number,
    ){
        // 중복 확인 데이터
        const thisPosition = await this.prisma.position.findFirst({
            where: {
                id: positionId,
                deleted: false,
            }
        });

        if( !thisPosition ){
            throw new BadRequestException('존재하지 않는 직급입니다.');
        }

        // 사용 중인 회원 확인 (부서 삭제와 같이 퇴사자는 제외)
        const userCount = await this.prisma.users.count({
            where: {
                positionId: thisPosition.id,
                deleted: false,
                status: { not: UserStatus.RESIGNED },
            }
        });

        if( userCount > 0 ){
            throw new BadRequestException('이 직급을 사용 중인 회원이 있어 삭제할 수 없습니다.');
        }

        // 게시판 권한의 최소 직급 조건으로 사용 중인지 확인
        const boardAuthCount = await this.prisma.boardAuth.count({
            where: {
                positionId: thisPosition.id,
                deleted: false,
            }
        });

        if( boardAuthCount > 0 ){
            throw new BadRequestException('게시판 권한에서 사용 중인 직급은 삭제할 수 없습니다.');
        }

        // DELETE (트랜잭션: 삭제+재정렬+감사 로그)
        await this.prisma.$transaction( async (tx) => {
            // 대상 직급 삭제
            await tx.position.update({
                where: {
                    id: thisPosition.id,
                    deleted: false,
                },
                data: {
                    deleted: true,
                    deletedAt: new Date(),
                    deletedId: user.id,
                },
            });

            // 삭제된 직급을 제외하고 재정렬
            await tx.position.updateMany({
                where: {
                    sortOrder: { gt: thisPosition.sortOrder }, // 기준 sortOrder를 초과한 정렬 데이터만
                    deleted: false,
                },
                data: {
                    sortOrder: { decrement: 1 }, // -1씩
                },
            });

            await this.audit.deleted( tx, thisPosition.id, `직급 삭제: ${thisPosition.name}` );
        });
        
        return true; 

    }

}
