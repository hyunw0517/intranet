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
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminBoardItemResponse, BoardResponse, BoardWithPermResponse } from './dto/board-response.dto';

@ApiTags('Boards (게시판)')
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
  @ApiOperation({ summary: '(관리자) 게시판 전체 목록', description: '트리 순서의 평평한 목록, 페이지 없음. 게시글 수·권한 규칙 수 포함(권한 규칙이 없는 게시판은 관리자만 본다).' })
  getAdminBoards(): Promise<AdminBoardItemResponse[]> {
    return this.boardsService.getAdminBoards();
  }

  //* 게시글 작성 시 게시판 권한 조회 (게시판 정보 + 권한 반환)
  @Get(':boardId')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: '게시판 정보 + 내 권한', description: '글쓰기 화면 등에서 게시판 정보와 내 권한(읽기·쓰기·댓글·관리)을 확인한다.' })
  @ApiNotFoundResponse({ description: '게시판이 없음, 카테고리, 또는 읽기 권한이 없음 (게시판이 있다는 사실도 숨긴다)' })
  getBoard(
    @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
    @Param('boardId', ParseIntPipe) boardId: number,
  ): Promise<BoardWithPermResponse> {
    return this.boardAuthService.assertBoardPermission( boardId, user, 'read' );
  }

  //* 게시판 생성
  @Post()
  @RequireAdmin(AdminPermission.BOARDS)
  @ApiOperation({ summary: '(관리자) 게시판 생성', description: '계층은 최대 2단계: 카테고리는 최상위에만, 상위 게시판은 카테고리만. 같은 상위 게시판 아래 맨 뒤 순서로 추가한다. 권한 규칙을 만들기 전에는 관리자만 볼 수 있다.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 카테고리를 하위에 둠, 존재하지 않는 상위 게시판, 상위가 카테고리가 아님, 캘린더가 아닌데 휴가자 표시, 같은 상위 게시판에 같은 게시판명' })
  postBoard(
    @User() user: Pick<Users, 'id'>,
    @Body() body: CreateBoardDto,
  ): Promise<BoardResponse> {
    return this.boardsService.createBoard(user, body);
  }

  //* 게시판 순서 변경 (드래그 정렬, 같은 상위 게시판의 형제끼리)
  // 'order'는 ':id'보다 먼저 선언해야 한다.
  @Patch('order')
  @RequireAdmin(AdminPermission.BOARDS)
  @ApiOperation({ summary: '(관리자) 게시판 순서 변경 (드래그 정렬)', description: '같은 상위 게시판 아래의 형제끼리만 바꾼다. 보낸 id 배열이 그 형제 전체와 정확히 일치해야 한다. 응답 본문은 true.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 보낸 id 목록이 현재 형제 게시판과 다름(새로고침 필요)' })
  patchBoardOrder(
    @User() user: Pick<Users, 'id'>,
    @Body() body: UpdateBoardOrderDto,
  ): Promise<boolean> {
    return this.boardsService.updateBoardOrder(user, body);
  }

  //* 게시판 수정
  @Patch(':id')
  @RequireAdmin(AdminPermission.BOARDS)
  @ApiOperation({ summary: '(관리자) 게시판 수정', description: '타입 변경 제한: 하위 게시판이 있는 카테고리는 타입을 바꿀 수 없고, 게시글이 있는 게시판은 카테고리·캘린더로(또는 캘린더에서) 바꿀 수 없다. 캘린더가 아닌 타입으로 바꾸면 휴가자 표시는 자동으로 꺼진다.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 존재하지 않는 게시판, 계층 규칙 위반, 타입 변경 제한, 캘린더가 아닌데 휴가자 표시, 같은 상위 게시판에 같은 게시판명' })
  patchBoard(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateBoardDto,
  ): Promise<BoardResponse> {
    return this.boardsService.updateBoard(user, id, body);
  }

  //* 게시판 삭제
  @Delete(':id')
  @RequireAdmin(AdminPermission.BOARDS)
  @ApiOperation({ summary: '(관리자) 게시판 삭제', description: '하위 게시판이 있는 카테고리는 지울 수 없다. 게시판의 권한 규칙은 함께 지우고 게시글은 그대로 둔다(게시판을 복구하면 다시 보인다). 응답 본문은 true.' })
  @ApiBadRequestResponse({ description: '존재하지 않는 게시판, 하위 게시판이 있는 카테고리' })
  deleteBoard(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<boolean> {
    return this.boardsService.deleteBoard(user, id);
  }

}
