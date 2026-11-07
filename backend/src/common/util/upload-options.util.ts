import { BadRequestException } from "@nestjs/common";
import { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { memoryStorage } from "multer";
import { extname } from "path";
import { ATTACHMENT_EXTENSIONS, IMAGE_MIME_BY_EXT, MAX_ATTACHMENT_SIZE, MAX_IMAGE_SIZE } from "../const/file.const";

//* 엔드포인트별 multer 옵션 (FileInterceptor에 넘긴다)
// 전역 MulterModule.register 하나로 두면 이미지·첨부의 용량·확장자 제한을 나눌 수 없어 업로드 종류마다 만든다.
//
// 저장은 multer가 하지 않는다. (memoryStorage → FilesService가 검사 후 FileStorage에 저장)
// multer diskStorage로 바로 쓰면 저장 위치가 로컬 디스크에 묶여 S3로 바꿀 때 업로드 경로까지 고쳐야 한다.
// 최대 용량(첨부 100MB)까지 요청마다 메모리에 올라온다. 동시 업로드가 몰리면 메모리 부담이 커지므로,
// 운영에서 S3를 쓰게 되면 대용량은 presigned URL 직접 업로드로 전환한다.
function uploadOptions(
    maxSize: number,
    allowedExtensions: string[],
    errorMessage: string,
): MulterOptions {
    return {
        // 브라우저는 한글 파일명을 UTF-8로 보내지만 multer(busboy) 기본값은 latin1이라 글자가 깨진다.
        defParamCharset: 'utf8',
        limits: {
            fileSize: maxSize,  // 초과 시 413 (PayloadTooLargeException)
            files: 1,           // 요청 하나에 파일 하나 (여러 개는 프론트가 하나씩 올린다)
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
