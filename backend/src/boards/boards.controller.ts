import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { BoardsService } from './boards.service';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, Users } from 'src/generated/prisma/client';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { UpdateBoardOrderDto } from './dto/update-board-order.dto';

@Controller('boards')
export class BoardsController {

  constructor( private readonly boardsService: BoardsService ) {}

  //* 관리자 전체 게시판 조회 (트리 순서, 페이지네이션 없음)
  // 'admin'은 ':id'보다 먼저 선언해야 한다. (뒤에 두면 'admin'이 :id로 매칭되어 ParseIntPipe 400)
  @Get('admin')
  @Roles(UserRole.ADMIN)
  getAdminBoards() {
    return this.boardsService.getAdminBoards();
  }

  //* 게시판 생성
  @Post()
  @Roles(UserRole.ADMIN)
  postBoard(
    @User() user: Pick<Users, 'id'>,
    @Body() body: CreateBoardDto,
  ){
    return this.boardsService.createBoard(user, body);
  }

  //* 게시판 순서 변경 (드래그 정렬, 같은 상위 게시판의 형제끼리)
  // 'order'는 ':id'보다 먼저 선언해야 한다.
  @Patch('order')
  @Roles(UserRole.ADMIN)
  patchBoardOrder(
    @User() user: Pick<Users, 'id'>,
    @Body() body: UpdateBoardOrderDto,
  ){
    return this.boardsService.updateBoardOrder(user, body);
  }

  //* 게시판 수정
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  patchBoard(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateBoardDto,
  ){
    return this.boardsService.updateBoard(user, id, body);
  }

  //* 게시판 삭제
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  deleteBoard(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.boardsService.deleteBoard(user, id);
  }

}
