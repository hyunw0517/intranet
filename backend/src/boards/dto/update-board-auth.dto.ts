import { PartialType } from '@nestjs/mapped-types';
import { CreateBoardAuthDto } from './create-board-auth.dto';

//* 게시판 권한 규칙 수정 DTO (모든 필드 선택, 생략한 필드는 기존 값 유지)
// - jobTitleIds: 생략하면 유지, 배열을 보내면 그 목록으로 전체 교체 (빈 배열이면 직책 조건 제거)
export class UpdateBoardAuthDto extends PartialType(CreateBoardAuthDto) {}
