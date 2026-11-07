//* 파일 앞부분(시그니처, magic number)으로 실제 이미지 형식 확인
// 확장자와 Content-Type은 클라이언트가 정하는 값이라 html·스크립트를 .png로 올릴 수 있다.
// 업로드 버퍼의 첫 12바이트로 형식을 판별하고, 알 수 없으면 null.
export function detectImageMime( buf: Buffer ): string | null {
    if ( buf.length < 12 ) return null;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if ( buf.subarray( 0, 8 ).equals( Buffer.from([ 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a ]) ) ) {
        return 'image/png';
    }
    // JPEG: FF D8 FF
    if ( buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ) {
        return 'image/jpeg';
    }
    // GIF: "GIF87a" / "GIF89a"
    const head6 = buf.toString( 'ascii', 0, 6 );
    if ( head6 === 'GIF87a' || head6 === 'GIF89a' ) {
        return 'image/gif';
    }
    // WEBP: "RIFF" + 크기(4바이트) + "WEBP"
    if ( buf.toString( 'ascii', 0, 4 ) === 'RIFF' && buf.toString( 'ascii', 8, 12 ) === 'WEBP' ) {
        return 'image/webp';
    }
    return null;
}
