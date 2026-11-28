import sharp from "sharp";
import { ATTACHMENT_THUMBNAIL_KEY_PREFIX, FileKind, THUMBNAIL_KEY_PREFIX, THUMBNAIL_MAX_SIZE, THUMBNAIL_QUALITY } from "../const/file.const";

//* 원본 이미지 저장소 key(Files.path) → 썸네일 저장소 key
//   images/2026/11/<uuid>.png      → thumbnails/2026/11/<uuid>.webp
//   attachments/2026/11/<uuid>.png → attachment-thumbnails/2026/11/<uuid>.webp
// 위치를 DB에 두지 않고 원본에서 계산하므로 둘이 어긋날 수 없다.
export function thumbnailKey( imagePath: string ): string {
    return imagePath
        .replace( new RegExp(`^${FileKind.IMAGE}/`), `${THUMBNAIL_KEY_PREFIX}/` )
        .replace( new RegExp(`^${FileKind.ATTACHMENT}/`), `${ATTACHMENT_THUMBNAIL_KEY_PREFIX}/` )
        .replace( /\.[^./]+$/, '.webp' );
}

//* 썸네일 만들기 (긴 변 THUMBNAIL_MAX_SIZE px 이하, webp)
// - rotate(): 휴대폰 사진의 EXIF 회전을 픽셀에 반영 (안 하면 썸네일이 옆으로 눕는다)
// - 자르지 않는다. 카드 비율은 화면(object-fit)에서 맞춘다.
export function createThumbnail( image: Buffer ): Promise<Buffer> {
    return sharp( image )
        .rotate()
        .resize( THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE, { fit: 'inside', withoutEnlargement: true } )
        .webp( { quality: THUMBNAIL_QUALITY } )
        .toBuffer();
}
