import { Controller, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
import { Roles } from "src/auth/decorator/roles.decorator";
import { User } from "src/auth/decorator/user.decorator";
import { UserRole, Users } from "src/generated/prisma/client";
import { CalendarEventsQueryDto, IntegratedCalendarEventsQueryDto } from "./dto/calendar-events-query.dto";
import { PostsService } from "./posts.service";
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CalendarEventsResponse, RecentNoticeResponse } from './dto/post-response.dto';

//* 캘린더 일정 조회 (CLAUDE.md 5.3 캘린더 통합 조회)
// 통합 조회와 단일 게시판 조회가 같은 서비스를 쓴다. (단일 = boardIds가 [boardId]인 경우)
// 'events'는 BoardsController의 ':boardId'보다 먼저 등록되어야 한다. (BoardsModule에서 이 컨트롤러를 앞에 둠)
@ApiTags('Calendar (캘린더·최근 공지)')
@Controller('boards')
export class CalendarController {

    constructor(
        private readonly postsService: PostsService,
    ){}

    //* 최근 공지 (대시보드): 읽을 수 있는 공지 게시판을 합친 최신 글
    // 'recent-notices'도 BoardsController의 ':boardId'보다 먼저 등록되어야 해서 이 컨트롤러에 둔다.
    @Get('recent-notices')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '최근 공지 (대시보드)', description: '읽을 수 있는 공지 게시판을 합친 최신 글. 비밀글은 빼고, 익명 게시판의 작성자가 드러나지 않도록 작성자는 주지 않는다.' })
    getRecentNotices(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
    ): Promise<RecentNoticeResponse[]> {
        return this.postsService.findRecentNotices( user );
    }

    //* 통합 캘린더: 볼 수 있는 캘린더 게시판들의 일정
    @Get('events')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '통합 캘린더 일정', description: '볼 수 있는 캘린더 게시판들의 일정. boardIds를 생략하면 전체, 주면 그중 볼 수 있는 것만(교집합). 기간은 [start, end), 최대 62일. 쿼리의 "+09:00"은 %2B로 인코딩해야 한다.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패, 종료가 시작보다 뒤가 아님, 62일 초과' })
    getEvents(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Query() query: IntegratedCalendarEventsQueryDto,
    ): Promise<CalendarEventsResponse> {
        return this.postsService.findCalendarEvents( user, { boardIds: query.boardIds ?? null }, query.start, query.end );
    }

    //* 캘린더 게시판 하나의 일정 (읽기 권한이 없으면 404, 캘린더 게시판이 아니면 400)
    @Get(':boardId/events')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '캘린더 게시판 하나의 일정', description: '기간 규칙은 통합 캘린더와 같다.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패, 기간 규칙 위반, 캘린더 게시판이 아님' })
    @ApiNotFoundResponse({ description: '게시판이 없음, 또는 읽기 권한이 없음' })
    getBoardEvents(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Query() query: CalendarEventsQueryDto,
    ): Promise<CalendarEventsResponse> {
        return this.postsService.findCalendarEvents( user, { boardId }, query.start, query.end );
    }
}
