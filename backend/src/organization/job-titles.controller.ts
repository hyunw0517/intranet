import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { JobTitlesService } from './job-titles.service';
import { User } from 'src/auth/decorator/user.decorator';
import { PaginateJobTitleQueryDto } from './dto/paginate-job-title-query.dto';
import { UserRole, Users } from 'src/generated/prisma/client';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { CreateJobTitleDto } from './dto/create-job-title.dto';
import { UpdateJobTitleDto } from './dto/update-job-title.dto';


// 소속 - 직책 전용 컨트롤러
@Controller('job-titles')
export class JobTitlesController {

  constructor(private readonly jobTitlesService: JobTitlesService) {}

  //* 직책 전체 조회
  @Get()
  @Roles(UserRole.ADMIN)
  getListJobTitles(
    @Query() query: PaginateJobTitleQueryDto,
  ) {
    return this.jobTitlesService.paginateJobTitle(query);
  }

  //* 직책 생성
  @Post()
  @Roles(UserRole.ADMIN)
  postJobTitles(
    @User() user: Pick<Users, 'id'>,
    @Body() body: CreateJobTitleDto,
  ){
    return this.jobTitlesService.createJobTitle(user, body);
  }

  //* 직책 수정
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  patchJobTitles(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateJobTitleDto,
  ){
    return this.jobTitlesService.updateJobTitle(user, id, body);
  }

  //* 직책 삭제
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  deleteJobTitles(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.jobTitlesService.deleteJobTitle(user, id);
  }

}
