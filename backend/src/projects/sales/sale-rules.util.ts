import { Prisma, ProjectQuoteTaxType } from "src/generated/prisma/client";
import { calcVat, DEFAULT_VAT_RATE, MAX_AMOUNT } from "../quotes/quote-rules.util";

//! 매출 순수 규칙 (DB 없이 단위 테스트, docs/design/projects.md 5-2장)

//* 공급가액 → 부가세·합계 (매출 청구·협력사 외주 금액 공용)
// 과세 = floor(공급가액 × 부가세율 ÷ 100), 면세 = 0. 부가세율은 직접 입력(기본 10%, 2026-11-17 사용자 결정) - 견적과 같은 규칙(calcVat)
// 999조를 넘으면 null (호출한 쪽이 400)
export function calcSaleAmounts(
    supplyAmount: number | string | Prisma.Decimal,
    taxType: ProjectQuoteTaxType,
    vatRate: number | string | Prisma.Decimal = DEFAULT_VAT_RATE,
) {
    const supply = new Prisma.Decimal( supplyAmount );
    const vat = calcVat( supply, taxType, vatRate );
    const total = supply.add( vat );
    return total.gt( MAX_AMOUNT ) ? null : { supplyAmount: supply, vatAmount: vat, totalAmount: total };
}

//* 수금 상태 (저장하지 않고 수금 합계로 계산): 미수 / 부분 수금 / 수금 완료
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export function paymentStatus( totalAmount: Prisma.Decimal, paidAmount: Prisma.Decimal ): PaymentStatus {
    if ( paidAmount.lte( 0 ) ) return 'UNPAID';
    return paidAmount.gte( totalAmount ) ? 'PAID' : 'PARTIAL';
}

//* 분할 청구 한도: 견적에 연결한 청구 합계(취소 제외, 이번 건 포함) ≤ 확정 견적 합계
export function exceedsQuote( quoteTotal: Prisma.Decimal, otherBilled: Prisma.Decimal, thisTotal: Prisma.Decimal ): boolean {
    return otherBilled.add( thisTotal ).gt( quoteTotal );
}
