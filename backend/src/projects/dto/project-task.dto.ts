import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength, Min } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';
import { ProjectTaskStatus } from 'src/generated/prisma/client';
import { DATE_ONLY, DATE_ONLY_MESSAGE, EDITOR_HTML_MAX_LENGTH } from './project.dto';

//* 과제 생성 (참여자 누구나)
export class CreateProjectTaskDto {

    @IsString()
    @IsNotEmpty()
    @Length(1, 200)
    title: string;

    /** Tiptap HTML - 저장 시 허용 태그만 남긴다(본문 이미지 없음) */
    @IsString()
    @MaxLength(EDITOR_HTML_MAX_LENGTH)
    @IsOptional()
    @EmptyToNull()
    description?: string | null;

    /** 들어갈 컬럼 (기본 할 일). 컬럼 맨 아래에 붙는다. */
    @ApiProperty({ enum: ProjectTaskStatus, enumName: 'ProjectTaskStatus', required: false })
    @IsEnum(ProjectTaskStatus)
    @IsOptional()
    status?: ProjectTaskStatus;

    /** 담당자 (현재 참여자만, NULL = 담당자 없음) */
    @StringToNumber()
    @IsInt()
    @IsOptional()
    @EmptyToNull()
    assigneeId?: number | null;

    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    @IsOptional()
    @EmptyToNull()
    dueDate?: string | null;
}

//* 과제 수정 (보낸 항목만, 상태·순서는 이동 API로만)
export class UpdateProjectTaskDto extends PartialType( OmitType( CreateProjectTaskDto, [ 'status' ] as const ) ) {}

//* 칸반 이동 - 옮길 컬럼(상태)과 그 컬럼 안의 위치(0부터, 넘으면 맨 끝)
export class MoveProjectTaskDto {

    @ApiProperty({ enum: ProjectTaskStatus, enumName: 'ProjectTaskStatus' })
    @IsEnum(ProjectTaskStatus)
    status: ProjectTaskStatus;

    @StringToNumber()
    @IsInt()
    @Min(0)
    index: number;
}
