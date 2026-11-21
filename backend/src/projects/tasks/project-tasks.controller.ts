import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole } from 'src/generated/prisma/client';
import { CreateProjectTaskDto, MoveProjectTaskDto, UpdateProjectTaskDto } from '../dto/project-task.dto';
import type { ProjectActor } from '../project-access.service';
import { ProjectTasksService } from './project-tasks.service';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 과제 (칸반) - 프로젝트 참여자 누구나 (서비스에서 프로젝트 권한 확인)
@ApiTags('Projects · Tasks (과제)')
@Controller('projects/:projectId/tasks')
export class ProjectTasksController {

    constructor(
        private readonly tasksService: ProjectTasksService,
    ){}

    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '과제 목록 (칸반)', description: '상태(할 일·진행·완료) 컬럼 → 순서. 담당자가 참여자에서 빠졌거나 퇴사·삭제됐으면 assigneeAbsent. 참여자 누구나.' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트' })
    findAll( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number ) {
        return this.tasksService.findAll( user, projectId );
    }

    @Post()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '과제 생성', description: '참여자 누구나. 컬럼 맨 아래에 넣는다. 담당자는 프로젝트 참여자만, 지정하면 담당자에게 알린다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 담당자가 프로젝트 참여자가 아님' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트' })
    create( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: CreateProjectTaskDto ) {
        return this.tasksService.create( user, projectId, body );
    }

    @Patch(':taskId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '과제 수정', description: '참여자 누구나. 상태·순서는 이동 API로만 바꾼다. 담당자는 참여자 중에서, 담당자 부재인 과제의 담당자 교체는 책임자와 과제 관리 관리자만. 새 담당자에게 알린다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 담당자가 프로젝트 참여자가 아님' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님, 담당자 부재 과제인데 책임자가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·과제' })
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
    @ApiOperation({ summary: '과제 이동 (칸반)', description: '상태 + 컬럼 안 위치(index). 그 컬럼을 트랜잭션 안에서 다시 번호 매긴다. 상태가 바뀐 경우만 감사 로그를 남긴다(드래그마다 쌓이지 않게).' })
    @ApiBadRequestResponse({ description: '입력 검증 실패' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·과제' })
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
    @ApiOperation({ summary: '과제 삭제 (soft delete)', description: '참여자 누구나. 진척도 계산에서 빠진다.' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·과제' })
    delete(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('taskId', ParseIntPipe) taskId: number,
    ) {
        return this.tasksService.delete( user, projectId, taskId );
    }
}
