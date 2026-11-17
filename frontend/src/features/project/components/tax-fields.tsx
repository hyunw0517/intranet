"use client";

import { FormField } from "@/components/common/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QUOTE_TAX_LABEL, type QuoteTaxType } from "@/types/project";
import { sanitizeVatRate } from "../quote-calc";

// 과세/면세 선택 + 부가세율(%) 입력 - 견적·매출·협력사가 같이 쓴다 (2026-11-17 사용자 결정, 기본 과세 10%)
// 면세면 부가세율 칸은 잠근다(값은 그대로 두었다가 다시 과세로 바꾸면 쓴다).
export function TaxFields({
  idPrefix,
  taxType,
  vatRate,
  onTaxTypeChange,
  onVatRateChange,
  disabled,
  error,
}: {
  idPrefix: string;
  taxType: QuoteTaxType;
  vatRate: string;
  onTaxTypeChange: (value: QuoteTaxType) => void;
  onVatRateChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const rateId = `${idPrefix}-vat-rate`;
  return (
    <>
      <FormField id={`${idPrefix}-tax`} label="과세">
        <Select value={taxType} onValueChange={(v) => onTaxTypeChange(v as QuoteTaxType)} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-tax`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(QUOTE_TAX_LABEL) as QuoteTaxType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {QUOTE_TAX_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField id={rateId} label="부가세율 (%)" error={error}>
        <div className="relative">
          <Input
            id={rateId}
            inputMode="decimal"
            value={vatRate}
            onChange={(e) => onVatRateChange(sanitizeVatRate(e.target.value))}
            disabled={disabled || taxType !== "TAXABLE"}
            aria-invalid={!!error}
            aria-describedby={`${rateId}-message`}
            className="pr-7"
            placeholder="10"
          />
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground" aria-hidden>
            %
          </span>
        </div>
      </FormField>
    </>
  );
}
