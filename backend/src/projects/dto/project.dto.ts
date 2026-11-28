import { applyDecorators } from '@nestjs/common';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';
import { PagePaginationDto } from 'src/common/dto/page-pagination.dto';
import { ProjectMemberRole, ProjectStatus } from 'src/generated/prisma/client';
import { sanitizeEditorHtml } from 'src/common/util/sanitize-html.util';

// 날짜만 받는다 ("2026-11-17"). @db.Date 컬럼에 저장
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const DATE_ONLY_MESSAGE = '날짜는 YYYY-MM-DD 형식입니다.';

// 부가세율(%) 검사 - 견적·매출·협력사 공용 (0~100, 소수 둘째 자리까지, 기본 10)
export const VatRateField = () => applyDecorators(
    StringToNumber(),
    IsNumber( { maxDecimalPlaces: 2 }, { message: '부가세율은 소수 둘째 자리까지 입력합니다.' } ),
    Min( 0 ),
    Max( 100 ),
    IsOptional(),
);

// 에디터 본문(HTML) 최대 길이 (태그까지 세므로 넉넉하게)
export const EDITOR_HTML_MAX_LENGTH = 50_000;

//* 프로젝트 생성 (USER 이상 누구나, 만든 사람 = 책임자)
export class CreateProjectDto {

    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    name: string;

    /** Tiptap HTML - 저장 시 허용 태그만 남긴다(본문 이미지 없음). 한도는 태그 포함 길이 (공용 에디터) */
    @IsString()
    @MaxLength(EDITOR_HTML_MAX_LENGTH)
    @IsOptional()
    @EmptyToNull()
    description?: string | null;

    @ApiProperty({ enum: ProjectStatus, enumName: 'ProjectStatus', required: false })
    @IsEnum(ProjectStatus)
    @IsOptional()
    status?: ProjectStatus;

    /** 시작·종료일 (선택, 둘 다 있으면 시작 <= 종료) */
    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    @IsOptional()
    @EmptyToNull()
    startDate?: string | null;

    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    @IsOptional()
    @EmptyToNull()
    endDate?: string | null;

    /** 거래처 (선택, 삭제되지 않은 거래처만 새로 연결할 수 있다) */
    @StringToNumber()
    @IsInt()
    @IsOptional()
    @EmptyToNull()
    clientId?: number | null;
}

//* 프로젝트 수정 (보낸 항목만, 책임자·관리자)
export class UpdateProjectDto extends PartialType( CreateProjectDto ) {}

//* 프로젝트 목록
// scope=mine(기본): 내가 참여한 프로젝트 / scope=all: 전체
export class ProjectListQueryDto extends PagePaginationDto {

    /** mine: 내가 참여한 프로젝트 / all: 전체 목록 (USER 이상 누구나, 목록에는 설명·금액 없음) */
    @ApiProperty({ enum: [ 'mine', 'all' ], required: false, default: 'mine' })
    @IsIn([ 'mine', 'all' ])
    @IsOptional()
    scope: 'mine' | 'all' = 'mine';

    @ApiProperty({ enum: ProjectStatus, enumName: 'ProjectStatus', required: false })
    @IsEnum(ProjectStatus)
    @IsOptional()
    status?: ProjectStatus;

    @StringToNumber()
    @IsInt()
    @IsOptional()
    clientId?: number;

    @IsString()
    @MaxLength(100)
    @IsOptional()
    search?: string;
}

//* 참여자 추가 (책임자·관리자)
export class AddProjectMemberDto {

    @StringToNumber()
    @IsInt()
    userId: number;

    @ApiProperty({ enum: ProjectMemberRole, enumName: 'ProjectMemberRole', required: false })
    @IsEnum(ProjectMemberRole)
    @IsOptional()
    role?: ProjectMemberRole;
}

//* 참여자 역할 수정 (책임자·관리자)
export class UpdateProjectMemberDto {

    @ApiProperty({ enum: ProjectMemberRole, enumName: 'ProjectMemberRole' })
    @IsEnum(ProjectMemberRole)
    role: ProjectMemberRole;
}

//* 에디터 본문 정제 (본문 이미지는 공개 주소라 모두 지운다)
// undefined(보내지 않음)는 그대로 두고, 빈 본문(<p></p> 등)은 null
export function toEditorHtml( value: string | null | undefined ): string | null | undefined {
    if ( value === undefined ) return undefined;
    return sanitizeEditorHtml( value, { allowImage: () => false } ).html;
}

//* "2026-11-17" → @db.Date에 넣을 Date (UTC 자정). null·undefined는 그대로
export function toDateOnly( value: string | null | undefined ): Date | null | undefined {
    if ( value === null || value === undefined ) return value;
    return new Date( `${value}T00:00:00.000Z` );
}
