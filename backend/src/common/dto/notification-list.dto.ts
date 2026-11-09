import { IsBoolean, IsOptional } from "class-validator";
import { StringToBoolean } from "../decorator/string-to-boolean.decorator";
import { CursorPaginationDto } from "./cursor-pagination.dto";

//* 내 알림 목록 (커서 페이지네이션, 항상 최신순 - order는 쓰지 않는다)
export class NotificationListDto extends CursorPaginationDto {
    // true면 안 읽은 알림만
    @StringToBoolean()
    @IsBoolean()
    @IsOptional()
    unreadOnly?: boolean;
}
