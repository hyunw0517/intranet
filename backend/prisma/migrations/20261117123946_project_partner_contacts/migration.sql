-- 협력사 담당자를 여러 명으로 (2026-11-17 사용자 결정, 직접 기재 유지)
-- 순서: 새 테이블 → 기존 담당자 한 명을 옮김 → 기존 칸 삭제

-- CreateTable
CREATE TABLE "project_partner_contact_model" (
    "id" SERIAL NOT NULL,
    "partner_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "role" VARCHAR(50),
    "hp" VARCHAR(20),
    "email" VARCHAR(100),

    CONSTRAINT "project_partner_contact_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_partner_contact_model_partner_id_sort_order_idx" ON "project_partner_contact_model"("partner_id", "sort_order");

-- AddForeignKey
ALTER TABLE "project_partner_contact_model" ADD CONSTRAINT "project_partner_contact_model_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "project_partner_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존 담당자 옮기기 (이름 없이 연락처만 적힌 행은 이름을 "담당자"로)
INSERT INTO "project_partner_contact_model" ("partner_id", "sort_order", "name", "hp", "email")
SELECT "id", 0, LEFT(COALESCE(NULLIF(TRIM("contact_name"), ''), '담당자'), 50), "contact_hp", LEFT("contact_email", 100)
FROM "project_partner_model"
WHERE "contact_name" IS NOT NULL OR "contact_hp" IS NOT NULL OR "contact_email" IS NOT NULL;

-- 이름은 빈 문자열 불가
ALTER TABLE "project_partner_contact_model" ADD CONSTRAINT "project_partner_contact_model_name_check" CHECK (LENGTH(TRIM("name")) > 0);

-- AlterTable
ALTER TABLE "project_partner_model" DROP COLUMN "contact_email",
DROP COLUMN "contact_hp",
DROP COLUMN "contact_name";
