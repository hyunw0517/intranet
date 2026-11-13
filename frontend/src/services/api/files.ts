// 백엔드 files.controller 대응 (/common/files/*)
// 업로드는 "먼저 업로드 → 글 저장 시 id(첨부) 또는 본문 <img>(이미지)로 연결" 방식이다.
// 연결되지 않은 파일은 다른 사람이 쓸 수 없고, 글에 연결될 때까지 어디에도 표시되지 않는다.
import { apiFetch } from "@/services/api-client";
import type { FileInfo } from "@/types/file";

// 서버 제한과 같게 둔다. (프론트 검사는 안내용, 실제 차단은 서버 - 413/400)
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
export const ATTACHMENT_EXTENSIONS = [
  ".pdf", ".txt", ".csv", ".zip",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".hwp", ".hwpx",
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".mp4", ".mov", ".avi", ".mkv", ".webm", ".wmv",
];
export const MAX_ATTACHMENT_SIZE = 200 * 1024 * 1024; // 200MB
export const MAX_ATTACHMENTS = 10; // 게시글당

function upload(kind: "images" | "attachments", file: File) {
  const body = new FormData();
  body.append("file", file); // 필드명 file (FileInterceptor('file'))
  return apiFetch<FileInfo>(`/common/files/${kind}`, { method: "POST", body });
}

// 본문 이미지 → 응답 url을 <img src>로 넣는다. (png·jpg·gif·webp, 실제 형식도 서버가 확인)
export function uploadImage(file: File) {
  return upload("images", file);
}

// 첨부파일 → 응답 id를 글 저장 시 attachmentIds로 보낸다.
export function uploadAttachment(file: File) {
  return upload("attachments", file);
}

// 확장자·용량 안내용 검사 (통과 못 하면 오류 메시지)
export function checkUploadFile(file: File, extensions: string[], maxSize: number): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (!extensions.includes(ext)) return `${file.name}: 올릴 수 없는 형식입니다.`;
  if (file.size > maxSize) return `${file.name}: ${Math.round(maxSize / 1024 / 1024)}MB 이하만 올릴 수 있습니다.`;
  return null;
}
