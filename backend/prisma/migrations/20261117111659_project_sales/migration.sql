-- CreateEnum
CREATE TYPE "ProjectSaleStatus" AS ENUM ('PLANNED', 'BILLED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'PROJECT_SALE';

-- AlterEnum
ALTER TYPE "FileTargetType" ADD VALUE 'PROJECT_SALE';

-- CreateTable
CREATE TABLE "project_sale_model" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "quote_version_id" INTEGER,
    "title" TEXT NOT NULL,
    "status" "ProjectSaleStatus" NOT NULL DEFAULT 'PLANNED',
    "tax_type" "ProjectQuoteTaxType" NOT NULL DEFAULT 'TAXABLE',
    "supply_amount" DECIMAL(15,0) NOT NULL,
    "vat_amount" DECIMAL(15,0) NOT NULL,
    "total_amount" DECIMAL(15,0) NOT NULL,
    "planned_date" DATE,
    "billed_date" DATE,
    "tax_invoice_no" VARCHAR(30),
    "memo" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "project_sale_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_sale_payment_model" (
    "id" SERIAL NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "paid_date" DATE NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "project_sale_payment_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_sale_model_project_id_deleted_status_idx" ON "project_sale_model"("project_id", "deleted", "status");

-- CreateIndex
CREATE INDEX "project_sale_model_quote_version_id_idx" ON "project_sale_model"("quote_version_id");

-- CreateIndex
CREATE INDEX "project_sale_model_billed_date_idx" ON "project_sale_model"("billed_date");

-- CreateIndex
CREATE INDEX "project_sale_payment_model_sale_id_deleted_idx" ON "project_sale_payment_model"("sale_id", "deleted");

-- AddForeignKey
ALTER TABLE "project_sale_model" ADD CONSTRAINT "project_sale_model_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sale_model" ADD CONSTRAINT "project_sale_model_quote_version_id_fkey" FOREIGN KEY ("quote_version_id") REFERENCES "project_quote_version_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sale_payment_model" ADD CONSTRAINT "project_sale_payment_model_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "project_sale_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 직접 작성 (Prisma가 만들지 않는 제약, docs/design/projects.md 5-2장 매출)
-- migrate dev --create-only가 DB 권한 오류(permission denied to terminate process)로 멈춰 migrate diff --from-config-datasource로 만들었다.
ALTER TABLE "project_sale_model" ADD CONSTRAINT "project_sale_model_amount_check"
  CHECK ("supply_amount" >= 0 AND "vat_amount" >= 0 AND "total_amount" >= 0);
-- 청구(BILLED)면 청구일 필수 (청구했다가 취소한 건은 청구일이 남는다)
ALTER TABLE "project_sale_model" ADD CONSTRAINT "project_sale_model_billed_date_check"
  CHECK ("status" <> 'BILLED' OR "billed_date" IS NOT NULL);
ALTER TABLE "project_sale_payment_model" ADD CONSTRAINT "project_sale_payment_model_amount_check" CHECK ("amount" > 0);
