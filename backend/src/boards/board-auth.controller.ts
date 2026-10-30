import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { BoardAuthService } from "./board-auth.service";
import { Roles } from "src/auth/decorator/roles.decorator";
import { User } from "src/auth/decorator/user.decorator";
import { UserRole, Users } from "src/generated/prisma/client";
import { CreateBoardAuthDto } from "./dto/create-board-auth.dto";
import { UpdateBoardAuthDto } from "./dto/update-board-auth.dto";

// 게시판 권한 규칙 전용 컨트롤러 (규칙은 게시판에 속하므로 게시판 하위 경로)
@Controller('boards/:boardId/auths')
export class BoardAuthController {

  constructor( private readonly boardAuthService: BoardAuthService ) {}

  //* 게시판 권한 규칙 목록
  @Get()
  @Roles(UserRole.ADMIN)
  getBoardAuths(
    @Param('boardId', ParseIntPipe) boardId: number,
  ){
    return this.boardAuthService.getBoardAuths(boardId);
  }

  //* 게시판 권한 규칙 생성
  @Post()
  @Roles(UserRole.ADMIN)
  postBoardAuth(
    @User() user: Pick<Users, 'id'>,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Body() body: CreateBoardAuthDto,
  ){
    return this.boardAuthService.createBoardAuth(user, boardId, body);
  }

  //* 게시판 권한 규칙 수정
  @Patch(':id')
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
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  deleteBoardAuth(
    @User() user: Pick<Users, 'id'>,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.boardAuthService.deleteBoardAuth(user, boardId, id);
  }

}
