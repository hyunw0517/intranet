import { BadRequestException, Injectable } from '@nestjs/common';
import { Users, UserStatus } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { PaginateDepartmentQueryDto } from './dto/paginate-department-query.dto';

@Injectable()
export class DepartmentsService {
  
    constructor(
        private readonly prisma: PrismaService,
    ){}
    
    //* 전체 부서 조회
    async paginateDepartment(
        query: PaginateDepartmentQueryDto, 
    ) {
        return await this.prisma.department.findMany({
            where: {
                deleted: false,
                // 값이 없으면 undefined -> Prisma가 조건에서 제외
                name: query.name ? { contains: query.name } : undefined,
            },
            orderBy: { 
                sortOrder: 'asc',
            },
        });
    }

    //* 부서 생성
    async createDepartment(
        user: Pick<Users, 'id'>, 
        body: CreateDepartmentDto,
    ){
        const targetParentId = body.parentDepartmentId ?? null;

        // 중복 확인 데이터
        const nameExists = await this.prisma.department.findFirst({
            where: {
                parentDepartmentId: targetParentId, //부서명이 다른 경우엔 name 중복 허용
                name: body.name,
                deleted: false, 
            }
        });
        
        if( nameExists ){
            throw new BadRequestException('이미 존재하는 부서명입니다.');
        }

        // 상위 부서 검증
        if( targetParentId !== null ){
            const parentDepartment = await this.prisma.department.findFirst({
                where: { 
                    id: targetParentId, 
                    deleted: false, 
                },
            });

            if( !parentDepartment ){
                throw new BadRequestException('존재하지 않는 상위 부서입니다.');
            }
        }
        
        // 카운트 세어서 sortOrder에 정렬순서 대조 
        const departmentCount = await this.prisma.department.count({
            where: {
                parentDepartmentId: body.parentDepartmentId ?? null, 
                deleted: false, 
            }
        });
        
        // INSERT
        const newDepartment = await this.prisma.department.create({
            data: {
                parentDepartmentId: body.parentDepartmentId ?? null,
                name: body.name,
                sortOrder: departmentCount,
                createdId: user.id,
                updatedId: user.id,
            },
        });
        
        return newDepartment;
    }

    //* 부서 수정
    async updateDepartment(
        user: Pick<Users, 'id'>, 
        departmentId: number,
        body: UpdateDepartmentDto,
    ){
        // 존재 확인 
        const thisDepartment = await this.prisma.department.findFirst({
            where: {
                id: departmentId, //부서명이 다른 경우엔 name 중복 허용
                deleted: false,
            }
        });
        
        if( !thisDepartment ){
            throw new BadRequestException('존재하지 않는 부서입니다.');
        }

        //partentDepartmentId undefined 여부 검사
        const targetParentId = ( body.parentDepartmentId !== undefined ) ? body.parentDepartmentId : thisDepartment.parentDepartmentId;

        // 중복 확인 
        const nameExists = await this.prisma.department.findFirst({
            where: {
                id: { not: thisDepartment.id }, // 자기 자신 제외
                parentDepartmentId: targetParentId,
                name: body.name,
                deleted: false,
            }
        });

        if( nameExists ){
            throw new BadRequestException('이미 존재하는 부서명입니다.');
        }

        // UPDATE (상위 부서가 변경되는 경우 -> 트랜잭션: 수정+재정렬)
        if( thisDepartment.parentDepartmentId !== targetParentId ){

            // 상위 부서 검증: 상위 부서부터 최상위까지 올라가며 검사
            // -> 대상: 존재하지 않거나 삭제 OR 자신이 순환 참조 (자기 자신 또는 하위 부서를 상위로 지정한 경우)
            let cursorId = targetParentId;
            while( cursorId !== null ){
                if( cursorId === thisDepartment.id ){
                    throw new BadRequestException('자기 자신 또는 하위 부서를 상위 부서로 지정할 수 없습니다.');
                }

                const cursorDepartment = await this.prisma.department.findFirst({
                    select: { parentDepartmentId: true },
                    where: {
                        id: cursorId,
                        deleted: false,
                    },
                });

                if( !cursorDepartment ){
                    throw new BadRequestException('존재하지 않는 상위 부서입니다.');
                }

                cursorId = cursorDepartment.parentDepartmentId;
            }

            // 이동하려는 상위 부서의 하위 부서 수 
            const moveDepartmentGroupCount = await this.prisma.department.count({
                where: { 
                    parentDepartmentId: targetParentId, 
                    deleted: false 
                },
            });
            
            const [updateDepartment] = await this.prisma.$transaction([
                this.prisma.department.update({
                    where: { 
                        id: thisDepartment.id, 
                        deleted: false 
                    },
                    data: { 
                        parentDepartmentId: targetParentId, 
                        name: body.name, 
                        sortOrder: moveDepartmentGroupCount, 
                        updatedId: user.id 
                    },
                }),
                // 이전 상위 부서를 가진 부서들을 재정렬
                this.prisma.department.updateMany({
                    where: {
                        parentDepartmentId: thisDepartment.parentDepartmentId,
                        sortOrder: { gt: thisDepartment.sortOrder },
                        deleted: false,
                    },
                    data: { 
                        sortOrder: { decrement: 1 } 
                    },
                }),
            ]);

            return updateDepartment;
        }

        // UPDATE (상위 부서 변동이 없는 경우 -> 트랜잭션 없이 수정)
        const updateDepartment = await this.prisma.department.update({
            where: {
                id: thisDepartment.id,
                deleted: false,
            },
            data: {
                //parentDepartmentId: targetParentId,
                name: body.name,
                updatedId: user.id,
            },
        });
        
        return updateDepartment;
    }

    //* 부서 삭제
    async deleteDepartment(
        user: Pick<Users, 'id'>, 
        departmentId: number,
    ){
        // 중복 확인 데이터
        const thisDepartment = await this.prisma.department.findFirst({
            where: {
                id: departmentId,
                deleted: false,
            }
        });

        if( !thisDepartment ){
            throw new BadRequestException('존재하지 않는 부서입니다.');
        }

        // 하위 부서 확인
        const childDepartmentCount = await this.prisma.department.count({
            where: {
                parentDepartmentId: thisDepartment.id,
                deleted: false,
            }
        });

        if( childDepartmentCount > 0 ){
            throw new BadRequestException('하위 부서가 있는 부서는 삭제할 수 없습니다.');
        }

        // 소속 인원 확인 
        const memberCount = await this.prisma.userDepartment.count({
            where: {
                departmentId: thisDepartment.id,
                deleted: false,
                user: { 
                    status: { 
                        not: UserStatus.RESIGNED // 퇴사자는 검증 인원에서 제외
                    }, 
                    deleted: false, 
                },
            }
        });

        if( memberCount > 0 ){
            throw new BadRequestException('소속 인원이 있는 부서는 삭제할 수 없습니다.');
        }

        // DELETE (트랜잭션: 삭제+재정렬)
        await this.prisma.$transaction([
            // 대상 부서 삭제
            this.prisma.department.update({
                where: {
                    id: thisDepartment.id,
                    deleted: false,
                },
                data: {
                    deleted: true,
                    deletedAt: new Date(),
                    deletedId: user.id,
                },
            }),

            // 삭제된 부서를 제외한 동일한 상위 부서를 가진 부서들을 재정렬
            this.prisma.department.updateMany({
                where: {
                    parentDepartmentId: thisDepartment.parentDepartmentId,
                    sortOrder: { gt: thisDepartment.sortOrder }, // 기준 sortOrder를 초과한 정렬 데이터만
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
