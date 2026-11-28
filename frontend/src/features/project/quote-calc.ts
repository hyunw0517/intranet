import type { QuoteTaxType } from "@/types/project";

// 견적·매출·협력사 금액 미리보기 (서버 calcVat·calcQuote와 같은 계산)
// - 금액 = 수량 × 단가, 과세는 합계 × 부가세율 원 미만 버림, 면세 0
// - 곱이 Number 정밀도를 넘을 수 있어 BigInt로 계산한다.
// - tsconfig target이 ES2020 미만이라 10n 대신 BigInt()를 쓴다.
export const MAX_AMOUNT = BigInt("999999999999999");
export const DEFAULT_VAT_RATE = "10";

const VAT_RATE_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

// 입력 중 정리: 숫자와 점 하나, 정수 3자리·소수 2자리까지
export function sanitizeVatRate(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  return cleaned.match(/^\d{0,3}(\.\d{0,2})?/)?.[0] ?? "";
}

// 부가세율이 올바르면 null, 아니면 오류 문구
export function vatRateError(value: string) {
  if (!VAT_RATE_PATTERN.test(value)) return "부가세율을 입력해 주세요. (예: 10, 3.3)";
  if (Number(value) > 100) return "부가세율은 100% 이하로 입력해 주세요.";
  return null;
}

// "3.3" → 330 (1/100 % 단위 정수). 올바르지 않으면 0 (미리보기용)
function rateHundredths(value: string) {
  if (vatRateError(value)) return BigInt(0);
  const [int, frac = ""] = value.split(".");
  return BigInt(int) * BigInt(100) + BigInt((frac + "00").slice(0, 2));
}

export function calcVat(supply: bigint, taxType: QuoteTaxType, vatRate: string) {
  if (taxType !== "TAXABLE") return BigInt(0);
  return (supply * rateHundredths(vatRate)) / BigInt(10000); // 양수 나눗셈은 버림
}

export function quoteTotals(items: { quantity: string; unitPrice: string }[], taxType: QuoteTaxType, vatRate: string) {
  const amounts = items.map((i) => BigInt(i.quantity || "0") * BigInt(i.unitPrice || "0"));
  const supply = amounts.reduce((sum, a) => sum + a, BigInt(0));
  const vat = calcVat(supply, taxType, vatRate);
  const total = supply + vat;
  return { amounts, supply, vat, total, overflow: total > MAX_AMOUNT || amounts.some((a) => a > MAX_AMOUNT) };
}
