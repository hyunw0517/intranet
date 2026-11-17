import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, Users } from 'src/generated/prisma/client';
import {
    CreateProjectClientContactDto, CreateProjectClientDto, ProjectClientListQueryDto,
    UpdateProjectClientContactDto, UpdateProjectClientDto,
} from './dto/project-client.dto';
import { ProjectClientsService } from './project-clients.service';

//* 거래처 - USER 이상 누구나 등록·수정·삭제·복구 (2026-11-16·17 사용자 결정)
// 'projects/:id'보다 먼저 등록해야 한다(ProjectsModule controllers 배열 순서). 고정 경로 'deleted'는 ':id'보다 먼저 선언.
@Controller('projects/clients')
export class ProjectClientsController {

    constructor(
        private readonly clientsService: ProjectClientsService,
    ){}

    @Get()
    @Roles(UserRole.USER)
    findAll( @Query() query: ProjectClientListQueryDto ) {
        return this.clientsService.findAll( query );
    }

    //* [삭제된 거래처] 탭
    @Get('deleted')
    @Roles(UserRole.USER)
    findDeleted( @Query() query: ProjectClientListQueryDto ) {
        return this.clientsService.findDeleted( query );
    }

    @Get(':id')
    @Roles(UserRole.USER)
    findOne( @Param('id', ParseIntPipe) id: number ) {
        return this.clientsService.findOne( id );
    }

    @Post()
    @Roles(UserRole.USER)
    create( @User() user: Pick<Users, 'id'>, @Body() body: CreateProjectClientDto ) {
        return this.clientsService.create( user, body );
    }

    @Patch(':id')
    @Roles(UserRole.USER)
    update( @User() user: Pick<Users, 'id'>, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateProjectClientDto ) {
        return this.clientsService.update( user, id, body );
    }

    @Delete(':id')
    @Roles(UserRole.USER)
    delete( @User() user: Pick<Users, 'id'>, @Param('id', ParseIntPipe) id: number ) {
        return this.clientsService.delete( user, id );
    }

    @Patch(':id/restore')
    @Roles(UserRole.USER)
    restore( @User() user: Pick<Users, 'id'>, @Param('id', ParseIntPipe) id: number ) {
        return this.clientsService.restore( user, id );
    }

    //* 담당자
    @Post(':id/contacts')
    @Roles(UserRole.USER)
    createContact( @User() user: Pick<Users, 'id'>, @Param('id', ParseIntPipe) id: number, @Body() body: CreateProjectClientContactDto ) {
        return this.clientsService.createContact( user, id, body );
    }

    @Patch(':id/contacts/:contactId')
    @Roles(UserRole.USER)
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
    deleteContact(
        @User() user: Pick<Users, 'id'>,
        @Param('id', ParseIntPipe) id: number,
        @Param('contactId', ParseIntPipe) contactId: number,
    ) {
        return this.clientsService.deleteContact( user, id, contactId );
    }
}
