import sharp from "sharp";
import { FileKind, THUMBNAIL_KEY_PREFIX, THUMBNAIL_MAX_SIZE, THUMBNAIL_QUALITY } from "../const/file.const";

//* 원본 이미지 저장소 key(Files.path) → 썸네일 저장소 key
// 종류 접두사만 thumbnails로, 확장자만 .webp로 바꾸고 날짜 폴더는 원본과 같게 둔다.
//   images/2026/11/<uuid>.png → thumbnails/2026/11/<uuid>.webp
//   images/<uuid>.png (날짜 폴더 이전 업로드) → thumbnails/<uuid>.webp
// 썸네일 위치를 DB에 따로 두지 않고 원본 위치에서 계산하므로 둘이 어긋날 수 없다.
export function thumbnailKey( imagePath: string ): string {
    return imagePath
        .replace( new RegExp(`^${FileKind.IMAGE}/`), `${THUMBNAIL_KEY_PREFIX}/` )
        .replace( /\.[^./]+$/, '.webp' );
}

//* 썸네일 만들기 (긴 변 THUMBNAIL_MAX_SIZE px 이하, webp)
// - rotate(): 휴대폰 사진의 EXIF 회전 정보를 실제 픽셀에 반영 (안 하면 썸네일이 옆으로 누움)
// - withoutEnlargement: 작은 이미지는 키우지 않는다.
// - 움직이는 gif·webp는 첫 프레임만 쓴다. (목록 미리보기 용도)
// - 자르기(crop)는 하지 않는다. 그리드 카드의 비율은 화면(CSS object-fit)에서 맞춘다.
export function createThumbnail( image: Buffer ): Promise<Buffer> {
    return sharp( image )
        .rotate()
        .resize( THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE, { fit: 'inside', withoutEnlargement: true } )
        .webp( { quality: THUMBNAIL_QUALITY } )
        .toBuffer();
}
