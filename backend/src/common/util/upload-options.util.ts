import { BadRequestException } from "@nestjs/common";
import { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { memoryStorage } from "multer";
import { extname } from "path";
import { ATTACHMENT_EXTENSIONS, IMAGE_MIME_BY_EXT, MAX_ATTACHMENT_SIZE, MAX_ATTACHMENTS_PER_TARGET, MAX_IMAGE_SIZE } from "../const/file.const";

//* 엔드포인트별 multer 옵션 (FileInterceptor에 넘긴다)
// 전역 설정 하나로는 이미지·첨부의 제한을 나눌 수 없어 업로드 종류마다 만든다.
// memoryStorage로 받고 저장은 FilesService가 한다 (diskStorage면 S3로 바꿀 때 업로드 경로까지 고쳐야 한다).
// 첨부 200MB까지 메모리에 올라오므로, S3를 쓰게 되면 대용량은 presigned URL 직접 업로드로 바꾼다.
function uploadOptions(
    maxSize: number,
    allowedExtensions: string[],
    errorMessage: string,
    maxFiles = 1,
): MulterOptions {
    return {
        // 브라우저는 한글 파일명을 UTF-8로 보내지만 multer(busboy) 기본값은 latin1이라 글자가 깨진다.
        defParamCharset: 'utf8',
        limits: {
            fileSize: maxSize,  // 초과 시 413 (PayloadTooLargeException)
            files: maxFiles,    // 기본은 요청 하나에 파일 하나 (여러 개는 프론트가 하나씩 올린다)
        },
        // 확장자 1차 검사 (클라이언트가 보낸 이름이므로 이미지는 시그니처로 다시 확인)
        fileFilter: ( _req, file, cb ) => {
            const ext = extname( file.originalname ).toLowerCase();
            if ( !allowedExtensions.includes( ext ) ) {
                return cb( new BadRequestException( errorMessage ), false );
            }
            cb( null, true );
        },
        storage: memoryStorage(),
    };
}

export const IMAGE_UPLOAD_OPTIONS = uploadOptions(
    MAX_IMAGE_SIZE,
    Object.keys( IMAGE_MIME_BY_EXT ),
    'png, jpg, gif, webp 이미지만 업로드할 수 있습니다.',
);

export const ATTACHMENT_UPLOAD_OPTIONS = uploadOptions(
    MAX_ATTACHMENT_SIZE,
    ATTACHMENT_EXTENSIONS,
    `업로드할 수 없는 파일 형식입니다. (${ATTACHMENT_EXTENSIONS.join(', ')})`,
);

//* 첨부로 받는 이미지 여러 장 (비공개 이미지 묶음. 예: 채팅 이미지 메시지)
// 장당 MAX_IMAGE_SIZE, 최대 MAX_ATTACHMENTS_PER_TARGET장 (요청 하나 최대 200MB)
// 파일이 모두 메모리에 올라오므로 한도는 받은 뒤가 아니라 multer에서 걸어야 한다.
const IMAGE_EXTENSIONS = Object.keys( IMAGE_MIME_BY_EXT );
export const ATTACHMENT_IMAGES_UPLOAD_OPTIONS = uploadOptions(
    MAX_IMAGE_SIZE,
    IMAGE_EXTENSIONS,
    'png, jpg, gif, webp 이미지만 보낼 수 있습니다.',
    MAX_ATTACHMENTS_PER_TARGET,
);

//* 이미지가 아닌 첨부 하나 (동영상·문서 등. 예: 채팅 파일 메시지)
// 이미지 확장자는 받지 않는다 (이미지가 20MB 한도를 피해 200MB로 올라오지 않게)
const NON_IMAGE_ATTACHMENT_EXTENSIONS = ATTACHMENT_EXTENSIONS.filter( ( ext ) => !IMAGE_EXTENSIONS.includes( ext ) );
export const ATTACHMENT_NON_IMAGE_UPLOAD_OPTIONS = uploadOptions(
    MAX_ATTACHMENT_SIZE,
    NON_IMAGE_ATTACHMENT_EXTENSIONS,
    `보낼 수 없는 파일 형식입니다. 이미지는 이미지 보내기로 보내 주세요. (${NON_IMAGE_ATTACHMENT_EXTENSIONS.join(', ')})`,
);
