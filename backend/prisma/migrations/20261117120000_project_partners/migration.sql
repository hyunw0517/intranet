-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'PROJECT_PARTNER';

-- AlterTable
ALTER TABLE "project_member_model" DROP COLUMN "can_view_amount";

-- CreateTable
CREATE TABLE "project_partner_model" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "work_scope" TEXT,
    "contract_amount" DECIMAL(15,0),
    "start_date" DATE,
    "end_date" DATE,
    "contact_name" TEXT,
    "contact_hp" VARCHAR(20),
    "contact_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "project_partner_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_partner_model_client_id_deleted_idx" ON "project_partner_model"("client_id", "deleted");

-- CreateIndex
CREATE UNIQUE INDEX "project_partner_model_project_id_client_id_key" ON "project_partner_model"("project_id", "client_id") WHERE ("deleted" = false);

-- AddForeignKey
ALTER TABLE "project_partner_model" ADD CONSTRAINT "project_partner_model_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_partner_model" ADD CONSTRAINT "project_partner_model_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "project_client_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 직접 작성 (Prisma가 만들지 않는 제약, docs/design/projects.md "협력사")
-- 이 마이그레이션은 개발 DB에 값이 있는 컬럼(can_view_amount)을 지워서 비대화형 환경에서 migrate dev --create-only가 멈췄다.
-- 그래서 prisma migrate diff --from-config-datasource --to-schema로 SQL을 만들었다. (2026-11-17, 금액 열람 규칙 삭제는 사용자 결정)
ALTER TABLE "project_partner_model" ADD CONSTRAINT "project_partner_model_amount_check"
  CHECK ("contract_amount" IS NULL OR "contract_amount" >= 0);
ALTER TABLE "project_partner_model" ADD CONSTRAINT "project_partner_model_period_check"
  CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "start_date" <= "end_date");
