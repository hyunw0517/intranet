//! chat-room-name.util.ts 단위 테스트
// 그룹 이름을 비웠을 때 참여자 이름으로 만드는 규칙 (영문 먼저 → 한글 가나다, 3명 초과는 "외 N명"). DB를 쓰지 않는다.

import { defaultGroupName } from './chat-room-name.util';

describe('defaultGroupName - 그룹 채팅방 기본 이름', () => {
    it('사용자 예시: 5명 → 영문 먼저, 앞 3명 + 외 2명', () => {
        expect( defaultGroupName( [ '안철수', 'Michael Johnson', '관리자', '최현우', '신민아' ] ) )
            .toBe( 'Michael Johnson, 관리자, 신민아 외 2명' );
    });

    it('3명이면 "외"를 붙이지 않는다', () => {
        expect( defaultGroupName( [ '최현우', '관리자', '신민아' ] ) ).toBe( '관리자, 신민아, 최현우' );
    });

    it('4명이면 외 1명', () => {
        expect( defaultGroupName( [ '최현우', '관리자', '신민아', '안철수' ] ) ).toBe( '관리자, 신민아, 안철수 외 1명' );
    });

    it('영문끼리는 알파벳순(대소문자 무관), 한글보다 앞', () => {
        expect( defaultGroupName( [ '가나다', 'bob', 'Alice' ] ) ).toBe( 'Alice, bob, 가나다' );
    });

    it('같은 이름도 그대로 둔다(동명이인)', () => {
        expect( defaultGroupName( [ '김민수', '김민수', '이영희' ] ) ).toBe( '김민수, 김민수, 이영희' );
    });

    it('입력 배열을 바꾸지 않는다', () => {
        const names = [ '최현우', 'Michael' ];
        defaultGroupName( names );
        expect( names ).toEqual( [ '최현우', 'Michael' ] );
    });
});
