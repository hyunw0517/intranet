import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { EmptyToNull } from "src/common/decorator/empty-to-null.decorator";
import { PagePaginationDto } from "src/common/dto/page-pagination.dto";
import { MAX_ATTACHMENTS_PER_TARGET } from "src/common/const/file.const";
import { ApprovalDocumentType, ApprovalStatus } from "src/generated/prisma/client";
import { ApprovalBox, MAX_APPROVAL_STEPS } from "../const/approval.const";
import { ApprovalStepInputDto } from "./approval-line.dto";

//* 결재 문서 임시저장(DRAFT) 생성 - 상신은 PATCH :id/submit 따로 (2026-11-10 사용자 결정)
// 결재라인은 비워 둘 수 있다. (상신할 때 검사)
export class CreateApprovalDocumentDto {

    @IsEnum(ApprovalDocumentType)
    documentType: ApprovalDocumentType;

    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    title: string;

    // Tiptap HTML (백엔드에서 허용 태그만 남긴다, 본문 이미지는 쓰지 않음)
    @IsString()
    @IsOptional()
    content?: string | null;

    @IsArray()
    @ArrayMaxSize(MAX_APPROVAL_STEPS)
    @ValidateNested({ each: true })
    @Type(() => ApprovalStepInputDto)
    @IsOptional()
    steps?: ApprovalStepInputDto[];

    // 불러온 템플릿 (기록용)
    @IsInt()
    @IsOptional()
    approvalLineTemplateId?: number | null;

    // 먼저 업로드한 첨부 id (POST /common/files/attachments), 순서 = 표시 순서
    @IsArray()
    @ArrayMaxSize(MAX_ATTACHMENTS_PER_TARGET)
    @IsInt({ each: true })
    @IsOptional()
    attachmentIds?: number[];
}

//* 임시저장 수정 - 보낸 항목만 바꾼다. steps·attachmentIds는 보내면 전체 교체
export class UpdateApprovalDocumentDto {

    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    content?: string | null;

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

//* 승인 (의견 선택)
export class ApproveDocumentDto {

    @IsString()
    @MaxLength(1000)
    @IsOptional()
    @EmptyToNull()
    comment?: string | null;
}

//* 반려 (의견 필수)
export class RejectDocumentDto {

    @IsString()
    @IsNotEmpty({ message: '반려 의견을 입력해야 합니다.' })
    @MaxLength(1000)
    comment: string;
}

//* 관리자 결재자 교체
export class ReplaceApproverDto {

    @IsInt()
    approverId: number;
}

//* 결재함 목록
export class ApprovalDocumentListQueryDto extends PagePaginationDto {

    @IsEnum(ApprovalBox)
    box: ApprovalBox;

    // 기안함(mine)·결재 완료(processed)·전체(all)에서 문서 상태 필터
    @IsEnum(ApprovalStatus)
    @IsOptional()
    status?: ApprovalStatus;
}
