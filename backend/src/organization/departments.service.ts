import { BadRequestException, Injectable } from '@nestjs/common';
import { Users, UserStatus } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateDepartmentOrderDto } from './dto/update-department-order.dto';
import { isSameIdSet } from 'src/common/util/id-set.util';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DepartmentListQueryDto } from './dto/department-list-query.dto';
import { toTreeList } from 'src/common/util/tree.util';

@Injectable()
export class DepartmentsService {
  
    constructor(
        private readonly prisma: PrismaService,
    ){}
    
    //* 전체 부서 조회
    // 트리 순서(상위 부서 → 하위 부서들 → 다음 상위 부서)의 평평한 목록으로 반환
    // ex) 경영지원본부 / 경영지원본부/인사팀 / 경영지원본부/총무팀 / 사업본부 / 사업본부/영업팀 ...
    async getDepartments(
        query: DepartmentListQueryDto,
    ) {
        // 전체를 한 번만 조회 (순서는 toTreeList에서 정함)
        const departments = await this.prisma.department.findMany({
            select: {
                id: true,
                name: true,
                parentDepartmentId: true,
                sortOrder: true,
            },
            where: {
                deleted: false 
            },
        });

        // 전체 부서 리스트를 루트 부서에서 하위 부서까지 전위순회 방식으로 표시
        const result = toTreeList( departments, ( department ) => department.parentDepartmentId );

        // 부서명 검색: 경로 기준이라 상위 부서명으로 검색하면 하위 부서까지 함께 조회됨
        return query.name
            ? result.filter( ( department ) => department.path.includes( query.name as string ) )
            : result;
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

    //* 부서 순서 변경 (드래그 정렬)
    // - 같은 상위 부서 아래의 형제 부서끼리만 순서를 바꾼다. (상위 부서 이동은 부서 수정에서)
    // - 받은 id 배열이 그 상위 부서의 하위 부서 전체와 정확히 일치해야 한다.
    async updateDepartmentOrder(
        user: Pick<Users, 'id'>,
        body: UpdateDepartmentOrderDto,
    ){
        const parentDepartmentId = body.parentDepartmentId ?? null;

        await this.prisma.$transaction( async (tx) => {
            const siblings = await tx.department.findMany({
                select: { id: true },
                where: {
                    parentDepartmentId,
                    deleted: false,
                },
            });

            if( !isSameIdSet( siblings.map( (d) => d.id ), body.ids ) ){
                throw new BadRequestException('부서 목록이 변경되었습니다. 새로고침 후 다시 시도하세요.');
            }

            for( const [ index, id ] of body.ids.entries() ){
                await tx.department.update({
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

        // 게시판 권한의 부서 조건으로 사용 중인지 확인 (직급·직책 삭제와 동일)
        const boardAuthCount = await this.prisma.boardAuth.count({
            where: {
                departmentId: thisDepartment.id,
                deleted: false,
            }
        });

        if( boardAuthCount > 0 ){
            throw new BadRequestException('게시판 권한에서 사용 중인 부서는 삭제할 수 없습니다.');
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
