-- 채팅 규칙 확정(2026-11-13): 채팅은 알림 행을 만들지 않음, 방 감사 로그 추가, 메시지 수정 이력

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'CHAT_ROOM';

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationActionType_new" AS ENUM ('SYSTEM', 'SIGNUP_REQUESTED', 'SIGNUP_APPROVED', 'NOTICE_CREATED', 'POST_COMMENTED', 'COMMENT_REPLIED', 'POST_DELETED_BY_ADMIN', 'COMMENT_DELETED_BY_ADMIN', 'SESSION_REVOKED', 'APPROVAL_REQUESTED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED', 'RESERVATION_CANCELLED_BY_ADMIN', 'RESERVATION_UPDATED_BY_ADMIN', 'RESERVATION_DELETED_BY_ADMIN');
ALTER TABLE "notification_model" ALTER COLUMN "action_type" TYPE "NotificationActionType_new" USING ("action_type"::text::"NotificationActionType_new");
ALTER TYPE "NotificationActionType" RENAME TO "NotificationActionType_old";
ALTER TYPE "NotificationActionType_new" RENAME TO "NotificationActionType";
DROP TYPE "public"."NotificationActionType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationTargetType_new" AS ENUM ('USER', 'POST', 'COMMENT', 'APPROVAL', 'FACILITY_RESERVATION');
ALTER TABLE "notification_model" ALTER COLUMN "target_type" TYPE "NotificationTargetType_new" USING ("target_type"::text::"NotificationTargetType_new");
ALTER TYPE "NotificationTargetType" RENAME TO "NotificationTargetType_old";
ALTER TYPE "NotificationTargetType_new" RENAME TO "NotificationTargetType";
DROP TYPE "public"."NotificationTargetType_old";
COMMIT;

-- AlterTable
ALTER TABLE "chat_message_model" ADD COLUMN     "edited_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "chat_message_edit_model" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_edit_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_message_edit_model_message_id_id_idx" ON "chat_message_edit_model"("message_id", "id");

-- AddForeignKey
ALTER TABLE "chat_message_edit_model" ADD CONSTRAINT "chat_message_edit_model_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_message_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
