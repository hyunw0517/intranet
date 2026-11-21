import { Controller, Get, Query } from "@nestjs/common";
import { Roles } from "src/auth/decorator/roles.decorator";
import { UserRole } from "src/generated/prisma/client";
import { HolidayQueryDto } from "./dto/holiday-query.dto";
import { HolidaysService } from "./holidays.service";
import { ApiBadRequestResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 공휴일 - 대시보드 달력과 게시판 캘린더가 함께 쓴다.
@ApiTags('Holidays (공휴일)')
@Controller('common/holidays')
export class HolidaysController {

    constructor(
        private readonly holidaysService: HolidaysService,
    ){}

    //* 그해 공휴일 [{ date: "2026-01-01", name: "1월1일" }]
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '그해 공휴일', description: '응답 `[{ date: "2026-01-01", name: "1월1일" }]`. 한국천문연구원 특일 정보 API를 서버가 호출해 연도별로 하루 캐시한다. 외부 호출이 실패하면 이전 값(없으면 빈 목록)을 주고 10분 뒤 다시 시도한다(오류로 응답하지 않는다). 올해 앞뒤 2년 밖의 연도는 빈 목록.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패 (year는 1900~2100 정수)' })
    findByYear( @Query() query: HolidayQueryDto ) {
        return this.holidaysService.findByYear( query.year );
    }
}
