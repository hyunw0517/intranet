/*
  Warnings:

  - The `target_type` column on the `audit_model` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `deleted` on the `notification_model` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `notification_model` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_id` on the `notification_model` table. All the data in the column will be lost.
  - The `target_type` column on the `notification_model` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `action_type` on the `audit_model` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `action_type` on the `notification_model` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "NotificationTargetType" AS ENUM ('POST', 'COMMENT', 'APPROVAL', 'MEETING_RESERVATION', 'CHAT_ROOM');

-- CreateEnum
CREATE TYPE "NotificationActionType" AS ENUM ('SYSTEM', 'NOTICE_CREATED', 'POST_COMMENTED', 'COMMENT_REPLIED', 'APPROVAL_REQUESTED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED', 'RESERVATION_CANCELLED', 'CHAT_MESSAGE');

-- CreateEnum
CREATE TYPE "AuditTargetType" AS ENUM ('USER', 'AUTH_SESSION', 'DEPARTMENT', 'POSITION', 'JOB_TITLE', 'USER_DEPARTMENT', 'BOARD', 'BOARD_AUTH', 'POST', 'COMMENT', 'FILE', 'MEETING_ROOM', 'MEETING_RESERVATION', 'APPROVAL_LINE', 'APPROVAL', 'LEAVE');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'ROLE_CHANGE', 'STATUS_CHANGE', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGE', 'PASSWORD_RESET', 'TOKEN_REUSE');

-- DropIndex
DROP INDEX "notification_model_user_id_deleted_created_at_id_idx";

-- AlterTable
ALTER TABLE "audit_model" ADD COLUMN     "detail" JSONB,
DROP COLUMN "target_type",
ADD COLUMN     "target_type" "AuditTargetType",
DROP COLUMN "action_type",
ADD COLUMN     "action_type" "AuditActionType" NOT NULL;

-- AlterTable
ALTER TABLE "notification_model" DROP COLUMN "deleted",
DROP COLUMN "deleted_at",
DROP COLUMN "deleted_id",
ADD COLUMN     "link" TEXT,
DROP COLUMN "target_type",
ADD COLUMN     "target_type" "NotificationTargetType",
DROP COLUMN "action_type",
ADD COLUMN     "action_type" "NotificationActionType" NOT NULL;

-- DropEnum
DROP TYPE "SystemActionType";

-- DropEnum
DROP TYPE "SystemTargetType";

-- CreateIndex
CREATE INDEX "audit_model_target_type_target_id_created_at_idx" ON "audit_model"("target_type", "target_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_model_user_id_created_at_id_idx" ON "notification_model"("user_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notification_model_user_id_is_read_idx" ON "notification_model"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notification_model_target_type_target_id_created_at_idx" ON "notification_model"("target_type", "target_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_model_created_at_idx" ON "notification_model"("created_at");

-- AddForeignKey
ALTER TABLE "notification_model" ADD CONSTRAINT "notification_model_created_id_fkey" FOREIGN KEY ("created_id") REFERENCES "users_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_model" ADD CONSTRAINT "audit_model_created_id_fkey" FOREIGN KEY ("created_id") REFERENCES "users_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;
