import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, UserRole } from 'src/generated/prisma/client';
import { AddProjectMemberDto, CreateProjectDto, ProjectListQueryDto, UpdateProjectDto, UpdateProjectMemberDto } from './dto/project.dto';
import { CreateProjectPartnerDto, UpdateProjectPartnerDto } from './dto/project-partner.dto';
import { ProjectMembersService } from './project-members.service';
import { ProjectPartnersService } from './project-partners.service';
import type { ProjectActor } from './project-access.service';
import { ProjectsService } from './projects.service';
import { ProjectTasksService } from './tasks/project-tasks.service';

//* 프로젝트 - 생성은 USER 누구나, 열람은 참여자·관리자, 수정·삭제는 책임자·관리자 (서비스에서 프로젝트마다 확인)
// 고정 경로(deleted, my-tasks)는 ':id'보다 먼저 선언한다.
@Controller('projects')
export class ProjectsController {

    constructor(
        private readonly projectsService: ProjectsService,
        private readonly tasksService: ProjectTasksService,
    ){}

    //* 목록 (?scope=mine|all, status, clientId, search)
    @Get()
    @Roles(UserRole.USER)
    findAll( @User() user: ProjectActor, @Query() query: ProjectListQueryDto ) {
        return this.projectsService.findAll( user, query );
    }

    //* 삭제된 프로젝트 (복구용)
    @Get('deleted')
    @RequireAdmin(AdminPermission.PROJECTS)
    findDeleted( @Query() query: ProjectListQueryDto ) {
        return this.projectsService.findDeleted( query );
    }

    //* 내 할 일 (내가 담당인 미완료 과제)
    @Get('my-tasks')
    @Roles(UserRole.USER)
    findMyTasks( @User() user: ProjectActor ) {
        return this.tasksService.findMine( user );
    }

    @Get(':id')
    @Roles(UserRole.USER)
    findOne( @User() user: ProjectActor, @Param('id', ParseIntPipe) id: number ) {
        return this.projectsService.findOne( user, id );
    }

    @Post()
    @Roles(UserRole.USER)
    create( @User() user: ProjectActor, @Body() body: CreateProjectDto ) {
        return this.projectsService.create( user, body );
    }

    @Patch(':id')
    @Roles(UserRole.USER)
    update( @User() user: ProjectActor, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateProjectDto ) {
        return this.projectsService.update( user, id, body );
    }

    @Delete(':id')
    @Roles(UserRole.USER)
    delete( @User() user: ProjectActor, @Param('id', ParseIntPipe) id: number ) {
        return this.projectsService.delete( user, id );
    }

    @Patch(':id/restore')
    @RequireAdmin(AdminPermission.PROJECTS)
    restore( @User() user: ProjectActor, @Param('id', ParseIntPipe) id: number ) {
        return this.projectsService.restore( user, id );
    }
}

//* 프로젝트 협력사 (하청기업) - 참여자 누구나 (서비스에서 프로젝트 권한 확인)
@Controller('projects/:projectId/partners')
export class ProjectPartnersController {

    constructor(
        private readonly partnersService: ProjectPartnersService,
    ){}

    @Get()
    @Roles(UserRole.USER)
    findAll( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number ) {
        return this.partnersService.findAll( user, projectId );
    }

    @Post()
    @Roles(UserRole.USER)
    create( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: CreateProjectPartnerDto ) {
        return this.partnersService.create( user, projectId, body );
    }

    @Patch(':partnerId')
    @Roles(UserRole.USER)
    update(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('partnerId', ParseIntPipe) partnerId: number,
        @Body() body: UpdateProjectPartnerDto,
    ) {
        return this.partnersService.update( user, projectId, partnerId, body );
    }

    @Delete(':partnerId')
    @Roles(UserRole.USER)
    remove(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('partnerId', ParseIntPipe) partnerId: number,
    ) {
        return this.partnersService.remove( user, projectId, partnerId );
    }
}

//* 프로젝트 참여자 - 책임자·관리자 (서비스에서 확인)
@Controller('projects/:projectId/members')
export class ProjectMembersController {

    constructor(
        private readonly membersService: ProjectMembersService,
    ){}

    @Post()
    @Roles(UserRole.USER)
    add( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: AddProjectMemberDto ) {
        return this.membersService.add( user, projectId, body );
    }

    @Patch(':memberId')
    @Roles(UserRole.USER)
    update(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('memberId', ParseIntPipe) memberId: number,
        @Body() body: UpdateProjectMemberDto,
    ) {
        return this.membersService.update( user, projectId, memberId, body );
    }

    @Delete(':memberId')
    @Roles(UserRole.USER)
    remove(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('memberId', ParseIntPipe) memberId: number,
    ) {
        return this.membersService.remove( user, projectId, memberId );
    }
}
