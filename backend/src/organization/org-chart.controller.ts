import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { UserRole } from 'src/generated/prisma/client';
import { DirectoryQueryDto } from './dto/directory-query.dto';
import { OrgChartService } from './org-chart.service';
import { ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

// 사용자용 조직도·사원 검색 (USER 이상) - 관리자용 부서·회원 API와 분리해 공개해도 되는 값만 내보낸다
@ApiTags('Org Chart (조직도·사원 검색)')
@Controller('organization')
export class OrgChartController {

  constructor(private readonly orgChartService: OrgChartService) {}

  //* 조직도: 부서 트리(트리 순서 평평한 목록, depth) + 부서별 구성원 수
  @Get('chart')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: '조직도 부서 트리', description: '부서 트리(트리 순서의 평평한 목록, depth 포함) + 부서별 구성원 수(겸직 포함, 하위 부서 제외). 관리자 API를 열지 않고 일반 직원에게 보여도 되는 값만 준다.' })
  getChart() {
    return this.orgChartService.getChart();
  }

  //* 부서 구성원 (하위 부서 제외, 겸직 포함)
  @Get('chart/:departmentId/members')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: '부서 구성원', description: '그 부서에 직접 소속된 사람만(하위 부서 제외, 겸직 포함). 정렬: 그 부서에서의 직책 순서 → 직급 순위 → 이름(직책·직급이 없으면 뒤로). 공개 범위: 이메일·회사 전화·사진(휴대폰·생일 없음). 대상: 재직 중인 승인 회원.' })
  @ApiNotFoundResponse({ description: '부서를 찾을 수 없음' })
  getDepartmentMembers(
    @Param('departmentId', ParseIntPipe) departmentId: number,
  ) {
    return this.orgChartService.getDepartmentMembers(departmentId);
  }

  //* 사원 검색 (이름·사번·부서명, 이름순 페이지)
  @Get('directory')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: '사원 검색', description: '이름·사번·부서명(겸직 포함) 부분 일치, 이름순 페이지. 공개 범위와 대상은 부서 구성원과 같다.' })
  searchDirectory(
    @Query() query: DirectoryQueryDto,
  ) {
    return this.orgChartService.searchDirectory(query);
  }

  //* 사원 한 명 (채팅 메시지의 보낸 사람 등 id만 아는 화면의 상세 창) - 재직 중이 아니면 404
  @Get('directory/:userId')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: '사원 한 명', description: '채팅 메시지의 보낸 사람처럼 id만 아는 화면의 상세 창. 목록과 같은 대상 조건·공개 범위.' })
  @ApiNotFoundResponse({ description: '재직 중인 직원이 아님(퇴사·비활성·승인 전·삭제 포함)' })
  getDirectoryUser(
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.orgChartService.getDirectoryUser(userId);
  }
}
