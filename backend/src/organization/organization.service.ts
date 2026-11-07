import { BadRequestException, Injectable } from '@nestjs/common';
import { Users } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDepartmentDto } from './dto/create-user-department.dto';
import { UpdateUserDepartmentDto } from './dto/update-user-department.dto';
import { UpdateUserPositionDto } from './dto/update-user-position.dto';

// 회원 소속 서비스 -> 회원의 직급(Users.positionId) + 소속(UserDepartment: 부서·직책·대표 소속)
@Injectable()
export class OrganizationService {

    constructor(
        private readonly prisma: PrismaService,
    ){}

    //* 회원 소속 조회 (직급 + 소속 목록)
    async getUserOrganization(
        userId: number,
    ) {
        const user = await this.prisma.users.findFirst({
            select: {
                id: true,
                name: true,
                // 직급
                position: { 
                    select: { 
                        id: true, 
                        name: true, 
                    } 
                },
                // 소속 (부서+직책)
                departments: {
                    select: {
                        id: true,
                        isPrimary: true,
                        // 부서
                        department: { 
                            select: { 
                                id: true, 
                                name: true, 
                            } 
                        },
                        // 직책
                        jobTitle: { 
                            select: { 
                                id: true, 
                                name: true 
                            } 
                        },
                    },
                    where: { deleted: false },
                    orderBy: [
                        // orderBy 배열 이유: Prisma는 orderBy 객체 하나에 필드가 정확히 1개만 있어야 함
                        { isPrimary: 'desc' }, //1순위(대표 지정 소속)
                        { createdAt: 'asc' } //2순위(등록순)
                    ], 
                },
            },
            where: {
                id: userId,
                deleted: false,
            },
        });

        if( !user ){
            throw new BadRequestException('존재하지 않는 회원입니다.');
        }

        return user;
    }

    //* 대표 소속 이름 (게시글·댓글 작성 당시, 결재 당시 등 스냅샷 저장용) → 대표 소속의 부서·직책 + 직급
    // 대표 소속은 getUserOrganization의 정렬 규칙(isPrimary 우선)을 따르므로 첫 번째 소속이다.
    // 컬럼 이름은 쓰는 쪽마다 다르므로(authorXxx, approverXxx 등) 일반적인 이름으로 반환한다.
    async getPrimaryOrganizationNames(
        userId: number,
    ){
        const organization = await this.getUserOrganization( userId );
        const primary = organization.departments[0];    // 소속이 없는 회원도 있음

        return {
            positionName: organization.position?.name ?? null,
            departmentName: primary?.department.name ?? null,
            jobTitleName: primary?.jobTitle?.name ?? null,
        };
    }

    //* 회원 직급 지정 (null이면 해제)
    async updateUserPosition(
        userId: number,
        body: UpdateUserPositionDto,
    ){
        await this.checkUser(userId);

        // undefined: 변경 없음, null: 직급 해제 -> 검사 생략
        if( body.positionId !== undefined && body.positionId !== null ){
            const position = await this.prisma.position.findFirst({
                where: {
                    id: body.positionId,
                    deleted: false,
                },
            });

            if( !position ){
                throw new BadRequestException('존재하지 않는 직급입니다.');
            }
        }

        await this.prisma.users.update({
            where: { 
                id: userId, 
            },
            data: { 
                positionId: body.positionId, 
            },
        });

        return this.getUserOrganization(userId);
    }

    //* 회원 소속 추가
    async createUserDepartment(
        user: Pick<Users, 'id'>,
        userId: number,
        body: CreateUserDepartmentDto,
    ){
        await this.checkUser(userId);
        await this.checkDepartment(body.departmentId);
        await this.checkJobTitle(body.jobTitleId);
        await this.checkDuplicateDepartment(userId, body.departmentId);

        // 첫 소속이면 대표 소속으로 자동 지정
        const departmentCount = await this.prisma.userDepartment.count({
            where: {
                userId,
                deleted: false,
            }
        });

        // INSERT
        const newUserDepartment = await this.prisma.userDepartment.create({
            data: {
                userId,
                departmentId: body.departmentId,
                jobTitleId: body.jobTitleId ?? null,
                isPrimary: ( departmentCount > 0 ) ? false : true, // 첫 소속이면 대표 소속
                createdId: user.id,
                updatedId: user.id,
            },
        });

        return newUserDepartment;
    }

    //* 회원 소속 수정 (부서·직책)
    async updateUserDepartment(
        user: Pick<Users, 'id'>,
        userId: number,
        userDepartmentId: number,
        body: UpdateUserDepartmentDto,
    ){
        const thisUserDepartment = await this.findUserDepartment(userId, userDepartmentId);

        // 부서가 바뀌는 경우에만 부서 검증 + 중복 확인
        if( body.departmentId !== undefined && body.departmentId !== thisUserDepartment.departmentId ){
            await this.checkDepartment(body.departmentId);
            await this.checkDuplicateDepartment(userId, body.departmentId);
        }

        await this.checkJobTitle(body.jobTitleId);

        // UPDATE (undefined인 필드는 Prisma가 수정에서 제외, jobTitleId: null은 직책 해제)
        const updateUserDepartment = await this.prisma.userDepartment.update({
            where: {
                id: thisUserDepartment.id,
                deleted: false,
            },
            data: {
                departmentId: body.departmentId,
                jobTitleId: body.jobTitleId,
                updatedId: user.id,
            },
        });

        return updateUserDepartment;
    }

    //* 회원 소속 삭제
    async deleteUserDepartment(
        user: Pick<Users, 'id'>,
        userId: number,
        userDepartmentId: number,
    ){
        const thisUserDepartment = await this.findUserDepartment(userId, userDepartmentId);

        const deleteQuery = this.prisma.userDepartment.update({
            where: {
                id: thisUserDepartment.id,
                deleted: false,
            },
            data: {
                deleted: true,
                deletedAt: new Date(),
                deletedId: user.id,
            },
        });

        // 대표 소속이면 남은 소속 중 가장 오래된 소속을 대표로 승격
        const nextPrimary = thisUserDepartment.isPrimary
            ? await this.prisma.userDepartment.findFirst({
                where: {
                    userId,
                    id: { not: thisUserDepartment.id },
                    deleted: false,
                },
                orderBy: [
                    { createdAt: 'asc' }, 
                    { id: 'asc' } 
                ],
            })
            : null;

        // 승격 대상이 없으면 (대표 소속이 아니거나, 남은 소속이 없으면) 삭제만
        if( !nextPrimary ){
            await deleteQuery;
            return true;
        }

        // DELETE (트랜잭션: 삭제+승격)
        // 대표 소속 unique(userId, isPrimary, deleted: false)는 삭제된 행을 제외하므로, 삭제를 먼저 실행해야 승격이 가능
        await this.prisma.$transaction([
            deleteQuery,
            this.prisma.userDepartment.update({
                where: {
                    id: nextPrimary.id,
                    deleted: false,
                },
                data: {
                    isPrimary: true,
                    updatedId: user.id,
                },
            }),
        ]);

        return true;
    }

    //* 대표 소속 변경 (관리자 + 회원 본인)
    // 회원 본인 요청은 userId에 로그인 회원 id가 들어오므로, 다른 회원의 소속은 findUserDepartment에서 걸러진다.
    async updatePrimaryUserDepartment(
        user: Pick<Users, 'id'>,
        userId: number,
        userDepartmentId: number,
    ){
        const thisUserDepartment = await this.findUserDepartment(userId, userDepartmentId);

        if( thisUserDepartment.isPrimary ){
            return thisUserDepartment;
        }

        // UPDATE (트랜잭션: 기존 대표 해제 + 새 대표 지정)
        // 대표 소속 unique 때문에 기존 대표를 먼저 해제. 
        const [, updateUserDepartment] = await this.prisma.$transaction([
            this.prisma.userDepartment.updateMany({
                where: {
                    userId,
                    isPrimary: true,
                    deleted: false,
                },
                data: {
                    isPrimary: false,
                    updatedId: user.id,
                },
            }),
            this.prisma.userDepartment.update({
                where: {
                    id: thisUserDepartment.id,
                    deleted: false,
                },
                data: {
                    isPrimary: true,
                    updatedId: user.id,
                },
            }),
        ]);

        return updateUserDepartment;
    }

    // 회원 존재 확인 (퇴사자는 관리자 재량이므로 막지 않음)
    private async checkUser(userId: number) {
        const user = await this.prisma.users.findFirst({
            select: { 
                id: true, 
            },
            where: {
                id: userId,
                deleted: false,
            },
        });

        if( !user ){
            throw new BadRequestException('존재하지 않는 회원입니다.');
        }
    }

    // 부서 존재 확인
    private async checkDepartment(departmentId: number) {
        const department = await this.prisma.department.findFirst({
            where: {
                id: departmentId,
                deleted: false,
            },
        });

        if( !department ){
            throw new BadRequestException('존재하지 않는 부서입니다.');
        }
    }

    // 직책 존재 확인 (undefined: 변경 없음, null: 직책 없음 -> 검사 생략)
    private async checkJobTitle(jobTitleId: number | null | undefined) {
        if( jobTitleId === undefined || jobTitleId === null ){
            return;
        }

        const jobTitle = await this.prisma.jobTitle.findFirst({
            where: {
                id: jobTitleId,
                deleted: false,
            },
        });

        if( !jobTitle ){
            throw new BadRequestException('존재하지 않는 직책입니다.');
        }
    }

    // 같은 부서 중복 소속 확인
    private async checkDuplicateDepartment(userId: number, departmentId: number) {
        const departmentExists = await this.prisma.userDepartment.findFirst({
            where: {
                userId,
                departmentId,
                deleted: false,
            },
        });

        if( departmentExists ){
            throw new BadRequestException('이미 소속된 부서입니다.');
        }
    }

    // 회원의 소속 조회 (다른 회원의 소속 id면 존재하지 않는 것으로 처리)
    private async findUserDepartment(userId: number, userDepartmentId: number) {
        const userDepartment = await this.prisma.userDepartment.findFirst({
            where: {
                id: userDepartmentId,
                userId,
                deleted: false,
            },
        });

        if( !userDepartment ){
            throw new BadRequestException('존재하지 않는 소속입니다.');
        }

        return userDepartment;
    }

}
