// 업로드 파일 정보 (백엔드 FilesService FileInfo, 게시글·결재 문서 첨부 공용)
export interface FileInfo {
  id: number;
  originalName: string;
  size: number; // bytes
  mimeType: string;
  url: string | null; // 본문 이미지만 공개 주소(/api/common/files/images/...), 첨부는 null
  thumbnailUrl: string | null; // 본문 이미지 썸네일(/api/common/files/thumbnails/...), 첨부는 null
}
