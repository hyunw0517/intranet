import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, Users } from 'src/generated/prisma/client';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { PaginatePositionQueryDto } from './dto/paginate-position-query.dto';
import { UpdateSortOrderDto } from './dto/update-sort-order.dto';
import { ApiBadRequestResponse, ApiOperation, ApiTags } from '@nestjs/swagger';


// 소속 - 직급 전용 컨트롤러
@ApiTags('Positions (직급)')
@Controller('positions')
export class PositionsController {

  constructor(private readonly positionsService: PositionsService) {}

  //* 직급 전체 조회
  @Get()
  @RequireAdmin() // 여러 관리자 화면이 같이 쓰는 조회
  @ApiOperation({ summary: '직급 목록', description: '기본 정렬은 순서(sortOrder) 오름차순. 여러 관리자 화면이 같이 쓴다.' })
  @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
  getListPositions(
    @Query() query: PaginatePositionQueryDto,
  ) {
    return this.positionsService.paginatePosition(query);
  }

  //* 직급 생성
  @Post()
  @RequireAdmin(AdminPermission.ORGANIZATION)
  @ApiOperation({ summary: '직급 생성', description: '맨 뒤 순서로 추가한다.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 이미 존재하는 직급명' })
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
  @ApiOperation({ summary: '직급 순서 변경 (드래그 정렬)', description: '화면의 최종 순서대로 id 전체를 보낸다. 순서가 위일수록 높은 직급이다(조직도 구성원 정렬에 쓴다).' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 보낸 id 목록이 현재 직급 목록과 다름(새로고침 필요)' })
  patchPositionOrder(
    @User() user: Pick<Users, 'id'>,
    @Body() body: UpdateSortOrderDto,
  ){
    return this.positionsService.updatePositionOrder(user, body);
  }

  //* 직급 수정
  @Patch(':id')
  @RequireAdmin(AdminPermission.ORGANIZATION)
  @ApiOperation({ summary: '직급 수정' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 존재하지 않는 직급, 이미 존재하는 직급명' })
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
  @ApiOperation({ summary: '직급 삭제', description: '사용 중인 회원·게시판 권한이 없을 때만 지울 수 있다.' })
  @ApiBadRequestResponse({ description: '존재하지 않는 직급, 사용 중인 회원이 있음, 게시판 권한에서 사용 중' })
  deletePositions(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.positionsService.deletePosition(user, id);
  }
  
}
