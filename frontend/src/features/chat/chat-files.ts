// 채팅 파일 규칙 (features.md 8.4) - 채팅 기능 안에서만 쓴다. 최종 판단은 서버, 여기는 보내기 전에 미리 막는 용도.
import {
  CHAT_FILE_EXTENSIONS,
  CHAT_FILE_MAX_SIZE,
  CHAT_FILES_PER_SEND,
  CHAT_IMAGE_EXTENSIONS,
  CHAT_IMAGE_MAX_SIZE,
  CHAT_VIDEO_EXTENSIONS,
  type ChatFileKind,
} from "@/services/api/chats";

export function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

// 종류는 확장자로 (서버 chatFileKind와 같은 규칙)
export function fileKindOf(name: string): ChatFileKind {
  const ext = fileExtension(name);
  if (CHAT_IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (CHAT_VIDEO_EXTENSIONS.includes(ext)) return "video";
  return "file";
}

// 압축 파일 (아이콘만 다르게, 서버 분류는 "file")
const ARCHIVE_EXTENSIONS = [".zip"];
export function isArchive(name: string) {
  return ARCHIVE_EXTENSIONS.includes(fileExtension(name));
}

// 보내기 전 검사 → 문제가 있으면 안내 문구 (하나라도 걸리면 아무것도 보내지 않는다)
export function validateChatFiles(files: File[]): string | null {
  if (files.length > CHAT_FILES_PER_SEND) return `한 번에 최대 ${CHAT_FILES_PER_SEND}개까지 보낼 수 있습니다.`;
  const badType = files.find((f) => !CHAT_FILE_EXTENSIONS.includes(fileExtension(f.name)));
  if (badType) return `보낼 수 없는 파일 형식입니다: ${badType.name}`;
  // 이미지는 장당 20MB(본문 이미지와 같음), 그 밖의 파일은 200MB (서버도 경로별로 같은 한도)
  const bigImage = files.find((f) => fileKindOf(f.name) === "image" && f.size > CHAT_IMAGE_MAX_SIZE);
  if (bigImage) return `이미지는 ${CHAT_IMAGE_MAX_SIZE / 1024 / 1024}MB까지 보낼 수 있습니다: ${bigImage.name}`;
  const tooBig = files.find((f) => fileKindOf(f.name) !== "image" && f.size > CHAT_FILE_MAX_SIZE);
  if (tooBig) return `${CHAT_FILE_MAX_SIZE / 1024 / 1024}MB를 넘는 파일은 보낼 수 없습니다: ${tooBig.name}`;
  return null;
}

// 요청 묶기: 이미지는 한 요청(묶음 메시지 1개), 동영상·그 밖의 파일은 하나씩 (2026-11-13 사용자 결정)
// 보내는 순서는 고른 순서를 따르고, 이미지 묶음은 첫 이미지 자리에 둔다.
export function groupForSend(files: File[]): File[][] {
  const groups: File[][] = [];
  let images: File[] | null = null;

  for (const file of files) {
    if (fileKindOf(file.name) === "image") {
      if (!images) {
        images = [];
        groups.push(images);
      }
      images.push(file);
    } else {
      groups.push([file]);
    }
  }

  return groups;
}

// 한 요청 안에서 보낸 바이트로 "업로드가 끝난 파일 수"를 센다.
// 앞에서부터 파일 크기를 더한 경계를 넘으면 그 파일은 다 보낸 것. 마지막 파일은 서버 응답이 와야 끝난 것으로 본다.
export function filesSent(files: File[], loaded: number) {
  let sum = 0;
  let count = 0;
  for (const file of files) {
    sum += file.size;
    if (loaded >= sum) count += 1;
  }
  return Math.min(count, files.length - 1);
}

// Blob을 파일로 저장 (Bearer 헤더가 필요해 <a href>를 바로 쓸 수 없어서 임시 blob: 주소로 내려받는다)
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 클릭 직후 바로 해제하면 일부 브라우저에서 저장이 시작되기 전에 끊길 수 있어 조금 뒤에 해제
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
