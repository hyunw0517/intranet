-- CreateEnum
CREATE TYPE "ProjectQuoteTaxType" AS ENUM ('TAXABLE', 'EXEMPT');

-- CreateEnum
CREATE TYPE "ProjectQuoteStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ApprovalDocumentType" ADD VALUE 'QUOTE';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'PROJECT_QUOTE';

-- CreateTable
CREATE TABLE "project_quote_model" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "quote_no" VARCHAR(20) NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "project_quote_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_quote_version_model" (
    "id" SERIAL NOT NULL,
    "quote_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ProjectQuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "tax_type" "ProjectQuoteTaxType" NOT NULL DEFAULT 'TAXABLE',
    "quote_date" DATE NOT NULL,
    "valid_until" DATE,
    "client_id" INTEGER,
    "client_name" TEXT NOT NULL,
    "client_business_no" VARCHAR(20),
    "client_ceo_name" TEXT,
    "client_address" TEXT,
    "client_tel" VARCHAR(20),
    "contact_id" INTEGER,
    "contact_name" TEXT,
    "contact_department" TEXT,
    "contact_job_title" TEXT,
    "contact_hp" VARCHAR(20),
    "contact_email" TEXT,
    "supply_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "note" TEXT,
    "approval_document_id" INTEGER,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_id" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,

    CONSTRAINT "project_quote_version_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_quote_item_model" (
    "id" SERIAL NOT NULL,
    "version_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(15,0) NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "note" TEXT,

    CONSTRAINT "project_quote_item_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_quote_sequence_model" (
    "year" INTEGER NOT NULL,
    "last_no" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_quote_sequence_model_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_quote_model_quote_no_key" ON "project_quote_model"("quote_no");

-- CreateIndex
CREATE INDEX "project_quote_model_project_id_deleted_idx" ON "project_quote_model"("project_id", "deleted");

-- CreateIndex
CREATE UNIQUE INDEX "project_quote_version_model_approval_document_id_key" ON "project_quote_version_model"("approval_document_id");

-- CreateIndex
CREATE INDEX "project_quote_version_model_status_idx" ON "project_quote_version_model"("status");

-- CreateIndex
CREATE UNIQUE INDEX "project_quote_version_model_quote_id_version_key" ON "project_quote_version_model"("quote_id", "version");

-- CreateIndex
CREATE INDEX "project_quote_item_model_version_id_sort_order_idx" ON "project_quote_item_model"("version_id", "sort_order");

-- AddForeignKey
ALTER TABLE "project_quote_model" ADD CONSTRAINT "project_quote_model_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_quote_version_model" ADD CONSTRAINT "project_quote_version_model_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "project_quote_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_quote_item_model" ADD CONSTRAINT "project_quote_item_model_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "project_quote_version_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;
