//! addons.config.ts 단위 테스트
// parseAddons: backend/.env의 ADDONS 문자열("reservations,approvals")을 켜진 애드온 목록으로 바꾸고, 설정 실수를 잡는다.
// 서버 시작 시 AddonsService가 이 함수를 호출하므로, 여기서 오류가 나면 서버가 뜨지 않는다. (설정 실수가 조용히 "꺼짐"으로 넘어가지 않게)
// DB를 쓰지 않는다. 문자열을 넣고 결과 목록·오류를 비교한다.

import { parseAddons } from './addons.config';

//* 정상 입력
describe('parseAddons - 켜진 애드온 목록', () => {
    // 기본값 = 전부 꺼짐 (사용자 결정): 변수가 없거나(undefined) 비어 있으면 핵심만 동작한다.
    it.each([
        [ '변수 없음', undefined ],
        [ '빈 값', '' ],
        [ '공백·쉼표만', ' , ,' ],
    ])( '%s → 빈 목록', ( _label, value ) => {
        expect( parseAddons( value ) ).toEqual( [] );
    });

    // .env에 사람이 직접 쓰는 값이라 쉼표 뒤 공백을 허용한다.
    it('쉼표 앞뒤 공백은 무시한다', () => {
        expect( parseAddons( ' reservations , chats ' ) ).toEqual([ 'reservations', 'chats' ]);
    });

    // 프론트 메뉴 순서가 .env에 쓴 순서에 따라 바뀌지 않도록, 결과는 항상 ADDONS에 정의한 순서다. 같은 이름을 두 번 써도 한 번만.
    it('결과는 정의한 순서로, 중복 없이 돌려준다', () => {
        expect( parseAddons( 'chats,reservations,chats' ) ).toEqual([ 'reservations', 'chats' ]);
    });

    // 옵션(휴가)은 본체(결재)가 함께 켜져 있으면 켤 수 있다.
    it('본체와 함께 켠 옵션은 허용한다', () => {
        expect( parseAddons( 'leaves,approvals' ) ).toEqual([ 'approvals', 'leaves' ]);
    });
});

//* 설정 실수 → 오류 (서버 시작 단계에서 멈춤)
describe('parseAddons - 설정 오류', () => {
    // 오타(reservation)를 "모르는 이름이니 꺼짐"으로 넘기면 운영에서 기능이 사라진 이유를 찾기 어렵다 → 오류로 알린다.
    // 대소문자도 구분한다. (Reservations ≠ reservations)
    it.each([
        [ '오타', 'reservation' ],
        [ '대문자', 'Reservations' ],
        [ '없는 애드온', 'reservations,payroll' ],
    ])( '모르는 이름은 오류: %s', ( _label, value ) => {
        expect( () => parseAddons( value ) ).toThrow( '알 수 없는 애드온' );
    });

    // AGENTS.md 10.1: 결재를 끄고 휴가 옵션만 켜면 서버가 시작 단계에서 오류를 낸다.
    it('본체 없이 켠 옵션은 오류 (휴가만 켜고 결재는 끔)', () => {
        expect( () => parseAddons( 'reservations,leaves' ) ).toThrow( 'approvals이(가) 켜져 있어야 합니다' );
    });
});
