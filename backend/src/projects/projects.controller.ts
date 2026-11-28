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
import { ApiBadRequestResponse, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 프로젝트 - 생성은 USER 누구나, 열람·수정·삭제 권한은 서비스가 프로젝트마다 확인
// 고정 경로(deleted, my-tasks)는 ':id'보다 먼저 선언한다.
@ApiTags('Projects (프로젝트)')
@Controller('projects')
export class ProjectsController {

    constructor(
        private readonly projectsService: ProjectsService,
        private readonly tasksService: ProjectTasksService,
    ){}

    //* 목록 (?scope=mine|all, status, clientId, search)
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '프로젝트 목록', description: 'scope=mine(기본) 내가 참여한 프로젝트 / all 전체(USER 이상 누구나). 목록에는 이름·상태·거래처·책임자·기간·진척도·참여자 수만 있고 설명·금액은 없다. 행마다 isMember·canOpen. 상세는 참여자와 과제 관리 관리자만 연다. status·clientId·search로 거른다. 금액은 원화 정수이고 응답에서 문자열이다(Decimal).' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
    findAll( @User() user: ProjectActor, @Query() query: ProjectListQueryDto ) {
        return this.projectsService.findAll( user, query );
    }

    //* 삭제된 프로젝트 (복구용)
    @Get('deleted')
    @RequireAdmin(AdminPermission.PROJECTS)
    @ApiOperation({ summary: '(관리자) 삭제된 프로젝트', description: '복구용 목록.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
    findDeleted( @Query() query: ProjectListQueryDto ) {
        return this.projectsService.findDeleted( query );
    }

    //* 내 할 일 (내가 담당인 미완료 과제)
    @Get('my-tasks')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '내 할 일', description: '내가 담당인 미완료 과제, 마감일 순. 대시보드 카드에서 쓴다.' })
    findMyTasks( @User() user: ProjectActor ) {
        return this.tasksService.findMine( user );
    }

    @Get(':id')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '프로젝트 상세', description: '참여자, 상태별 과제 수, 진척도(완료 / 삭제되지 않은 전체 과제), myAccess(내 역할·관리자 여부·관리 가능 여부). 참여자와 과제 관리 관리자(모든 프로젝트)만 볼 수 있다.' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트' })
    findOne( @User() user: ProjectActor, @Param('id', ParseIntPipe) id: number ) {
        return this.projectsService.findOne( user, id );
    }

    @Post()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '프로젝트 생성', description: 'USER 이상 누구나. 만든 사람이 책임자가 된다. 시작·종료일은 선택이고 둘 다 있으면 시작 ≤ 종료. 발주처(거래처)는 삭제되지 않은 거래처만.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 시작일이 종료일보다 뒤' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 삭제된 거래처' })
    create( @User() user: ProjectActor, @Body() body: CreateProjectDto ) {
        return this.projectsService.create( user, body );
    }

    @Patch(':id')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '프로젝트 수정', description: '보낸 항목만 바꾼다. 책임자와 과제 관리 관리자만.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 시작일이 종료일보다 뒤' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님, 책임자가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트, 존재하지 않거나 삭제된 거래처' })
    update( @User() user: ProjectActor, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateProjectDto ) {
        return this.projectsService.update( user, id, body );
    }

    @Delete(':id')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '프로젝트 삭제 (soft delete)', description: '책임자와 과제 관리 관리자만. 과제·견적이 있어도 지울 수 있다(데이터 보관, 관리자가 복구). 보통은 완료·종료·취소 상태로 닫는다.' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님, 책임자가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트' })
    delete( @User() user: ProjectActor, @Param('id', ParseIntPipe) id: number ) {
        return this.projectsService.delete( user, id );
    }

    @Patch(':id/restore')
    @RequireAdmin(AdminPermission.PROJECTS)
    @ApiOperation({ summary: '(관리자) 프로젝트 복구' })
    @ApiNotFoundResponse({ description: '삭제된 프로젝트가 아님' })
    restore( @User() user: ProjectActor, @Param('id', ParseIntPipe) id: number ) {
        return this.projectsService.restore( user, id );
    }
}

//* 프로젝트 협력사 (하청기업) - 참여자 누구나 (서비스에서 프로젝트 권한 확인)
@ApiTags('Projects · Partners (협력사)')
@Controller('projects/:projectId/partners')
export class ProjectPartnersController {

    constructor(
        private readonly partnersService: ProjectPartnersService,
    ){}

    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '협력사 목록', description: '하청기업(돈을 주는 쪽). 발주처는 프로젝트에 하나, 협력사는 여러 개. 계약 금액·담당자 포함.' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트' })
    findAll( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number ) {
        return this.partnersService.findAll( user, projectId );
    }

    @Post()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '협력사 등록', description: '참여자 누구나. 회사는 거래처 목록에서 고른다. 외주 계약 금액(공급가액) + 과세/면세 + 부가세율(기본 10%) → 부가세·합계는 서버가 계산한다(부가세 원 미만 버림). 담당자는 직접 기재, 최대 20명.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 계약 시작일이 종료일보다 뒤, 금액이 너무 큼' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트, 존재하지 않거나 삭제된 거래처' })
    @ApiConflictResponse({ description: '이미 이 프로젝트의 협력사로 등록된 거래처' })
    create( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: CreateProjectPartnerDto ) {
        return this.partnersService.create( user, projectId, body );
    }

    @Patch(':partnerId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '협력사 수정', description: '보낸 항목만 바꾼다. 금액·과세·부가세율 중 하나만 고쳐도 부가세·합계를 다시 계산한다. 담당자는 보내면 전체 교체. 회사는 바꿀 수 없다(빼고 새로 추가).' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 계약 시작일이 종료일보다 뒤, 금액이 너무 큼' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트, 이 프로젝트의 협력사가 아님' })
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
    @ApiOperation({ summary: '협력사 빼기 (soft delete)', description: '예산 지출 기록이 남도록 행은 보관한다. 같은 회사를 다시 넣으면 새 행이 된다.' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트, 이 프로젝트의 협력사가 아님' })
    remove(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('partnerId', ParseIntPipe) partnerId: number,
    ) {
        return this.partnersService.remove( user, projectId, partnerId );
    }
}

//* 프로젝트 참여자 - 책임자·관리자 (서비스에서 확인)
@ApiTags('Projects · Members (참여자)')
@Controller('projects/:projectId/members')
export class ProjectMembersController {

    constructor(
        private readonly membersService: ProjectMembersService,
    ){}

    @Post()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '참여자 추가', description: '책임자와 과제 관리 관리자만. 재직 중인 회원만. 역할은 책임자(MANAGER)·참여자(MEMBER), 책임자 여러 명 가능. 추가된 사람에게 알린다. 회원 검색은 GET /users/search.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 재직 중인 회원이 아님' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님, 책임자가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트' })
    @ApiConflictResponse({ description: '이미 참여 중인 회원' })
    add( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: AddProjectMemberDto ) {
        return this.membersService.add( user, projectId, body );
    }

    @Patch(':memberId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '참여자 역할 수정', description: '책임자와 과제 관리 관리자만. 마지막 책임자를 참여자로 바꿀 수 없다(책임자 행을 잠근 뒤 센다).' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 마지막 책임자' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님, 책임자가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트, 이 프로젝트의 참여자가 아님' })
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
    @ApiOperation({ summary: '참여자 제외', description: '책임자와 과제 관리 관리자만. 마지막 책임자는 뺄 수 없다. 빠진 참여자가 담당인 과제는 담당자를 그대로 둔다(담당자 부재로 표시, 책임자가 교체).' })
    @ApiBadRequestResponse({ description: '마지막 책임자' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님, 책임자가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트, 이 프로젝트의 참여자가 아님' })
    remove(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('memberId', ParseIntPipe) memberId: number,
    ) {
        return this.membersService.remove( user, projectId, memberId );
    }
}
