import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { BoardAuthService } from "./board-auth.service";
import { Roles } from "src/auth/decorator/roles.decorator";
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from "src/auth/decorator/user.decorator";
import { AdminPermission, UserRole, Users } from "src/generated/prisma/client";
import { CreateBoardAuthDto } from "./dto/create-board-auth.dto";
import { UpdateBoardAuthDto } from "./dto/update-board-auth.dto";
import { ApiBadRequestResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BoardAuthResponse, BoardNavItemResponse, CreatedIdResponse } from './dto/board-response.dto';

// 게시판 권한 컨트롤러 (내비게이션, 규칙 관리)
// 규칙은 게시판에 속해서 boards/:boardId/auths 아래에 둔다
@ApiTags('Board Auths (게시판 권한)')
@Controller('boards')
export class BoardAuthController {

  constructor( private readonly boardAuthService: BoardAuthService ) {}

  //* 게시판 내비게이션 (읽기 권한이 있는 게시판만 트리 순서로)
  // 'navigation'이 ':id'보다 먼저 등록돼야 해서 BoardsModule에서 이 컨트롤러를 앞에 둔다
  @Get('navigation')
  @Roles(UserRole.USER)   // GUEST 차단 (서비스에도 방어 코드 있음)
  @ApiOperation({ summary: '게시판 내비게이션', description: '읽기 권한이 있는 게시판만 트리 순서의 평평한 목록으로 준다. 가입 승인 전 회원은 빈 목록.' })
  getUserBoardNavigate(
    @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
  ): Promise<BoardNavItemResponse[]> {
    return this.boardAuthService.getUserBoardNavigate(user);
  }

  //* 게시판 권한 규칙 목록
  @Get(':boardId/auths')
  @RequireAdmin(AdminPermission.BOARDS)
  @ApiOperation({ summary: '(관리자) 게시판 권한 규칙 목록', description: '규칙이 없는 게시판은 관리자만 본다(기본 거부). 규칙의 조건(부서·최소 직급·허용 직책)은 비어 있으면 그 조건이 없는 것이고, 모두 비어 있으면 전체 허용 규칙이다.' })
  @ApiBadRequestResponse({ description: '존재하지 않는 게시판, 카테고리(권한을 둘 수 없음)' })
  getBoardAuths(
    @Param('boardId', ParseIntPipe) boardId: number,
  ): Promise<BoardAuthResponse[]> {
    return this.boardAuthService.getBoardAuths(boardId);
  }

  //* 게시판 권한 규칙 생성
  @Post(':boardId/auths')
  @RequireAdmin(AdminPermission.BOARDS)
  @ApiOperation({ summary: '(관리자) 게시판 권한 규칙 생성', description: '권한(관리·읽기·쓰기·댓글) 중 하나 이상을 골라야 한다. 부서 조건이 없으면 하위 부서 포함은 false로 저장한다.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 존재하지 않는 게시판·카테고리, 권한을 하나도 고르지 않음, 존재하지 않는 부서·직급·직책' })
  postBoardAuth(
    @User() user: Pick<Users, 'id'>,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Body() body: CreateBoardAuthDto,
  ): Promise<CreatedIdResponse> {
    return this.boardAuthService.createBoardAuth(user, boardId, body);
  }

  //* 게시판 권한 규칙 수정
  @Patch(':boardId/auths/:id')
  @RequireAdmin(AdminPermission.BOARDS)
  @ApiOperation({ summary: '(관리자) 게시판 권한 규칙 수정', description: '생략한 필드는 유지한다. jobTitleIds는 배열을 보내면 그 목록으로 전체 교체(빈 배열이면 직책 조건 제거). 응답 본문은 true.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 존재하지 않는 권한 규칙, 권한을 하나도 고르지 않음, 존재하지 않는 부서·직급·직책' })
  patchBoardAuth(
    @User() user: Pick<Users, 'id'>,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateBoardAuthDto,
  ): Promise<boolean> {
    return this.boardAuthService.updateBoardAuth(user, boardId, id, body);
  }

  //* 게시판 권한 규칙 삭제
  @Delete(':boardId/auths/:id')
  @RequireAdmin(AdminPermission.BOARDS)
  @ApiOperation({ summary: '(관리자) 게시판 권한 규칙 삭제', description: '응답 본문은 true.' })
  @ApiBadRequestResponse({ description: '존재하지 않는 권한 규칙' })
  deleteBoardAuth(
    @User() user: Pick<Users, 'id'>,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<boolean> {
    return this.boardAuthService.deleteBoardAuth(user, boardId, id);
  }

}
