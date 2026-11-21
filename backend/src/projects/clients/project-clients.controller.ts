import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, Users } from 'src/generated/prisma/client';
import {
    CreateProjectClientContactDto, CreateProjectClientDto, ProjectClientListQueryDto,
    UpdateProjectClientContactDto, UpdateProjectClientDto,
} from './dto/project-client.dto';
import { ProjectClientsService } from './project-clients.service';
import { ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 거래처 - USER 이상 누구나 등록·수정·삭제·복구 (2026-11-16·17 사용자 결정)
// 'projects/:id'보다 먼저 등록해야 한다(ProjectsModule controllers 배열 순서). 고정 경로 'deleted'는 ':id'보다 먼저 선언.
@ApiTags('Projects · Clients (거래처)')
@Controller('projects/clients')
export class ProjectClientsController {

    constructor(
        private readonly clientsService: ProjectClientsService,
    ){}

    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '거래처 목록', description: 'USER 이상 누구나. 회사명 등 검색. 발주 프로젝트 수·협력 프로젝트 수는 실제 연결에서 계산한다(삭제되지 않은 프로젝트만).' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
    findAll( @Query() query: ProjectClientListQueryDto ) {
        return this.clientsService.findAll( query );
    }

    //* [삭제된 거래처] 탭
    @Get('deleted')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '삭제된 거래처', description: '삭제한 사람·삭제 시각 포함.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
    findDeleted( @Query() query: ProjectClientListQueryDto ) {
        return this.clientsService.findDeleted( query );
    }

    @Get(':id')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '거래처 상세', description: '담당자 포함. 삭제된 거래처도 볼 수 있다(기존 프로젝트·견적에는 실제 이름이 그대로 보인다).' })
    @ApiNotFoundResponse({ description: '존재하지 않는 거래처' })
    findOne( @Param('id', ParseIntPipe) id: number ) {
        return this.clientsService.findOne( id );
    }

    @Post()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '거래처 등록', description: 'USER 이상 누구나(등록자가 퇴사해도 인수인계자가 고칠 수 있게 등록자로 묶지 않는다, 변경은 감사 로그). 사업자등록번호는 숫자만 저장(하이픈 제거, 10자리)하고 입력했을 때만 삭제되지 않은 거래처끼리 중복 금지.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 같은 사업자등록번호의 거래처가 있음' })
    @ApiConflictResponse({ description: '동시 등록으로 사업자등록번호가 겹침(DB 부분 unique)' })
    create( @User() user: Pick<Users, 'id'>, @Body() body: CreateProjectClientDto ) {
        return this.clientsService.create( user, body );
    }

    @Patch(':id')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '거래처 수정', description: 'USER 이상 누구나, 보낸 항목만.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 같은 사업자등록번호의 거래처가 있음' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 삭제된 거래처' })
    @ApiConflictResponse({ description: '동시 수정으로 사업자등록번호가 겹침' })
    update( @User() user: Pick<Users, 'id'>, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateProjectClientDto ) {
        return this.clientsService.update( user, id, body );
    }

    @Delete(':id')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '거래처 삭제 (soft delete)', description: '새 프로젝트에서 고를 수 없게 되고, 기존 프로젝트·견적에는 이름이 그대로 남는다.' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 이미 삭제된 거래처' })
    delete( @User() user: Pick<Users, 'id'>, @Param('id', ParseIntPipe) id: number ) {
        return this.clientsService.delete( user, id );
    }

    @Patch(':id/restore')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '거래처 복구', description: 'USER 이상 누구나. 같은 사업자등록번호의 거래처가 이미 있으면 복구할 수 없다.' })
    @ApiBadRequestResponse({ description: '같은 사업자등록번호의 거래처가 있음' })
    @ApiNotFoundResponse({ description: '삭제된 거래처가 아님' })
    @ApiConflictResponse({ description: '동시 처리로 사업자등록번호가 겹침' })
    restore( @User() user: Pick<Users, 'id'>, @Param('id', ParseIntPipe) id: number ) {
        return this.clientsService.restore( user, id );
    }

    //* 담당자
    @Post(':id/contacts')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '거래처 담당자 추가', description: '이름(필수)·부서·직책·연락처·이메일·메모.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 삭제된 거래처' })
    createContact( @User() user: Pick<Users, 'id'>, @Param('id', ParseIntPipe) id: number, @Body() body: CreateProjectClientContactDto ) {
        return this.clientsService.createContact( user, id, body );
    }

    @Patch(':id/contacts/:contactId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '거래처 담당자 수정' })
    @ApiBadRequestResponse({ description: '입력 검증 실패' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 삭제된 거래처·담당자' })
    updateContact(
        @User() user: Pick<Users, 'id'>,
        @Param('id', ParseIntPipe) id: number,
        @Param('contactId', ParseIntPipe) contactId: number,
        @Body() body: UpdateProjectClientContactDto,
    ) {
        return this.clientsService.updateContact( user, id, contactId, body );
    }

    @Delete(':id/contacts/:contactId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '거래처 담당자 삭제 (soft delete)' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 삭제된 거래처·담당자' })
    deleteContact(
        @User() user: Pick<Users, 'id'>,
        @Param('id', ParseIntPipe) id: number,
        @Param('contactId', ParseIntPipe) contactId: number,
    ) {
        return this.clientsService.deleteContact( user, id, contactId );
    }
}
