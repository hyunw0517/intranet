//! 그룹 채팅방 기본 이름 (features.md 8.3, 2026-11-13 사용자 결정)
// 그룹을 만들 때 이름을 비우면 참여자(만든 사람 포함) 이름으로 만든다. 만들 때 한 번만 정하고, 이후 참여자가 바뀌어도 그대로 둔다.
// - 순서: 한글이 아닌 이름(영문 등)이 먼저, 그다음 한글 가나다순
// - 3명까지는 쉼표로 잇고, 넘으면 앞 3명 + "외 N명"
// 예) [안철수, Michael Johnson, 관리자, 최현우, 신민아] → "Michael Johnson, 관리자, 신민아 외 2명"

const SHOWN_NAMES = 3;
const HANGUL_START = /^[ㄱ-ㆎ가-힣]/; // 한글 자모·완성형으로 시작

// 한국어 정렬(Intl.Collator 'ko')은 한글을 영문보다 앞에 두므로, 한글 여부로 먼저 나눈 뒤 각 묶음 안에서만 'ko'로 비교한다.
const collator = new Intl.Collator( 'ko' );

export function compareMemberNames( a: string, b: string ) {
    const groupA = HANGUL_START.test( a ) ? 1 : 0;
    const groupB = HANGUL_START.test( b ) ? 1 : 0;
    return groupA - groupB || collator.compare( a, b );
}

export function defaultGroupName( names: string[] ) {
    const sorted = [ ...names ].sort( compareMemberNames );
    const shown = sorted.slice( 0, SHOWN_NAMES ).join( ', ' );
    const rest = sorted.length - SHOWN_NAMES;

    return rest > 0 ? `${shown} 외 ${rest}명` : shown;
}
