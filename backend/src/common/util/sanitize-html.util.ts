import sanitizeHtml from "sanitize-html";
import { PUBLIC_IMAGE_URL_PREFIX, STORED_IMAGE_NAME_REGEX } from "../const/file.const";

// 에디터(Tiptap) 본문 HTML 정제
// API를 직접 호출할 수 있어서 저장 전에 서버에서 허용 목록만 남긴다 (저장형 XSS 방지).

const ALLOWED_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: [
        'p', 'br', 'hr',                            // 문단·줄바꿈·구분선
        'h1', 'h2', 'h3',                           // 제목
        'strong', 'em', 'u', 's', 'code',           // 글자 서식
        'ul', 'ol', 'li',                           // 목록
        'blockquote', 'pre',                        // 인용·코드 블록
        'a',                                        // 링크
        'img',                                      // 본문 이미지 (우리 서버 주소만, exclusiveFilter에서 검사)
        'div', 'iframe',                            // 외부 영상 (YouTube·Vimeo 임베드 주소만, exclusiveFilter에서 검사)
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', // 표 (속성 없이 구조만, 견적서 품목표용)
    ],
    allowedAttributes: {
        a: [ 'href', 'target', 'rel' ],
        img: [ 'src', 'alt' ],
        div: [ 'data-video-embed' ],                // 에디터의 영상 노드 표시 (수정 화면에서 다시 영상으로 인식)
        iframe: [ 'src', 'title', 'loading', 'allowfullscreen' ],
    },
    // javascript:, data: 등은 제거 (링크는 웹·메일만)
    allowedSchemes: [ 'http', 'https', 'mailto' ],
    allowProtocolRelative: false,
    // iframe은 이 호스트만 (주소 형식은 exclusiveFilter에서 한 번 더 정확히 검사)
    allowedIframeHostnames: [ 'www.youtube-nocookie.com', 'player.vimeo.com' ],
    allowIframeRelativeUrls: false,
    // 외부 링크는 새 탭 + 열린 페이지가 window.opener로 원래 페이지에 접근하지 못하게 한다.
    transformTags: {
        a: ( tagName, attribs ) => ({
            tagName,
            attribs: {
                ...( attribs.href ? { href: attribs.href } : {} ),
                target: '_blank',
                rel: 'noopener noreferrer nofollow',
            },
        }),
        // 영상 iframe 속성은 서버가 정한 값으로 고정한다. (요청에 담긴 다른 속성은 쓰지 않음)
        iframe: ( tagName, attribs ) => ({
            tagName,
            attribs: {
                ...( attribs.src ? { src: attribs.src } : {} ),
                title: '동영상',
                loading: 'lazy',
                allowfullscreen: 'true',
            },
        }),
    },
};

//* 허용하는 외부 영상 임베드 주소 (YouTube·Vimeo만)
// - YouTube: 재생 전 추적 쿠키를 남기지 않는 youtube-nocookie.com + 11자리 id
// - Vimeo: player.vimeo.com/video/<숫자 id>, 일부 공개 영상은 ?h=<해시>가 있어야 재생된다
export const VIDEO_EMBED_SRC_REGEX =
    /^https:\/\/(www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}|player\.vimeo\.com\/video\/\d+(\?h=[0-9a-f]+)?)$/;

// 블록 요소가 끝나는 위치 (텍스트 추출 시 단어가 붙지 않게 공백을 넣는다)
const BLOCK_END = /<\/(p|h1|h2|h3|li|blockquote|pre|td|th)>|<br\s*\/?>|<hr\s*\/?>/gi;

// sanitize-html은 텍스트를 이 네 가지 엔티티로만 이스케이프하므로 이것만 되돌리면 원문 텍스트가 된다.
function decodeBasicEntities( text: string ): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');    // &amp;는 마지막에 (&amp;lt; → &lt; 로 두 번 풀리지 않게)
}

export interface SanitizedHtml {
    html: string | null;    // 저장할 본문 HTML (정제 후 내용이 없으면 null)
    text: string | null;    // 태그를 뺀 텍스트 (본문 검색용)
}

//* 본문 이미지 주소 → 저장 파일명 (우리 서버의 본문 이미지 주소가 아니면 null)
// 외부 이미지(<img src="https://...">)는 허용하지 않는다. (본문을 연 사람의 접속 정보가 외부로 나가고, 링크가 깨질 수 있음)
export function imageNameFromSrc( src: string | undefined ): string | null {
    if ( !src || !src.startsWith( PUBLIC_IMAGE_URL_PREFIX ) ) {
        return null;
    }
    const name = src.slice( PUBLIC_IMAGE_URL_PREFIX.length );
    return STORED_IMAGE_NAME_REGEX.test( name ) ? name : null;
}

export interface SanitizeEditorOptions {
    // 남길 이미지인지 (저장 파일명 기준). 없으면 우리 서버 주소의 이미지는 모두 남긴다.
    allowImage?: ( storedName: string ) => boolean;
}

//* 에디터 본문 정제 → 저장용 HTML + 검색용 텍스트 (게시글·결재 문서 등 공용)
export function sanitizeEditorHtml(
    input: string | null | undefined,
    options: SanitizeEditorOptions = {},
): SanitizedHtml {
    if ( !input ) {
        return { html: null, text: null };
    }

    const html = sanitizeHtml( input, {
        ...ALLOWED_OPTIONS,
        // true를 반환한 태그는 제거된다
        exclusiveFilter: ( frame ) => {
            // 호스트가 맞아도 경로·id 형식까지 맞아야 iframe을 남긴다
            if ( frame.tag === 'iframe' ) {
                return !VIDEO_EMBED_SRC_REGEX.test( frame.attribs.src ?? '' );
            }
            if ( frame.tag !== 'img' ) return false;
            const name = imageNameFromSrc( frame.attribs.src );
            return !name || ( options.allowImage ? !options.allowImage( name ) : false );
        },
    });

    const text = decodeBasicEntities(
        sanitizeHtml( html.replace( BLOCK_END, '$& ' ), { allowedTags: [], allowedAttributes: {} } ),
    ).replace( /\s+/g, ' ' ).trim();

    // 공백·빈 문단만 남으면 빈 본문 (이미지·영상만 있는 본문은 빈 본문이 아니다)
    if ( text === '' && extractImageNames( html ).length === 0 && !/<iframe\s/.test( html ) ) {
        return { html: null, text: null };
    }

    return { html, text };
}

//* 정제된 본문에서 이미지 저장 파일명 추출 (본문에 나온 순서, 중복 제거)
// 정규식으로 HTML을 해석하지 않고 sanitize-html 파서를 그대로 쓴다.
export function extractImageNames( html: string | null ): string[] {
    if ( !html ) {
        return [];
    }

    const names: string[] = [];
    // exclusiveFilter는 허용 태그에만 호출되므로 img를 허용 목록에 넣는다. (결과 문자열은 쓰지 않음)
    sanitizeHtml( html, {
        allowedTags: [ 'img' ],
        allowedAttributes: { img: [ 'src' ] },
        exclusiveFilter: ( frame ) => {
            if ( frame.tag === 'img' ) {
                const name = imageNameFromSrc( frame.attribs.src );
                if ( name && !names.includes( name ) ) names.push( name );
            }
            return false;
        },
    });
    return names;
}
