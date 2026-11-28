//! sale-rules.util.ts 단위 테스트 (청구 금액·부가세, 수금 상태, 분할 청구 한도)

import { Prisma, ProjectQuoteTaxType } from 'src/generated/prisma/client';
import { calcSaleAmounts, exceedsQuote, paymentStatus } from './sale-rules.util';

const D = ( v: number | string ) => new Prisma.Decimal( v );

describe('calcSaleAmounts - 공급가액 → 부가세·합계', () => {
    it('과세는 10% 원 미만 버림', () => {
        const r = calcSaleAmounts( 33_333, ProjectQuoteTaxType.TAXABLE )!;
        expect( [ r.supplyAmount, r.vatAmount, r.totalAmount ].map( String ) ).toEqual([ '33333', '3333', '36666' ]);
    });
    it('면세는 부가세 0', () => {
        expect( calcSaleAmounts( 1000, ProjectQuoteTaxType.EXEMPT )!.totalAmount.toString() ).toBe( '1000' );
    });
    it('부가세율을 직접 주면 그 비율로 (기본 10%)', () => {
        expect( calcSaleAmounts( 1000, ProjectQuoteTaxType.TAXABLE, '3.3' )!.vatAmount.toString() ).toBe( '33' );
        expect( calcSaleAmounts( 1000, ProjectQuoteTaxType.TAXABLE )!.vatAmount.toString() ).toBe( '100' );
    });
    it('부가세를 더해 999조를 넘으면 null', () => {
        expect( calcSaleAmounts( 999_999_999_999_999, ProjectQuoteTaxType.TAXABLE ) ).toBeNull();
        expect( calcSaleAmounts( 999_999_999_999_999, ProjectQuoteTaxType.EXEMPT ) ).not.toBeNull();
    });
});

describe('paymentStatus - 수금 상태', () => {
    it.each([
        [ '수금 없음', '1000', '0', 'UNPAID' ],
        [ '일부', '1000', '300', 'PARTIAL' ],
        [ '전액', '1000', '1000', 'PAID' ],
    ])( '%s → %s', ( _l, total, paid, expected ) => {
        expect( paymentStatus( D( total ), D( paid ) ) ).toBe( expected );
    });
});

describe('exceedsQuote - 분할 청구 한도', () => {
    it('합계가 견적 금액과 같으면 허용, 1원이라도 넘으면 초과', () => {
        expect( exceedsQuote( D( 1_100_000 ), D( 330_000 ), D( 770_000 ) ) ).toBe( false );
        expect( exceedsQuote( D( 1_100_000 ), D( 330_000 ), D( 770_001 ) ) ).toBe( true );
    });
});
