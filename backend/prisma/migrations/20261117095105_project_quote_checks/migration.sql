-- 직접 작성 (Prisma가 만들지 않는 제약, docs/design/projects.md 5-1장 견적서)
-- 앞 마이그레이션(20261117095031_project_quotes)에 넣으려던 CHECK인데, migrate dev를 다시 돌리면서 CHECK 없이 먼저 적용돼 새 마이그레이션으로 추가한다.
-- (이미 적용한 마이그레이션은 고치지 않는다 - R-DB-01)

-- 품목: 수량 1 이상, 단가·금액 0 이상
ALTER TABLE "project_quote_item_model" ADD CONSTRAINT "project_quote_item_model_quantity_check" CHECK ("quantity" >= 1);
ALTER TABLE "project_quote_item_model" ADD CONSTRAINT "project_quote_item_model_amount_check" CHECK ("unit_price" >= 0 AND "amount" >= 0);

-- 버전: 금액 0 이상, 유효기간은 견적일 이후, 버전 번호 1 이상
ALTER TABLE "project_quote_version_model" ADD CONSTRAINT "project_quote_version_model_amount_check"
  CHECK ("supply_amount" >= 0 AND "vat_amount" >= 0 AND "total_amount" >= 0);
ALTER TABLE "project_quote_version_model" ADD CONSTRAINT "project_quote_version_model_valid_check"
  CHECK ("valid_until" IS NULL OR "valid_until" >= "quote_date");
ALTER TABLE "project_quote_version_model" ADD CONSTRAINT "project_quote_version_model_version_check" CHECK ("version" >= 1);
