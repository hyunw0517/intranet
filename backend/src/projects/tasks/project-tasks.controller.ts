import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole } from 'src/generated/prisma/client';
import { CreateProjectTaskDto, MoveProjectTaskDto, UpdateProjectTaskDto } from '../dto/project-task.dto';
import type { ProjectActor } from '../project-access.service';
import { ProjectTasksService } from './project-tasks.service';

//* 과제 (칸반) - 프로젝트 참여자 누구나 (서비스에서 프로젝트 권한 확인)
@Controller('projects/:projectId/tasks')
export class ProjectTasksController {

    constructor(
        private readonly tasksService: ProjectTasksService,
    ){}

    @Get()
    @Roles(UserRole.USER)
    findAll( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number ) {
        return this.tasksService.findAll( user, projectId );
    }

    @Post()
    @Roles(UserRole.USER)
    create( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: CreateProjectTaskDto ) {
        return this.tasksService.create( user, projectId, body );
    }

    @Patch(':taskId')
    @Roles(UserRole.USER)
    update(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('taskId', ParseIntPipe) taskId: number,
        @Body() body: UpdateProjectTaskDto,
    ) {
        return this.tasksService.update( user, projectId, taskId, body );
    }

    //* 칸반 이동 (상태 + 컬럼 안 위치)
    @Patch(':taskId/move')
    @Roles(UserRole.USER)
    move(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('taskId', ParseIntPipe) taskId: number,
        @Body() body: MoveProjectTaskDto,
    ) {
        return this.tasksService.move( user, projectId, taskId, body );
    }

    @Delete(':taskId')
    @Roles(UserRole.USER)
    delete(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('taskId', ParseIntPipe) taskId: number,
    ) {
        return this.tasksService.delete( user, projectId, taskId );
    }
}
