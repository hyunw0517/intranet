import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, Users } from 'src/generated/prisma/client';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { PaginatePositionQueryDto } from './dto/paginate-position-query.dto';


// 소속 - 직급 전용 컨트롤러
@Controller('positions')
export class PositionsController {

  constructor(private readonly positionsService: PositionsService) {}

  //* 직급 전체 조회
  @Get()
  @Roles(UserRole.ADMIN)
  getListPositions(
    @Query() query: PaginatePositionQueryDto,
  ) {
    return this.positionsService.paginatePosition(query);
  }

  //* 직급 생성
  @Post()
  @Roles(UserRole.ADMIN)
  postPositions(
    @User() user: Pick<Users, 'id'>,
    @Body() body: CreatePositionDto,
  ){
    return this.positionsService.createPosition(user, body);
  }

  //* 직급 수정
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  patchPositions(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePositionDto,
  ){
    return this.positionsService.updatePosition(user, id, body);
  }

  //* 직급 삭제
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  deletePositions(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.positionsService.deletePosition(user, id);
  }
  
}
