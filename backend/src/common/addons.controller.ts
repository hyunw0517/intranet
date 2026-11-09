import { Controller, Get } from "@nestjs/common";
import { Roles } from "src/auth/decorator/roles.decorator";
import { UserRole } from "src/generated/prisma/client";
import { AddonsService } from "./addons.service";

//* 켜진 애드온 목록 - 프론트가 메뉴·페이지·관리자 화면·대시보드 카드를 켜고 끄는 데 쓴다.
// 메뉴는 로그인 후에만 보이므로 USER 이상 (2026-11-09 사용자 결정)
@Controller('common/addons')
export class AddonsController {

    constructor(
        private readonly addonsService: AddonsService,
    ){}

    //* 응답: { enabled: ["reservations", "approvals"] } (꺼진 애드온은 목록에 없음)
    @Get()
    @Roles(UserRole.USER)
    findEnabled() {
        return this.addonsService.findEnabled();
    }
}
