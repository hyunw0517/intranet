import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsDate, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { PagePaginationDto } from "src/common/dto/page-pagination.dto";
import { MAX_ATTACHMENTS_PER_TARGET } from "src/common/const/file.const";
import { StringToDate } from "src/common/decorator/string-to-date.decorator";
import { StringToNumber } from "src/common/decorator/string-to-number.decorator";
import { LeaveType, LeaveUnit } from "src/generated/prisma/client";
import { MAX_APPROVAL_STEPS } from "../../const/approval.const";
import { ApprovalStepInputDto } from "../../dto/approval-line.dto";

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

//* 휴가 신청 임시저장 (POST /approvals/leaves) - 상신은 결재 문서 API(PATCH /approvals/documents/:id/submit)
// 제목은 서버가 유형·기간으로 만든다. 결재라인은 비워 둘 수 있다(상신할 때 검사).
export class CreateLeaveDto {

    @IsEnum(LeaveType)
    type: LeaveType;

    @IsEnum(LeaveUnit)
    unit: LeaveUnit;

    @Matches(DATE_PATTERN, { message: '시작일은 YYYY-MM-DD 형식이어야 합니다.' })
    startDate: string;

    // 종일만 사용 (비우면 시작일 하루)
    @Matches(DATE_PATTERN, { message: '종료일은 YYYY-MM-DD 형식이어야 합니다.' })
    @IsOptional()
    endDate?: string | null;

    // 반차·반반차만 사용 (30분 단위, 종료 시각은 서버가 채움)
    @Matches(TIME_PATTERN, { message: '시작 시각은 HH:mm 형식이어야 합니다.' })
    @IsOptional()
    startTime?: string | null;

    @IsString()
    @MaxLength(500)
    @IsOptional()
    reason?: string | null;

    @IsArray()
    @ArrayMaxSize(MAX_APPROVAL_STEPS)
    @ValidateNested({ each: true })
    @Type(() => ApprovalStepInputDto)
    @IsOptional()
    steps?: ApprovalStepInputDto[];

    @IsInt()
    @IsOptional()
    approvalLineTemplateId?: number | null;

    // 먼저 업로드한 첨부 id (진단서 등)
    @IsArray()
    @ArrayMaxSize(MAX_ATTACHMENTS_PER_TARGET)
    @IsInt({ each: true })
    @IsOptional()
    attachmentIds?: number[];
}

//* 휴가 신청 임시저장 수정 (PATCH /approvals/leaves/documents/:documentId) - 보낸 항목만 바꾼다
// 휴가 항목(type·unit·startDate·endDate·startTime)은 보낸 값과 저장된 값을 합쳐 다시 검사한다.
export class UpdateLeaveDto {

    @IsEnum(LeaveType)
    @IsOptional()
    type?: LeaveType;

    @IsEnum(LeaveUnit)
    @IsOptional()
    unit?: LeaveUnit;

    @Matches(DATE_PATTERN, { message: '시작일은 YYYY-MM-DD 형식이어야 합니다.' })
    @IsOptional()
    startDate?: string;

    @Matches(DATE_PATTERN, { message: '종료일은 YYYY-MM-DD 형식이어야 합니다.' })
    @IsOptional()
    endDate?: string | null;

    @Matches(TIME_PATTERN, { message: '시작 시각은 HH:mm 형식이어야 합니다.' })
    @IsOptional()
    startTime?: string | null;

    @IsString()
    @MaxLength(500)
    @IsOptional()
    reason?: string | null;

    @IsArray()
    @ArrayMaxSize(MAX_APPROVAL_STEPS)
    @ValidateNested({ each: true })
    @Type(() => ApprovalStepInputDto)
    @IsOptional()
    steps?: ApprovalStepInputDto[];

    @IsInt()
    @IsOptional()
    approvalLineTemplateId?: number | null;

    @IsArray()
    @ArrayMaxSize(MAX_ATTACHMENTS_PER_TARGET)
    @IsInt({ each: true })
    @IsOptional()
    attachmentIds?: number[];
}

//* 연도 조회 (비우면 올해, KST)
export class LeaveYearQueryDto {

    @StringToNumber()
    @IsInt()
    @Min(2000)
    @Max(2100)
    @IsOptional()
    year?: number;
}

//* 캘린더 휴가자 조회 기간 - 게시판 캘린더(CalendarEventsQueryDto)와 같은 형식 (start 이상 ~ end 미만, 시간대가 있는 ISO 문자열)
// 화면이 달력 칸 범위를 게시판 일정 조회와 똑같이 보내면 된다. KST 날짜로 바꿔 쓴다.
export class LeaveCalendarQueryDto {

    @StringToDate()
    @IsDate()
    start: Date;

    @StringToDate()
    @IsDate()
    end: Date;
}

//* 관리자 연차 현황 목록
export class LeaveGrantListQueryDto extends PagePaginationDto {

    @StringToNumber()
    @IsInt()
    @Min(2000)
    @Max(2100)
    @IsOptional()
    year?: number;

    // 이름·사번 검색
    @IsString()
    @IsOptional()
    search?: string;
}

//* 관리자 조정 (올해, 또는 12월에 미리 만든 다음 해) - 조정값은 누적이 아니라 그 연도의 조정 총합
export class AdjustLeaveGrantDto {

    // 비우면 올해
    @IsInt()
    @Min(2000)
    @Max(2100)
    @IsOptional()
    year?: number;

    // 매년 초기화되는 조정값 (그 연도 행에만, 새해에는 0) - 이월·포상·차감, 입사한 해의 월 단위 보정
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(-99)
    @Max(99)
    adjustDays: number;

    // 0이 아니면 사유 필수 (서비스에서 검사)
    @IsString()
    @MaxLength(200)
    @IsOptional()
    adjustReason?: string | null;

    // 영구 조정값 (매년 더함, 올해부터 반영) - 임원 전입 등 근속 인정. 입사한 해에는 적용하지 않는다
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(-99)
    @Max(99)
    permanentDays: number;

    // 0이 아니면 사유 필수
    @IsString()
    @MaxLength(200)
    @IsOptional()
    permanentReason?: string | null;
}
