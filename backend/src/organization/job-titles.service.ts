import { BadRequestException, Injectable } from '@nestjs/common';
import { Users, UserStatus } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateSortOrderDto } from './dto/update-sort-order.dto';
import { isSameIdSet } from 'src/common/util/id-set.util';
import { CreateJobTitleDto } from './dto/create-job-title.dto';
import { UpdateJobTitleDto } from './dto/update-job-title.dto';
import { PaginateJobTitleQueryDto } from './dto/paginate-job-title-query.dto';
import { PaginatePage } from 'src/common/util/pagination.util';

@Injectable()
export class JobTitlesService {
  
    constructor(
        private readonly prisma: PrismaService,
    ){}
    
    //* 전체 직책 조회
    async paginateJobTitle(query: PaginateJobTitleQueryDto) {
        
        const where = {
            deleted: false, 
            name: query.name ? { contains: query.name } : undefined,
        };

        return PaginatePage( query,
            // list
            (page) => this.prisma.jobTitle.findMany({
                where,
                orderBy: [
                    { [query.sortBy]: query.order },
                    { id: query.order }
                ],
                ...page,
            }),
            // count
            () => this.prisma.jobTitle.count({ where }),
        );
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

    //* 직책 순서 변경 (드래그 정렬)
    // - 화면의 최종 순서대로 받은 id 배열의 위치를 sortOrder로 저장한다.
    // - 현재 직책 전체와 정확히 일치해야 한다. (다른 관리자가 추가·삭제했다면 순서가 어긋나므로 거부)
    async updateJobTitleOrder(
        user: Pick<Users, 'id'>,
        body: UpdateSortOrderDto,
    ){
        await this.prisma.$transaction( async (tx) => {
            const jobTitles = await tx.jobTitle.findMany({
                select: { id: true },
                where: { deleted: false },
            });

            if( !isSameIdSet( jobTitles.map( (j) => j.id ), body.ids ) ){
                throw new BadRequestException('직책 목록이 변경되었습니다. 새로고침 후 다시 시도하세요.');
            }

            for( const [ index, id ] of body.ids.entries() ){
                await tx.jobTitle.update({
                    where: { id },
                    data: {
                        sortOrder: index,
                        updatedId: user.id,
                    },
                });
            }
        });

        return true;
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

        // 이 직책으로 등록된 소속 확인 (부서 삭제와 같이 퇴사자는 제외)
        const memberCount = await this.prisma.userDepartment.count({
            where: {
                jobTitleId: thisJobTitle.id,
                deleted: false,
                user: {
                    status: { not: UserStatus.RESIGNED },
                    deleted: false,
                },
            }
        });

        if( memberCount > 0 ){
            throw new BadRequestException('이 직책으로 등록된 소속 인원이 있어 삭제할 수 없습니다.');
        }

        // 게시판 권한의 허용 직책으로 사용 중인지 확인 (중간 테이블은 deleted가 없으므로 게시판 권한 기준)
        const boardAuthCount = await this.prisma.boardAuthJobTitle.count({
            where: {
                jobTitleId: thisJobTitle.id,
                boardAuth: { deleted: false },
            }
        });

        if( boardAuthCount > 0 ){
            throw new BadRequestException('게시판 권한에서 사용 중인 직책은 삭제할 수 없습니다.');
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
