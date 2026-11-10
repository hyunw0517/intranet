-- DropIndex
DROP INDEX "approval_document_step_model_approval_document_id_step_orde_key";

-- DropIndex
DROP INDEX "approval_document_step_one_pending";

-- DropIndex
DROP INDEX "approval_line_template_step_model_approval_line_template_id_key";

-- CreateIndex
CREATE INDEX "approval_document_step_model_approval_document_id_step_orde_idx" ON "approval_document_step_model"("approval_document_id", "step_order");

-- CreateIndex
CREATE UNIQUE INDEX "approval_document_step_model_approval_document_id_approver__key" ON "approval_document_step_model"("approval_document_id", "approver_id");

-- CreateIndex
CREATE INDEX "approval_line_template_step_model_approval_line_template_id_idx" ON "approval_line_template_step_model"("approval_line_template_id", "step_order");

-- CreateIndex
CREATE UNIQUE INDEX "approval_line_template_step_model_approval_line_template_id_key" ON "approval_line_template_step_model"("approval_line_template_id", "approver_id");



-- ↓ Prisma 스키마로 표현할 수 없는 제약 (직접 작성, docs/design/features.md 7.5 병렬 단계)

-- 같은 문서의 PENDING(지금 차례) 행은 모두 같은 단계 번호여야 한다 - 상태 전이의 최종 방어선
-- (예전의 "문서당 PENDING 하나" 부분 unique를 대신한다: 병렬 단계는 PENDING이 여럿일 수 있지만 두 단계에 걸치면 안 된다)
-- 정수의 <> 비교는 btree_gist가 제공한다 (시설 예약 마이그레이션에서 이미 설치, 위반 시 SQLSTATE 23P01)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "approval_document_step_model" ADD CONSTRAINT "approval_document_step_pending_same_step"
    EXCLUDE USING gist ("approval_document_id" WITH =, "step_order" WITH <>)
    WHERE ("status" = 'PENDING');
