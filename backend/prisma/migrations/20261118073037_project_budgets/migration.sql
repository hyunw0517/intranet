-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditTargetType" ADD VALUE 'PROJECT_BUDGET_CATEGORY';
ALTER TYPE "AuditTargetType" ADD VALUE 'PROJECT_BUDGET';
ALTER TYPE "AuditTargetType" ADD VALUE 'PROJECT_EXPENSE';

-- AlterEnum
ALTER TYPE "FileTargetType" ADD VALUE 'PROJECT_EXPENSE';

-- CreateTable
CREATE TABLE "project_budget_category_model" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "project_budget_category_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_budget_model" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,

    CONSTRAINT "project_budget_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_expense_model" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "partner_id" INTEGER,
    "title" VARCHAR(100) NOT NULL,
    "expense_date" DATE NOT NULL,
    "tax_type" "ProjectQuoteTaxType" NOT NULL DEFAULT 'TAXABLE',
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "supply_amount" DECIMAL(15,0) NOT NULL,
    "vat_amount" DECIMAL(15,0) NOT NULL,
    "total_amount" DECIMAL(15,0) NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "project_expense_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_budget_category_model_name_key" ON "project_budget_category_model"("name") WHERE ("deleted" = false);

-- CreateIndex
CREATE INDEX "project_budget_model_category_id_idx" ON "project_budget_model"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_budget_model_project_id_category_id_key" ON "project_budget_model"("project_id", "category_id");

-- CreateIndex
CREATE INDEX "project_expense_model_project_id_deleted_expense_date_idx" ON "project_expense_model"("project_id", "deleted", "expense_date");

-- CreateIndex
CREATE INDEX "project_expense_model_category_id_deleted_idx" ON "project_expense_model"("category_id", "deleted");

-- CreateIndex
CREATE INDEX "project_expense_model_partner_id_idx" ON "project_expense_model"("partner_id");

-- CreateIndex
CREATE INDEX "project_expense_model_expense_date_idx" ON "project_expense_model"("expense_date");

-- AddForeignKey
ALTER TABLE "project_budget_model" ADD CONSTRAINT "project_budget_model_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_budget_model" ADD CONSTRAINT "project_budget_model_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "project_budget_category_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_expense_model" ADD CONSTRAINT "project_expense_model_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_expense_model" ADD CONSTRAINT "project_expense_model_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "project_budget_category_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_expense_model" ADD CONSTRAINT "project_expense_model_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "project_partner_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK 제약 (Prisma 스키마로 표현할 수 없어 직접 작성, docs/design/projects.md 5-3장)
ALTER TABLE "project_budget_category_model" ADD CONSTRAINT "project_budget_category_model_name_check" CHECK (LENGTH(TRIM("name")) > 0);
ALTER TABLE "project_budget_model" ADD CONSTRAINT "project_budget_model_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "project_expense_model" ADD CONSTRAINT "project_expense_model_amount_check" CHECK ("supply_amount" >= 0 AND "vat_amount" >= 0 AND "total_amount" = "supply_amount" + "vat_amount");
ALTER TABLE "project_expense_model" ADD CONSTRAINT "project_expense_model_vat_rate_check" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 100);
