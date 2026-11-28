//! sanitize-html.util.ts 단위 테스트
// 에디터 본문 HTML을 저장 전에 허용 목록만 남기는 정제 함수 (저장형 XSS 방지)

import { extractImageNames, imageNameFromSrc, sanitizeEditorHtml } from './sanitize-html.util';
import { PUBLIC_IMAGE_URL_PREFIX } from '../const/file.const';

// 테스트용 본문 이미지 주소
const IMAGE_A = '11111111-2222-3333-4444-555555555555.png';
const IMAGE_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
const img = ( name: string ) => `<img src="${PUBLIC_IMAGE_URL_PREFIX}${name}" alt="">`;

// 허용하는 영상 임베드 주소 형식
const YOUTUBE = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
const VIMEO = 'https://player.vimeo.com/video/76979871?h=8272103f6e';
const iframe = ( src: string, extra = '' ) => `<iframe src="${src}"${extra}></iframe>`;

//* 기본 정제: 스크립트 실행 경로 차단 + 검색 텍스트 + 빈 본문 판단
describe('sanitizeEditorHtml - 기본 정제 (저장형 XSS 방지)', () => {
    // <script>는 내용까지, onclick은 속성만 지운다
    it('script는 내용까지, 허용하지 않은 속성(onclick 등)은 속성만 제거한다', () => {
        const { html } = sanitizeEditorHtml( '<p onclick="alert(1)">본문<script>alert(1)</script></p>' );

        expect( html ).toBe( '<p>본문</p>' );
    });

    // 표는 견적서 품목표용으로 구조 태그만 남기고 속성은 지운다
    it('표 태그는 남기고 속성은 지우며, 검색 텍스트는 칸 사이를 띄운다', () => {
        const { html, text } = sanitizeEditorHtml( '<table style="x" onclick="y()"><tbody><tr><td class="a">품목</td><td>1,000원</td></tr></tbody></table>' );

        expect( html ).toBe( '<table><tbody><tr><td>품목</td><td>1,000원</td></tr></tbody></table>' );
        expect( text ).toBe( '품목 1,000원' );
    });

    // javascript: 링크는 주소를 지우고, 모든 링크는 새 탭 + noopener로 고정한다
    it('javascript: 링크는 href를 제거하고, 링크는 새 탭 + noopener로 고정한다', () => {
        expect( sanitizeEditorHtml( '<p><a href="javascript:alert(1)">x</a></p>' ).html ).toBe(
            '<p><a target="_blank" rel="noopener noreferrer nofollow">x</a></p>',
        );
        expect( sanitizeEditorHtml( '<p><a href="https://example.com" target="_self">x</a></p>' ).html ).toBe(
            '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">x</a></p>',
        );
    });

    // 검색용 text: 블록 사이에 공백을 넣고 엔티티는 원래 글자로 되돌린다
    it('검색용 텍스트는 블록 사이에 공백을 넣고 엔티티를 원문으로 되돌린다', () => {
        const { text } = sanitizeEditorHtml( '<h1>제목</h1><p>A &amp; B &lt;C&gt;</p>' );

        expect( text ).toBe( '제목 A & B <C>' );
    });

    // 정제 후 내용이 없으면 null
    it('내용이 없는 본문(빈 문단·script만)은 null', () => {
        expect( sanitizeEditorHtml( '<p></p>' ) ).toEqual({ html: null, text: null });
        expect( sanitizeEditorHtml( '<script>alert(1)</script>' ) ).toEqual({ html: null, text: null });
        expect( sanitizeEditorHtml( undefined ) ).toEqual({ html: null, text: null });
    });
});

//* 영상 iframe: iframe은 다른 사이트를 우리 페이지 안에 띄우므로 YouTube·Vimeo의 정해진 주소 형식만 허용
describe('sanitizeEditorHtml - 영상 iframe (YouTube·Vimeo 임베드만)', () => {
    // 허용 주소는 남기고, 붙어 온 속성(onload, allow="camera" 등)은 버리고 서버가 정한 속성으로 고정한다
    it('허용 형식의 YouTube·Vimeo 주소는 남기고 속성은 서버 값으로 고정한다', () => {
        const { html } = sanitizeEditorHtml( iframe( YOUTUBE, ' width="1" onload="alert(1)" allow="camera"' ) );

        expect( html ).toBe( `<iframe src="${YOUTUBE}" title="동영상" loading="lazy" allowfullscreen="true"></iframe>` );
        expect( sanitizeEditorHtml( iframe( VIMEO ) ).html ).toContain( `src="${VIMEO}"` );
    });

    // 영상만 있는 본문도 빈 본문이 아니다
    it('영상만 있는 본문은 빈 본문이 아니다', () => {
        const result = sanitizeEditorHtml( `<div data-video-embed="">${iframe( YOUTUBE )}</div>` );

        expect( result.html ).not.toBeNull();
        expect( result.text ).toBe( '' );
    });

    // 호스트만 맞고 경로·뒤에 붙인 값이 다른 주소까지 막는지. iframe만 사라지고 본문은 남아야 한다
    it.each([
        [ '다른 호스트', 'https://evil.example.com/embed/dQw4w9WgXcQ' ],
        [ '쿠키를 남기는 youtube.com', 'https://www.youtube.com/embed/dQw4w9WgXcQ' ],
        [ 'http', 'http://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' ],
        [ '허용 호스트지만 다른 경로', 'https://www.youtube-nocookie.com/watch?v=dQw4w9WgXcQ' ],
        [ 'YouTube id 길이 다름', 'https://www.youtube-nocookie.com/embed/short' ],
        [ 'YouTube 뒤에 다른 값', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1' ],
        [ 'Vimeo id가 숫자가 아님', 'https://player.vimeo.com/video/abc' ],
        [ 'javascript:', 'javascript:alert(1)' ],
    ])( '허용하지 않는 주소는 iframe을 제거한다: %s', ( _label, src ) => {
        const { html } = sanitizeEditorHtml( `<p>본문</p>${iframe( src )}` );

        expect( html ).toBe( '<p>본문</p>' );
    });
});

//* 본문 이미지: 외부 이미지는 금지 (접속 정보가 외부로 나가고 링크가 깨질 수 있음)
describe('sanitizeEditorHtml - 본문 이미지 (우리 서버 주소만)', () => {
    it('우리 서버 이미지 주소는 남기고 외부 이미지는 제거한다', () => {
        const { html } = sanitizeEditorHtml( `<p>a</p>${img( IMAGE_A )}<img src="https://example.com/x.png">` );

        expect( html ).toBe( `<p>a</p><img src="${PUBLIC_IMAGE_URL_PREFIX}${IMAGE_A}" alt="" />` );
    });

    // 우리 서버 주소라도 allowImage가 허용한 이미지만 남는다
    it('allowImage가 false를 반환한 이미지는 제거한다 (남의 이미지·연결 안 된 이미지)', () => {
        const { html } = sanitizeEditorHtml( img( IMAGE_A ) + img( IMAGE_B ), { allowImage: ( name ) => name === IMAGE_B } );

        expect( extractImageNames( html ) ).toEqual([ IMAGE_B ]);
    });
});

//* 이미지 주소 → 저장 파일명
describe('imageNameFromSrc / extractImageNames', () => {
    // "우리 서버 주소 + uuid.확장자"만 인정한다. 경로 이동 문자(../), svg, 외부 주소, src 없음은 거부
    it('우리 서버 주소 + uuid 파일명만 저장 파일명으로 인정한다', () => {
        expect( imageNameFromSrc( `${PUBLIC_IMAGE_URL_PREFIX}${IMAGE_A}` ) ).toBe( IMAGE_A );
        expect( imageNameFromSrc( `${PUBLIC_IMAGE_URL_PREFIX}../secret.png` ) ).toBeNull();
        expect( imageNameFromSrc( `${PUBLIC_IMAGE_URL_PREFIX}${IMAGE_A.replace( '.png', '.svg' )}` ) ).toBeNull();
        expect( imageNameFromSrc( `https://example.com/${IMAGE_A}` ) ).toBeNull();
        expect( imageNameFromSrc( undefined ) ).toBeNull();
    });

    // 본문 순서가 유지되고(첫 이미지 = 앨범 대표), 같은 이미지는 한 번만 나와야 한다
    it('본문에 나온 순서대로, 중복 없이 추출한다', () => {
        expect( extractImageNames( img( IMAGE_B ) + img( IMAGE_A ) + img( IMAGE_B ) ) ).toEqual([ IMAGE_B, IMAGE_A ]);
        expect( extractImageNames( null ) ).toEqual( [] );
    });
});
