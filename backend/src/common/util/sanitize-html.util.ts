import sanitizeHtml from "sanitize-html";

// 에디터(Tiptap) 본문 HTML 정제
// 프론트 에디터를 거치지 않고 API를 직접 호출할 수 있으므로, 저장 전에 서버에서 허용 목록만 남긴다. (저장형 XSS 방지)
// 허용 목록 방식: 아래에 없는 태그·속성·URL 스킴은 모두 제거한다. (script·style은 내용까지 제거)

const ALLOWED_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: [
        'p', 'br', 'hr',                            // 문단·줄바꿈·구분선
        'h1', 'h2', 'h3',                           // 제목
        'strong', 'em', 'u', 's', 'code',           // 글자 서식
        'ul', 'ol', 'li',                           // 목록
        'blockquote', 'pre',                        // 인용·코드 블록
        'a',                                        // 링크
        // img는 파일 기능 이후 우리 서버 경로만 허용해서 추가한다.
    ],
    allowedAttributes: {
        a: [ 'href', 'target', 'rel' ],
    },
    // javascript:, data: 등은 제거 (링크는 웹·메일만)
    allowedSchemes: [ 'http', 'https', 'mailto' ],
    allowProtocolRelative: false,
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
    },
};

// 블록 요소가 끝나는 위치 (텍스트 추출 시 단어가 붙지 않게 공백을 넣는다)
const BLOCK_END = /<\/(p|h1|h2|h3|li|blockquote|pre)>|<br\s*\/?>|<hr\s*\/?>/gi;

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

//* 에디터 본문 정제 → 저장용 HTML + 검색용 텍스트
// 게시글 외에 같은 에디터를 쓰는 본문(결재 문서 등)에서도 사용한다.
export function sanitizeEditorHtml( input: string | null | undefined ): SanitizedHtml {
    if ( !input ) {
        return { html: null, text: null };
    }

    const html = sanitizeHtml( input, ALLOWED_OPTIONS );

    const text = decodeBasicEntities(
        sanitizeHtml( html.replace( BLOCK_END, '$& ' ), { allowedTags: [], allowedAttributes: {} } ),
    ).replace( /\s+/g, ' ' ).trim();

    // <p></p>, 공백만 있는 본문, script만 있던 본문 등은 빈 본문으로 본다.
    if ( text === '' ) {
        return { html: null, text: null };
    }

    return { html, text };
}
