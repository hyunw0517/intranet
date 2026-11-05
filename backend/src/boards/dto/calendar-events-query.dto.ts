import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsDate, IsInt, IsOptional } from "class-validator";
import { StringToDate } from "src/common/decorator/string-to-date.decorator";

//* 캘린더 일정 조회 기간 (start 이상 ~ end 미만, 시간대가 있는 ISO 문자열)
// 화면은 달력에 보이는 칸 범위(첫 주 일요일 00:00 ~ 마지막 주 토요일 다음 날 00:00, KST)를 보낸다.
// 쿼리 문자열의 "+09:00"은 URL 인코딩(%2B)해서 보내야 한다. (+가 공백으로 바뀜)
export class CalendarEventsQueryDto {

    @StringToDate()
    @IsDate()
    start: Date;

    @StringToDate()
    @IsDate()
    end: Date;
}

//* 통합 캘린더 조회 (여러 캘린더 게시판)
// boardIds를 생략하면 볼 수 있는 캘린더 게시판 전체, 주면 그중 볼 수 있는 것만 (교집합)
export class IntegratedCalendarEventsQueryDto extends CalendarEventsQueryDto {

    // "1,2,3" 또는 boardIds=1&boardIds=2 둘 다 받는다.
    @Transform( ({ value }) => {
        if ( value === undefined || value === '' ) return undefined;
        const list = Array.isArray( value ) ? value : String( value ).split(',');
        return list.map( ( v ) => Number( v ) );
    })
    @IsArray()
    @IsInt({ each: true })
    @ArrayMaxSize(50)
    @IsOptional()
    boardIds?: number[];
}
