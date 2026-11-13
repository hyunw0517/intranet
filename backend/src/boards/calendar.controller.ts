import { Controller, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
import { Roles } from "src/auth/decorator/roles.decorator";
import { User } from "src/auth/decorator/user.decorator";
import { UserRole, Users } from "src/generated/prisma/client";
import { CalendarEventsQueryDto, IntegratedCalendarEventsQueryDto } from "./dto/calendar-events-query.dto";
import { PostsService } from "./posts.service";

//* 캘린더 일정 조회 (CLAUDE.md 5.3 캘린더 통합 조회)
// 통합 조회와 단일 게시판 조회가 같은 서비스를 쓴다. (단일 = boardIds가 [boardId]인 경우)
// 'events'는 BoardsController의 ':boardId'보다 먼저 등록되어야 한다. (BoardsModule에서 이 컨트롤러를 앞에 둠)
@Controller('boards')
export class CalendarController {

    constructor(
        private readonly postsService: PostsService,
    ){}

    //* 통합 캘린더: 볼 수 있는 캘린더 게시판들의 일정
    @Get('events')
    @Roles(UserRole.USER)
    getEvents(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Query() query: IntegratedCalendarEventsQueryDto,
    ){
        return this.postsService.findCalendarEvents( user, { boardIds: query.boardIds ?? null }, query.start, query.end );
    }

    //* 캘린더 게시판 하나의 일정 (읽기 권한이 없으면 404, 캘린더 게시판이 아니면 400)
    @Get(':boardId/events')
    @Roles(UserRole.USER)
    getBoardEvents(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Query() query: CalendarEventsQueryDto,
    ){
        return this.postsService.findCalendarEvents( user, { boardId }, query.start, query.end );
    }
}
