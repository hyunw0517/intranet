import { Controller, Get, Query } from "@nestjs/common";
import { Roles } from "src/auth/decorator/roles.decorator";
import { UserRole } from "src/generated/prisma/client";
import { HolidayQueryDto } from "./dto/holiday-query.dto";
import { HolidaysService } from "./holidays.service";

//* 공휴일 - 대시보드 달력과 게시판 캘린더가 함께 쓴다.
@Controller('common/holidays')
export class HolidaysController {

    constructor(
        private readonly holidaysService: HolidaysService,
    ){}

    //* 그해 공휴일 [{ date: "2026-01-01", name: "1월1일" }]
    @Get()
    @Roles(UserRole.USER)
    findByYear( @Query() query: HolidayQueryDto ) {
        return this.holidaysService.findByYear( query.year );
    }
}
