import { parseHolidayXml } from './holiday-xml.util';

const item = ( locdate: string, dateName: string, isHoliday = 'Y' ) =>
    `<item><dateKind>01</dateKind><dateName>${dateName}</dateName><isHoliday>${isHoliday}</isHoliday><locdate>${locdate}</locdate><seq>1</seq></item>`;

const response = ( items: string ) =>
    `<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items>${items}</items><totalCount>1</totalCount></body></response>`;

describe( 'parseHolidayXml', () => {
    it( '날짜를 yyyy-MM-dd로 바꾸고 날짜순으로 정렬한다', () => {
        const xml = response( item( '20261225', '기독탄신일' ) + item( '20260302', '대체공휴일(삼일절)' ) );

        expect( parseHolidayXml( xml ) ).toEqual([
            { date: '2026-03-02', name: '대체공휴일(삼일절)' },
            { date: '2026-12-25', name: '기독탄신일' },
        ]);
    });

    it( '공공기관 휴일이 아닌 날은 제외한다', () => {
        expect( parseHolidayXml( response( item( '20260717', '기념일', 'N' ) ) ) ).toEqual( [] );
    });

    it( '같은 날 공휴일이 겹치면 이름을 합친다', () => {
        const xml = response( item( '20250505', '어린이날' ) + item( '20250505', '부처님오신날' ) );

        expect( parseHolidayXml( xml ) ).toEqual( [ { date: '2025-05-05', name: '어린이날, 부처님오신날' } ] );
    });

    it( '이름의 XML 문자 참조를 되돌린다', () => {
        expect( parseHolidayXml( response( item( '20260101', 'A &amp; B' ) ) )[0].name ).toBe( 'A & B' );
    });

    it( '결과가 없으면 빈 목록을 준다', () => {
        const xml = '<response><header><resultCode>00</resultCode></header><body><items/><totalCount>0</totalCount></body></response>';

        expect( parseHolidayXml( xml ) ).toEqual( [] );
    });

    it( '오류 응답은 예외를 던진다', () => {
        const limited = '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>';

        expect( () => parseHolidayXml( '<response><header><resultCode>30</resultCode></header></response>' ) ).toThrow( '30' );
        expect( () => parseHolidayXml( limited ) ).toThrow( '22' );
        expect( () => parseHolidayXml( 'Unauthorized' ) ).toThrow();
    });
});
