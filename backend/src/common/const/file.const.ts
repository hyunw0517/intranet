//* 파일 저장 위치·제한 (FilesService, multer 옵션 공용)
// 업로드 파일은 처음부터 최종 위치에 저장하고, 대상(게시글 등)과의 연결은 DB(Files.targetType/targetId)로만 한다.
// (SNS처럼 temp → 최종 폴더로 옮기지 않으므로, 클라이언트가 보낸 파일 경로로 파일을 옮기는 경로 탐색 위험이 없다)

// 로컬 저장소 루트 경로는 .env의 UPLOAD_ROOT (LocalFileStorage에서만 읽는다)

// 저장 종류 = key 접두사. Files.path는 "<종류>/<KST 연>/<월>/<저장 파일명>" 형태로 저장한다. (예: images/2026/11/<uuid>.png) (로컬: 상대 경로, S3: 객체 키)
// - images: 에디터 본문 이미지. <img>는 Authorization 헤더를 보낼 수 없어 로그인 없이 uuid 주소로 공개한다.
// - attachments: 첨부파일. 비공개 - 각 업무 모듈이 권한을 확인한 뒤 FilesService로 스트리밍한다.
export enum FileKind {
    IMAGE = 'images',
    ATTACHMENT = 'attachments',
}

// 본문 이미지 썸네일 (앨범 그리드 등 목록용)
// 게시판 타입과 무관하게 모든 본문 이미지 업로드 시 만든다. (업로드 API는 게시판을 모르고, 일반 → 앨범 변경 시 바로 쓰기 위해)
// key: 원본 path에서 계산 (images/2026/11/<uuid>.png → thumbnails/2026/11/<uuid>.webp) → 원본 행만 있으면 찾을 수 있어 Files 행을 따로 두지 않는다.
export const THUMBNAIL_KEY_PREFIX = 'thumbnails';
// 첨부 이미지 썸네일 (비공개 - 업무 모듈이 권한을 확인한 뒤 준다. 예: 채팅 이미지 미리보기)
// 원본과 같은 폴더에 .webp로 두면 원래 webp인 첨부의 저장 이름과 겹칠 수 있어 접두사를 나눈다.
export const ATTACHMENT_THUMBNAIL_KEY_PREFIX = 'attachment-thumbnails';
export const THUMBNAIL_MAX_SIZE = 480;      // 긴 변 기준 px (그리드 카드 2배 밀도 대응)
export const THUMBNAIL_QUALITY = 75;        // webp 품질

// 본문 이미지 공개 주소 (브라우저 기준)
// /api 는 Next.js rewrite(개발)·Nginx(운영)가 떼고 NestJS의 GET /common/files/images/:storedName 으로 전달한다.
// 본문 HTML에는 이 주소가 그대로 저장되므로 sanitize 허용 패턴도 이 값을 기준으로 한다.
export const PUBLIC_IMAGE_URL_PREFIX = '/api/common/files/images/';
export const PUBLIC_THUMBNAIL_URL_PREFIX = '/api/common/files/thumbnails/';

// 저장 파일명: uuid + 확장자 (원본 파일명은 DB에만 둔다)
export const STORED_IMAGE_NAME_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/;

// 이미지: 확장자 → MIME (svg는 스크립트를 담을 수 있어 제외)
// 실제 형식은 저장 후 파일 앞부분(시그니처)으로 다시 확인한다.
export const IMAGE_MIME_BY_EXT: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
};
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024;         // 20MB (2026-11-13 사용자 결정, 이전 10MB)

// 첨부: 허용 확장자 (실행 파일·html·svg 등은 제외)
export const VIDEO_EXTENSIONS = [ '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv' ];
export const ATTACHMENT_EXTENSIONS = [
    '.pdf', '.txt', '.csv', '.zip',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.hwp', '.hwpx',
    ...Object.keys( IMAGE_MIME_BY_EXT ),
    ...VIDEO_EXTENSIONS,
];
export const MAX_ATTACHMENT_SIZE = 200 * 1024 * 1024;   // 200MB (동영상 포함, 2026-11-13 사용자 결정, 이전 100MB)

// 대상 하나에 연결할 수 있는 첨부 개수
export const MAX_ATTACHMENTS_PER_TARGET = 10;
