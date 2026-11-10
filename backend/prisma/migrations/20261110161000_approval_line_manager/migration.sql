-- CreateEnum
CREATE TYPE "ApprovalLineManagerScope" AS ENUM ('ALL', 'DEPARTMENT', 'MY_DEPARTMENT');

-- CreateTable
CREATE TABLE "approval_line_manager_model" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "job_title_id" INTEGER,
    "scope" "ApprovalLineManagerScope" NOT NULL,
    "department_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "approval_line_manager_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_line_manager_model_user_id_deleted_idx" ON "approval_line_manager_model"("user_id", "deleted");

-- CreateIndex
CREATE INDEX "approval_line_manager_model_job_title_id_deleted_idx" ON "approval_line_manager_model"("job_title_id", "deleted");

-- CreateIndex
CREATE UNIQUE INDEX "approval_document_step_one_pending" ON "approval_document_step_model"("approval_document_id") WHERE (status = 'PENDING');

-- AddForeignKey
ALTER TABLE "approval_line_manager_model" ADD CONSTRAINT "approval_line_manager_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_line_manager_model" ADD CONSTRAINT "approval_line_manager_model_job_title_id_fkey" FOREIGN KEY ("job_title_id") REFERENCES "job_title_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_line_manager_model" ADD CONSTRAINT "approval_line_manager_model_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ↓ Prisma 스키마로 표현할 수 없는 제약 (직접 작성, docs/design/features.md 7.5)

-- 결재라인 템플릿: scope와 대상 id의 짝 (Plan.md "처리할 작업"의 미해결 항목)
-- ADMIN(공용) = 부서·소유자 없음 / DEPARTMENT = 부서만 / PERSONAL = 소유자만
ALTER TABLE "approval_line_template_model" ADD CONSTRAINT "approval_line_template_scope_check" CHECK (
    ( "scope" = 'ADMIN'      AND "department_id" IS NULL     AND "owner_user_id" IS NULL )
 OR ( "scope" = 'DEPARTMENT' AND "department_id" IS NOT NULL AND "owner_user_id" IS NULL )
 OR ( "scope" = 'PERSONAL'   AND "department_id" IS NULL     AND "owner_user_id" IS NOT NULL )
);

-- 결재라인 관리자 규칙
-- 대상: 회원 / 직책 중 정확히 하나
ALTER TABLE "approval_line_manager_model" ADD CONSTRAINT "approval_line_manager_target_check" CHECK (
    ( "user_id" IS NULL ) <> ( "job_title_id" IS NULL )
);
-- 범위: DEPARTMENT ⇔ 부서 있음, MY_DEPARTMENT는 직책 대상만 (회원 개인에게 "본인 부서"는 겸직 시 뜻이 모호해 쓰지 않는다)
ALTER TABLE "approval_line_manager_model" ADD CONSTRAINT "approval_line_manager_scope_check" CHECK (
    ( "scope" = 'DEPARTMENT' ) = ( "department_id" IS NOT NULL )
    AND ( "scope" <> 'MY_DEPARTMENT' OR "job_title_id" IS NOT NULL )
);
