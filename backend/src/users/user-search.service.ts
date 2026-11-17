import { Injectable } from '@nestjs/common';
import { UserRole, UserStatus } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

//* 공용 회원 검색 결과 - 다른 회원에게 보여도 되는 정보만 (이메일·연락처·생일 등은 내보내지 않는다)
export interface UserSearchItem {
    id: number;
    name: string;
    empNo: string;
    departmentName: string | null;  // 주 소속 부서
    positionName: string | null;    // 직급
    jobTitleName: string | null;    // 주 소속의 직책
}

const SEARCH_LIMIT = 20;

//! 공용 회원 검색 (핵심 users, 2026-11-17 사용자 결정)
// - 회원을 고르는 화면(과제 관리 참여자 추가, 결재자 선택)이 쓴다. 애드온이 꺼져도 동작해야 하므로 핵심에 둔다.
//   결재의 별도 결재자 검색(/approvals/approvers)은 2026-11-17에 이 API로 합쳤다. 채팅 상대 검색(ChatRoomsService.searchUsers)은 본인을 빼고 채팅용 응답 모양(ChatUserView)을 써서 그대로 둔다(합칠지는 미정).
//   대상 조건을 바꾸면 결재자 지정 가능 조건(ApproversService.load의 usable)과 어긋나지 않는지 같이 본다.
// - 대상: 재직(ACTIVE) + 승인된 회원(GUEST 제외) + 삭제 안 됨. 이름·사번·부서명 검색, 최대 20명.
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
