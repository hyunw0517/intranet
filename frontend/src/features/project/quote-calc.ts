import type { QuoteTaxType } from "@/types/project";

// 견적 금액 미리보기 (작성 화면) - 서버 규칙(quote-rules.util.ts calcQuote)과 같은 계산
// - 금액 = 수량 × 단가, 과세는 합계 기준 10% 원 미만 버림, 면세 0
// - BigInt로 계산한다 (수량 × 단가가 Number 정밀도를 넘을 수 있다). 저장되는 값은 서버가 다시 계산한 값이다.
// - tsconfig target이 ES2020 미만이라 BigInt 리터럴(10n) 대신 BigInt()를 쓴다.
export const MAX_AMOUNT = BigInt("999999999999999");

export function quoteTotals(items: { quantity: string; unitPrice: string }[], taxType: QuoteTaxType) {
  const amounts = items.map((i) => BigInt(i.quantity || "0") * BigInt(i.unitPrice || "0"));
  const supply = amounts.reduce((sum, a) => sum + a, BigInt(0));
  const vat = taxType === "TAXABLE" ? supply / BigInt(10) : BigInt(0); // 양수 나눗셈은 버림
  const total = supply + vat;
  return { amounts, supply, vat, total, overflow: total > MAX_AMOUNT || amounts.some((a) => a > MAX_AMOUNT) };
}
