import { Injectable } from '@nestjs/common';
import { UserRole, UserStatus } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

//* 공용 회원 검색 결과 (다른 회원에게 보여도 되는 정보만)
export interface UserSearchItem {
    id: number;
    name: string;
    empNo: string;
    departmentName: string | null;  // 대표 소속
    positionName: string | null;
    jobTitleName: string | null;    // 대표 소속의 직책
}

const SEARCH_LIMIT = 20;

//! 공용 회원 검색 (과제 관리 참여자 추가, 결재자 선택)
// 애드온이 꺼져도 동작해야 해서 핵심(users)에 둔다.
// 대상 조건을 바꾸면 결재자 지정 조건(ApproversService.load의 usable)도 같이 본다.
// 채팅 상대 검색(ChatRoomsService.searchUsers)은 본인을 빼고 응답 모양도 달라서 따로 있다.
@Injectable()
export class UserSearchService {

    constructor(
        private readonly prisma: PrismaService,
    ){}

    async search( search: string | undefined ): Promise<UserSearchItem[]> {
        const keyword = search?.trim();
        const users = await this.prisma.users.findMany({
            where: {
                deleted: false,
                status: UserStatus.ACTIVE,
                role: { not: UserRole.GUEST },
                ...( keyword && {
                    OR: [
                        { name: { contains: keyword, mode: 'insensitive' } },
                        { empNo: { contains: keyword, mode: 'insensitive' } },
                        { departments: { some: { deleted: false, department: { deleted: false, name: { contains: keyword, mode: 'insensitive' } } } } },
                    ],
                }),
            },
            select: {
                id: true, name: true, empNo: true,
                position: { select: { name: true } },
                departments: {
                    where: { isPrimary: true, deleted: false, department: { deleted: false } },
                    select: { department: { select: { name: true } }, jobTitle: { select: { name: true, deleted: true } } },
                    take: 1,
                },
            },
            orderBy: [ { name: 'asc' }, { id: 'asc' } ],
            take: SEARCH_LIMIT,
        });

        return users.map( ( u ) => {
            const primary = u.departments[0];
            return {
                id: u.id,
                name: u.name,
                empNo: u.empNo,
                departmentName: primary?.department.name ?? null,
                positionName: u.position?.name ?? null,
                jobTitleName: primary?.jobTitle && !primary.jobTitle.deleted ? primary.jobTitle.name : null,
            };
        });
    }
}
