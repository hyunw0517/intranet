//! sanitize-html.util.ts 단위 테스트
// 게시글 본문(Tiptap 에디터 HTML)을 저장하기 전에 허용한 태그·속성·주소만 남기는 정제 함수를 확인한다.
// 왜 서버에서 하나: 프론트 에디터를 거치지 않고 API를 직접 호출해 <script>를 넣을 수 있다. (저장형 XSS)
// - sanitizeEditorHtml: 본문 정제 → 저장할 html + 검색용 text
// - imageNameFromSrc: <img src>가 우리 서버의 본문 이미지 주소인지 확인하고 저장 파일명을 꺼낸다.
// - extractImageNames: 정제된 본문에서 이미지 파일명 목록을 꺼낸다. (글 저장 시 Files 행과 연결할 대상)
// DB를 쓰지 않는다. HTML 문자열을 넣고 결과 문자열을 비교한다.

import { extractImageNames, imageNameFromSrc, sanitizeEditorHtml } from './sanitize-html.util';
import { PUBLIC_IMAGE_URL_PREFIX } from '../const/file.const';

// 테스트용 본문 이미지: 업로드하면 uuid 파일명으로 저장되고 /api/common/files/images/<uuid>.png 주소로 본문에 들어간다.
const IMAGE_A = '11111111-2222-3333-4444-555555555555.png';
const IMAGE_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
const img = ( name: string ) => `<img src="${PUBLIC_IMAGE_URL_PREFIX}${name}" alt="">`;

// 허용하는 영상 임베드 주소 형식 (에디터가 사용자가 붙여 넣은 주소를 이 형식으로 바꿔 넣는다)
const YOUTUBE = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
const VIMEO = 'https://player.vimeo.com/video/76979871?h=8272103f6e';
const iframe = ( src: string, extra = '' ) => `<iframe src="${src}"${extra}></iframe>`;

//* 기본 정제: 스크립트 실행 경로 차단 + 검색 텍스트 + 빈 본문 판단
describe('sanitizeEditorHtml - 기본 정제 (저장형 XSS 방지)', () => {
    // 가장 기본적인 공격 두 가지: <script> 태그(내용까지 제거), 이벤트 속성 onclick(태그는 남기고 속성만 제거)
    it('script는 내용까지, 허용하지 않은 속성(onclick 등)은 속성만 제거한다', () => {
        const { html } = sanitizeEditorHtml( '<p onclick="alert(1)">본문<script>alert(1)</script></p>' );

        expect( html ).toBe( '<p>본문</p>' );
    });

    // ① href="javascript:..."는 누르면 스크립트가 실행된다 → 링크 주소를 지운다.
    // ② 모든 링크는 새 탭 + noopener로 고정: 열린 외부 페이지가 window.opener로 우리 페이지를 조작하지 못하게. (요청의 target="_self"는 무시)
    it('javascript: 링크는 href를 제거하고, 링크는 새 탭 + noopener로 고정한다', () => {
        expect( sanitizeEditorHtml( '<p><a href="javascript:alert(1)">x</a></p>' ).html ).toBe(
            '<p><a target="_blank" rel="noopener noreferrer nofollow">x</a></p>',
        );
        expect( sanitizeEditorHtml( '<p><a href="https://example.com" target="_self">x</a></p>' ).html ).toBe(
            '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">x</a></p>',
        );
    });

    // 게시글 검색은 태그를 뺀 text 컬럼으로 한다.
    // ① 블록(제목·문단) 사이에 공백을 넣어 "제목A"처럼 단어가 붙지 않게 ② &amp; &lt; 같은 엔티티를 원래 글자로 되돌려 "A & B"로 검색되게
    it('검색용 텍스트는 블록 사이에 공백을 넣고 엔티티를 원문으로 되돌린다', () => {
        const { text } = sanitizeEditorHtml( '<h1>제목</h1><p>A &amp; B &lt;C&gt;</p>' );

        expect( text ).toBe( '제목 A & B <C>' );
    });

    // 정제 후 실제 내용이 없으면 null로 저장한다. (빈 문단만 있는 본문, script만 넣어 정제 후 비어 버린 본문, 본문 없음)
    it('내용이 없는 본문(빈 문단·script만)은 null', () => {
        expect( sanitizeEditorHtml( '<p></p>' ) ).toEqual({ html: null, text: null });
        expect( sanitizeEditorHtml( '<script>alert(1)</script>' ) ).toEqual({ html: null, text: null });
        expect( sanitizeEditorHtml( undefined ) ).toEqual({ html: null, text: null });
    });
});

//* 영상 iframe: iframe은 다른 사이트를 우리 페이지 안에 띄우므로 YouTube·Vimeo의 정해진 주소 형식만 허용
describe('sanitizeEditorHtml - 영상 iframe (YouTube·Vimeo 임베드만)', () => {
    // 허용 주소는 남기되, 요청에 붙어 온 다른 속성(onload 스크립트, allow="camera" 권한 요청, 크기)은 버리고
    // 서버가 정한 속성(title·loading·allowfullscreen)으로 고정한다.
    it('허용 형식의 YouTube·Vimeo 주소는 남기고 속성은 서버 값으로 고정한다', () => {
        const { html } = sanitizeEditorHtml( iframe( YOUTUBE, ' width="1" onload="alert(1)" allow="camera"' ) );

        expect( html ).toBe( `<iframe src="${YOUTUBE}" title="동영상" loading="lazy" allowfullscreen="true"></iframe>` );
        expect( sanitizeEditorHtml( iframe( VIMEO ) ).html ).toContain( `src="${VIMEO}"` );
    });

    // 글자 없이 영상만 있는 게시글도 정상 본문이다. text가 비었다고 null(빈 본문)로 처리하면 안 된다.
    it('영상만 있는 본문은 빈 본문이 아니다', () => {
        const result = sanitizeEditorHtml( `<div data-video-embed="">${iframe( YOUTUBE )}</div>` );

        expect( result.html ).not.toBeNull();
        expect( result.text ).toBe( '' );
    });

    // 거부해야 하는 주소 8가지를 같은 테스트로 반복 실행한다. (it.each: 표의 한 줄 = 테스트 하나, %s 자리에 첫 번째 값이 들어감)
    // 호스트만 보고 허용하면 뚫리는 경우(같은 호스트의 다른 경로, 뒤에 붙인 값)까지 정규식이 막는지 확인한다.
    // 각 경우 iframe만 사라지고 나머지 본문(<p>본문</p>)은 남아야 한다.
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

//* 본문 이미지: 외부 이미지는 금지 (본문을 연 사람의 접속 정보가 외부 서버로 나가고, 외부 링크는 깨질 수 있음)
describe('sanitizeEditorHtml - 본문 이미지 (우리 서버 주소만)', () => {
    // 우리 서버 업로드 이미지는 남고, https://example.com 이미지는 태그째 사라진다.
    it('우리 서버 이미지 주소는 남기고 외부 이미지는 제거한다', () => {
        const { html } = sanitizeEditorHtml( `<p>a</p>${img( IMAGE_A )}<img src="https://example.com/x.png">` );

        expect( html ).toBe( `<p>a</p><img src="${PUBLIC_IMAGE_URL_PREFIX}${IMAGE_A}" alt="" />` );
    });

    // 우리 서버 주소라도 "다른 사람이 올린 이미지"나 "이 글에 연결할 수 없는 이미지"는 빼야 한다.
    // 게시글 서비스는 allowImage로 남길 이미지를 정해 넘긴다. 여기서는 B만 허용 → 정제 결과에 B만 남는지 확인
    it('allowImage가 false를 반환한 이미지는 제거한다 (남의 이미지·연결 안 된 이미지)', () => {
        const { html } = sanitizeEditorHtml( img( IMAGE_A ) + img( IMAGE_B ), { allowImage: ( name ) => name === IMAGE_B } );

        expect( extractImageNames( html ) ).toEqual([ IMAGE_B ]);
    });
});

//* 이미지 주소 → 저장 파일명
describe('imageNameFromSrc / extractImageNames', () => {
    // 저장 파일명으로 인정하는 것은 "우리 서버 주소 + uuid.확장자"뿐이다.
    // 거부: 경로 이동 문자(../ - 다른 파일을 가리키려는 시도), svg(스크립트를 담을 수 있어 업로드도 금지), 외부 주소, src 없음
    it('우리 서버 주소 + uuid 파일명만 저장 파일명으로 인정한다', () => {
        expect( imageNameFromSrc( `${PUBLIC_IMAGE_URL_PREFIX}${IMAGE_A}` ) ).toBe( IMAGE_A );
        expect( imageNameFromSrc( `${PUBLIC_IMAGE_URL_PREFIX}../secret.png` ) ).toBeNull();
        expect( imageNameFromSrc( `${PUBLIC_IMAGE_URL_PREFIX}${IMAGE_A.replace( '.png', '.svg' )}` ) ).toBeNull();
        expect( imageNameFromSrc( `https://example.com/${IMAGE_A}` ) ).toBeNull();
        expect( imageNameFromSrc( undefined ) ).toBeNull();
    });

    // 글 저장 시 이 목록으로 Files 행을 연결하고 순서(order)를 매긴다. 앨범 대표 이미지 = 첫 번째(order 0)이므로
    // 본문에 나온 순서가 유지돼야 하고, 같은 이미지를 두 번 넣어도 한 번만 연결돼야 한다.
    it('본문에 나온 순서대로, 중복 없이 추출한다', () => {
        expect( extractImageNames( img( IMAGE_B ) + img( IMAGE_A ) + img( IMAGE_B ) ) ).toEqual([ IMAGE_B, IMAGE_A ]);
        expect( extractImageNames( null ) ).toEqual( [] );
    });
});
