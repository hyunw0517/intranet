import { Controller, Get } from "@nestjs/common";
import { Roles } from "src/auth/decorator/roles.decorator";
import { UserRole } from "src/generated/prisma/client";
import { AddonsService } from "./addons.service";
import { ApiOperation, ApiTags } from '@nestjs/swagger';

//* 켜진 애드온 목록 - 프론트가 메뉴·페이지·관리자 화면·대시보드 카드를 켜고 끄는 데 쓴다.
// 메뉴는 로그인 후에만 보이므로 USER 이상 (2026-11-09 사용자 결정)
@ApiTags('Addons (애드온)')
@Controller('common/addons')
export class AddonsController {

    constructor(
        private readonly addonsService: AddonsService,
    ){}

    //* 응답: { enabled: ["reservations", "approvals"] } (꺼진 애드온은 목록에 없음)
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '켜진 애드온 목록', description: '응답 `{ enabled: ["reservations", "approvals", ...] }`. 서버 `.env`의 ADDONS로 정하며 꺼진 애드온은 목록에 없다(API도 404). 프론트는 이 목록으로 메뉴·페이지·관리자 화면·대시보드 카드를 제어한다.' })
    findEnabled() {
        return this.addonsService.findEnabled();
    }
}
