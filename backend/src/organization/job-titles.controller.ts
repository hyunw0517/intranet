import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { JobTitlesService } from './job-titles.service';
import { User } from 'src/auth/decorator/user.decorator';
import { PaginateJobTitleQueryDto } from './dto/paginate-job-title-query.dto';
import { AdminPermission, Users } from 'src/generated/prisma/client';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { CreateJobTitleDto } from './dto/create-job-title.dto';
import { UpdateJobTitleDto } from './dto/update-job-title.dto';
import { UpdateSortOrderDto } from './dto/update-sort-order.dto';
import { ApiBadRequestResponse, ApiOperation, ApiTags } from '@nestjs/swagger';


// 소속 - 직책 전용 컨트롤러
@ApiTags('Job Titles (직책)')
@Controller('job-titles')
export class JobTitlesController {

  constructor(private readonly jobTitlesService: JobTitlesService) {}

  //* 직책 전체 조회
  @Get()
  @RequireAdmin() // 여러 관리자 화면이 같이 쓰는 조회
  @ApiOperation({ summary: '직책 목록', description: '기본 정렬은 순서(sortOrder) 오름차순. 여러 관리자 화면이 같이 쓴다.' })
  @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
  getListJobTitles(
    @Query() query: PaginateJobTitleQueryDto,
  ) {
    return this.jobTitlesService.paginateJobTitle(query);
  }

  //* 직책 생성
  @Post()
  @RequireAdmin(AdminPermission.ORGANIZATION)
  @ApiOperation({ summary: '직책 생성', description: '맨 뒤 순서로 추가한다.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 이미 존재하는 직책명' })
  postJobTitles(
    @User() user: Pick<Users, 'id'>,
    @Body() body: CreateJobTitleDto,
  ){
    return this.jobTitlesService.createJobTitle(user, body);
  }

  //* 직책 순서 변경 (드래그 정렬)
  // 'order'는 ':id'보다 먼저 선언한다 (뒤에 두면 :id로 잡혀 400)
  @Patch('order')
  @RequireAdmin(AdminPermission.ORGANIZATION)
  @ApiOperation({ summary: '직책 순서 변경 (드래그 정렬)', description: '화면의 최종 순서대로 id 전체를 보낸다. 조직도 구성원 정렬에 쓴다.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 보낸 id 목록이 현재 직책 목록과 다름(새로고침 필요)' })
  patchJobTitleOrder(
    @User() user: Pick<Users, 'id'>,
    @Body() body: UpdateSortOrderDto,
  ){
    return this.jobTitlesService.updateJobTitleOrder(user, body);
  }

  //* 직책 수정
  @Patch(':id')
  @RequireAdmin(AdminPermission.ORGANIZATION)
  @ApiOperation({ summary: '직책 수정' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 존재하지 않는 직책, 이미 존재하는 직책명' })
  patchJobTitles(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateJobTitleDto,
  ){
    return this.jobTitlesService.updateJobTitle(user, id, body);
  }

  //* 직책 삭제
  @Delete(':id')
  @RequireAdmin(AdminPermission.ORGANIZATION)
  @ApiOperation({ summary: '직책 삭제', description: '이 직책의 소속 인원·게시판 권한 사용이 없을 때만 지울 수 있다.' })
  @ApiBadRequestResponse({ description: '존재하지 않는 직책, 소속 인원이 있음, 게시판 권한에서 사용 중' })
  deleteJobTitles(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.jobTitlesService.deleteJobTitle(user, id);
  }

}
