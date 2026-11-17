-- AlterTable
ALTER TABLE "project_partner_model" ADD COLUMN     "tax_type" "ProjectQuoteTaxType" NOT NULL DEFAULT 'TAXABLE',
ADD COLUMN     "total_amount" DECIMAL(15,0),
ADD COLUMN     "vat_amount" DECIMAL(15,0),
ADD COLUMN     "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "project_quote_version_model" ADD COLUMN     "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "project_sale_model" ADD COLUMN     "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 10;

-- 직접 작성 (2026-11-17 사용자 결정: 부가세율 직접 입력, 기본 10%, 협력사도 과세/면세 + 부가세)
-- migrate dev --create-only가 DB 권한 오류로 멈춰 migrate diff --from-config-datasource로 만들었다.

-- 기존 협력사: 지금까지 금액은 공급가액이었고 과세·10%로 본다 → 부가세·합계를 채운다
UPDATE "project_partner_model"
SET "vat_amount" = FLOOR("contract_amount" * 10 / 100),
    "total_amount" = "contract_amount" + FLOOR("contract_amount" * 10 / 100)
WHERE "contract_amount" IS NOT NULL;

-- 부가세율 0 ~ 100%
ALTER TABLE "project_quote_version_model" ADD CONSTRAINT "project_quote_version_model_vat_rate_check" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 100);
ALTER TABLE "project_sale_model" ADD CONSTRAINT "project_sale_model_vat_rate_check" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 100);
ALTER TABLE "project_partner_model" ADD CONSTRAINT "project_partner_model_vat_rate_check" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 100);
