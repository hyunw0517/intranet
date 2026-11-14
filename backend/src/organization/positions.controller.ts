import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, Users } from 'src/generated/prisma/client';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { PaginatePositionQueryDto } from './dto/paginate-position-query.dto';
import { UpdateSortOrderDto } from './dto/update-sort-order.dto';


// 소속 - 직급 전용 컨트롤러
@Controller('positions')
export class PositionsController {

  constructor(private readonly positionsService: PositionsService) {}

  //* 직급 전체 조회
  @Get()
  @RequireAdmin() // 여러 관리자 화면이 같이 쓰는 조회
  getListPositions(
    @Query() query: PaginatePositionQueryDto,
  ) {
    return this.positionsService.paginatePosition(query);
  }

  //* 직급 생성
  @Post()
  @RequireAdmin(AdminPermission.ORGANIZATION)
  postPositions(
    @User() user: Pick<Users, 'id'>,
    @Body() body: CreatePositionDto,
  ){
    return this.positionsService.createPosition(user, body);
  }

  //* 직급 순서 변경 (드래그 정렬)
  // 'order'는 ':id'보다 먼저 선언해야 한다. (뒤에 두면 'order'가 :id로 매칭되어 ParseIntPipe 400)
  @Patch('order')
  @RequireAdmin(AdminPermission.ORGANIZATION)
  patchPositionOrder(
    @User() user: Pick<Users, 'id'>,
    @Body() body: UpdateSortOrderDto,
  ){
    return this.positionsService.updatePositionOrder(user, body);
  }

  //* 직급 수정
  @Patch(':id')
  @RequireAdmin(AdminPermission.ORGANIZATION)
  patchPositions(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePositionDto,
  ){
    return this.positionsService.updatePosition(user, id, body);
  }

  //* 직급 삭제
  @Delete(':id')
  @RequireAdmin(AdminPermission.ORGANIZATION)
  deletePositions(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.positionsService.deletePosition(user, id);
  }
  
}
