import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { BoardsService } from './boards.service';
import { BoardAuthService } from './board-auth.service';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, UserRole, Users } from 'src/generated/prisma/client';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { UpdateBoardOrderDto } from './dto/update-board-order.dto';

@Controller('boards')
export class BoardsController {

  constructor(
    private readonly boardsService: BoardsService,
    private readonly boardAuthService: BoardAuthService,
  ) {}

  //* 관리자 전체 게시판 조회 (트리 순서, 페이지네이션 없음)
  // 'admin'은 ':id'보다 먼저 선언해야 한다. (뒤에 두면 'admin'이 :id로 매칭되어 ParseIntPipe 400)
  @Get('admin')
  @RequireAdmin(AdminPermission.BOARDS)
  getAdminBoards() {
    return this.boardsService.getAdminBoards();
  }

  //* 게시글 작성 시 게시판 권한 조회 (게시판 정보 + 권한 반환)
  @Get(':boardId')
  @Roles(UserRole.USER)
  getBoard(
    @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
    @Param('boardId', ParseIntPipe) boardId: number,
  ){
    return this.boardAuthService.assertBoardPermission( boardId, user, 'read' );
  }

  //* 게시판 생성
  @Post()
  @RequireAdmin(AdminPermission.BOARDS)
  postBoard(
    @User() user: Pick<Users, 'id'>,
    @Body() body: CreateBoardDto,
  ){
    return this.boardsService.createBoard(user, body);
  }

  //* 게시판 순서 변경 (드래그 정렬, 같은 상위 게시판의 형제끼리)
  // 'order'는 ':id'보다 먼저 선언해야 한다.
  @Patch('order')
  @RequireAdmin(AdminPermission.BOARDS)
  patchBoardOrder(
    @User() user: Pick<Users, 'id'>,
    @Body() body: UpdateBoardOrderDto,
  ){
    return this.boardsService.updateBoardOrder(user, body);
  }

  //* 게시판 수정
  @Patch(':id')
  @RequireAdmin(AdminPermission.BOARDS)
  patchBoard(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateBoardDto,
  ){
    return this.boardsService.updateBoard(user, id, body);
  }

  //* 게시판 삭제
  @Delete(':id')
  @RequireAdmin(AdminPermission.BOARDS)
  deleteBoard(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.boardsService.deleteBoard(user, id);
  }

}
