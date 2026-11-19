import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { UserRole } from 'src/generated/prisma/client';
import { DirectoryQueryDto } from './dto/directory-query.dto';
import { OrgChartService } from './org-chart.service';

// 사용자용 조직도·사원 검색 (USER 이상) - 관리자용 부서·회원 API와 분리해 공개해도 되는 값만 내보낸다
@Controller('organization')
export class OrgChartController {

  constructor(private readonly orgChartService: OrgChartService) {}

  //* 조직도: 부서 트리(트리 순서 평평한 목록, depth) + 부서별 구성원 수
  @Get('chart')
  @Roles(UserRole.USER)
  getChart() {
    return this.orgChartService.getChart();
  }

  //* 부서 구성원 (하위 부서 제외, 겸직 포함)
  @Get('chart/:departmentId/members')
  @Roles(UserRole.USER)
  getDepartmentMembers(
    @Param('departmentId', ParseIntPipe) departmentId: number,
  ) {
    return this.orgChartService.getDepartmentMembers(departmentId);
  }

  //* 사원 검색 (이름·사번·부서명, 이름순 페이지)
  @Get('directory')
  @Roles(UserRole.USER)
  searchDirectory(
    @Query() query: DirectoryQueryDto,
  ) {
    return this.orgChartService.searchDirectory(query);
  }

  //* 사원 한 명 (채팅 메시지의 보낸 사람 등 id만 아는 화면의 상세 창) - 재직 중이 아니면 404
  @Get('directory/:userId')
  @Roles(UserRole.USER)
  getDirectoryUser(
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.orgChartService.getDirectoryUser(userId);
  }
}
