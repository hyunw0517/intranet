import { BadRequestException, Injectable } from '@nestjs/common';
import { Users } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { PaginatePositionQueryDto } from './dto/paginate-position-query.dto';

@Injectable()
export class PositionsService {
  
    constructor(
        private readonly prisma: PrismaService,
    ){}
    
    //* 전체 직급 조회
    async paginatePosition(query: PaginatePositionQueryDto) {
        return await this.prisma.position.findMany({
            where: {
                deleted: false,
                // 값이 없으면 undefined -> Prisma가 조건에서 제외
                name: query.name ? { contains: query.name } : undefined,
            },
            orderBy: { sortOrder: 'asc' },
        });
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
        const newPosition = await this.prisma.position.create({
            data: {
                name: body.name,
                sortOrder: positionCount,
                createdId: user.id,
                updatedId: user.id,
            },
        });
        
        return newPosition;
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
        const updatePosition = await this.prisma.position.update({
            where: {
                id: thisPosition.id,
                deleted: false,
            },
            data: {
                name: body.name,
                updatedId: user.id,
            },
        });
        
        return updatePosition;
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
        
        // DELETE (트랜잭션: 삭제+재정렬)
        await this.prisma.$transaction([
            // 대상 직급 삭제
            this.prisma.position.update({
                where: {
                    id: thisPosition.id,
                    deleted: false,
                },
                data: {
                    deleted: true,
                    deletedAt: new Date(),
                    deletedId: user.id,
                },
            }),

            // 삭제된 직급을 제외하고 재정렬
            this.prisma.position.updateMany({
                where: {
                    sortOrder: { gt: thisPosition.sortOrder }, // 기준 sortOrder를 초과한 정렬 데이터만
                    deleted: false,
                },
                data: {
                    sortOrder: { decrement: 1 }, // -1씩
                },
            }),
        ]);
        
        return true; 

    }

}
