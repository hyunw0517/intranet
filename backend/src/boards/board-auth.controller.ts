import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { BoardAuthService } from "./board-auth.service";
import { Roles } from "src/auth/decorator/roles.decorator";
import { User } from "src/auth/decorator/user.decorator";
import { UserRole, Users } from "src/generated/prisma/client";
import { CreateBoardAuthDto } from "./dto/create-board-auth.dto";
import { UpdateBoardAuthDto } from "./dto/update-board-auth.dto";

// 게시판 권한 컨트롤러 (내비게이션 = 권한 판정 결과, 규칙 관리)
// 규칙은 게시판에 속하므로 게시판 하위 경로(boards/:boardId/auths)
@Controller('boards')
export class BoardAuthController {

  constructor( private readonly boardAuthService: BoardAuthService ) {}

  //* 게시판 내비게이션 (읽기 권한이 있는 게시판만 트리 순서로)
  // 'navigation'은 ':id'보다 먼저 등록되어야 한다. (BoardsModule에서 이 컨트롤러를 BoardsController보다 앞에 둠)
  @Get('navigation')
  @Roles(UserRole.USER)   // GUEST 차단 (서비스에도 방어 코드 있음)
  getUserBoardNavigate(
    @User() user: Pick<Users, 'id' | 'role'>,
  ){
    return this.boardAuthService.getUserBoardNavigate(user);
  }

  //* 게시판 권한 규칙 목록
  @Get(':boardId/auths')
  @Roles(UserRole.ADMIN)
  getBoardAuths(
    @Param('boardId', ParseIntPipe) boardId: number,
  ){
    return this.boardAuthService.getBoardAuths(boardId);
  }

  //* 게시판 권한 규칙 생성
  @Post(':boardId/auths')
  @Roles(UserRole.ADMIN)
  postBoardAuth(
    @User() user: Pick<Users, 'id'>,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Body() body: CreateBoardAuthDto,
  ){
    return this.boardAuthService.createBoardAuth(user, boardId, body);
  }

  //* 게시판 권한 규칙 수정
  @Patch(':boardId/auths/:id')
  @Roles(UserRole.ADMIN)
  patchBoardAuth(
    @User() user: Pick<Users, 'id'>,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateBoardAuthDto,
  ){
    return this.boardAuthService.updateBoardAuth(user, boardId, id, body);
  }

  //* 게시판 권한 규칙 삭제
  @Delete(':boardId/auths/:id')
  @Roles(UserRole.ADMIN)
  deleteBoardAuth(
    @User() user: Pick<Users, 'id'>,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.boardAuthService.deleteBoardAuth(user, boardId, id);
  }

}
