import { BadRequestException, Injectable } from '@nestjs/common';
import { Users } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateJobTitleDto } from './dto/create-job-title.dto';
import { UpdateJobTitleDto } from './dto/update-job-title.dto';
import { PaginateJobTitleQueryDto } from './dto/paginate-job-title-query.dto';

@Injectable()
export class JobTitlesService {
  
    constructor(
        private readonly prisma: PrismaService,
    ){}
    
    //* 전체 직책 조회
    async paginateJobTitle(query: PaginateJobTitleQueryDto) {
        return await this.prisma.jobTitle.findMany({
            where: {
                deleted: false,
                // 값이 없으면 undefined -> Prisma가 조건에서 제외
                name: query.name ? { contains: query.name } : undefined,
            },
            orderBy: { sortOrder: 'asc' },
        });
    }

    //* 직책 생성
    async createJobTitle(
        user: Pick<Users, 'id'>, 
        body: CreateJobTitleDto,
    ){
        // 중복 확인 데이터
        const nameExists = await this.prisma.jobTitle.findFirst({
            where: {
                name: body.name,
                deleted: false, 
            }
        });
        
        if( nameExists ){
            throw new BadRequestException('이미 존재하는 직책명입니다.');
        }
        
        // 카운트 세어서 sortOrder에 정렬순서 대조 
        const jobTitleCount = await this.prisma.jobTitle.count({
            where: {
                deleted: false, 
            }
        });
        
        // INSERT
        const newJobTitle = await this.prisma.jobTitle.create({
            data: {
                name: body.name,
                sortOrder: jobTitleCount,
                createdId: user.id,
                updatedId: user.id,
            },
        });
        
        return newJobTitle;
    }

    //* 직책 수정
    async updateJobTitle(
        user: Pick<Users, 'id'>, 
        jobTitleId: number,
        body: UpdateJobTitleDto,
    ){
        // 존재 확인 
        const thisJobTitle = await this.prisma.jobTitle.findFirst({
            where: {
                id: jobTitleId, //직책명이 다른 경우엔 name 중복 허용
                deleted: false, 
            }
        });
        
        if( !thisJobTitle ){
            throw new BadRequestException('존재하지 않는 직책입니다.');
        }

        // 중복 확인
        const nameExists = await this.prisma.jobTitle.findFirst({
            where: {
                id: { not: thisJobTitle.id }, // 자기 자신 제외
                name: body.name,
                deleted: false,
            }
        });

        if( nameExists ){
            throw new BadRequestException('이미 존재하는 직책명입니다.');
        }

        // UPDATE
        const updateJobTitle = await this.prisma.jobTitle.update({
            where: {
                id: thisJobTitle.id,
                deleted: false,
            },
            data: {
                name: body.name,
                updatedId: user.id,
            },
        });
        
        return updateJobTitle;
    }

    //* 직책 삭제
    async deleteJobTitle(
        user: Pick<Users, 'id'>, 
        jobTitleId: number,
    ){
        // 중복 확인 데이터
        const thisJobTitle = await this.prisma.jobTitle.findFirst({
            where: {
                id: jobTitleId,
                deleted: false,
            }
        });

        if( !thisJobTitle ){
            throw new BadRequestException('존재하지 않는 직책입니다.');
        }
        
        // DELETE (트랜잭션: 삭제+재정렬)
        await this.prisma.$transaction([
            // 대상 직책 삭제
            this.prisma.jobTitle.update({
                where: {
                    id: thisJobTitle.id,
                    deleted: false,
                },
                data: {
                    deleted: true,
                    deletedAt: new Date(),
                    deletedId: user.id,
                },
            }),

            // 삭제된 직책을 제외한 직급을 재정렬
            this.prisma.jobTitle.updateMany({
                where: {
                    sortOrder: { gt: thisJobTitle.sortOrder }, // 기준 sortOrder를 초과한 정렬 데이터만
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
