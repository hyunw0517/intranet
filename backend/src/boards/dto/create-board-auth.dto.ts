import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';

//* 게시판 권한 규칙 입력 기준 DTO (Update는 이 클래스에서 파생)
// 조건(부서·최소 직급·허용 직책)은 비어 있으면 "해당 조건 없음", 모든 조건이 비어 있으면 전체 허용 규칙이다.
export class CreateBoardAuthDto {

    // 부서 id (NULL이면 부서 조건 없음)
    @IsInt()
    @IsOptional()
    @EmptyToNull()
    departmentId?: number | null;

    // 하위 부서 포함 여부 (부서 조건이 없으면 false로 저장)
    @IsBoolean()
    @IsOptional()
    includeSubDepartment?: boolean;

    // 최소 직급 id - 이 직급 이상 허용 (NULL이면 직급 조건 없음)
    @IsInt()
    @IsOptional()
    @EmptyToNull()
    positionId?: number | null;

    // 허용 직책 id 목록 (빈 배열이면 직책 조건 없음)
    @IsArray()
    @ArrayMaxSize(50)
    @ArrayUnique()
    @IsInt({ each: true })
    @IsOptional()
    jobTitleIds?: number[];

    // 다른 사람이 작성한 게시글/댓글 삭제 권한
    @IsBoolean()
    @IsOptional()
    authAdmin?: boolean;

    @IsBoolean()
    @IsOptional()
    authRead?: boolean;

    @IsBoolean()
    @IsOptional()
    authWrite?: boolean;

    @IsBoolean()
    @IsOptional()
    authComment?: boolean;

}
