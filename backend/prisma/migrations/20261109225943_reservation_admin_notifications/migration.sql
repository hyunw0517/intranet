-- AlterEnum
BEGIN;
CREATE TYPE "NotificationActionType_new" AS ENUM ('SYSTEM', 'SIGNUP_REQUESTED', 'SIGNUP_APPROVED', 'NOTICE_CREATED', 'POST_COMMENTED', 'COMMENT_REPLIED', 'POST_DELETED_BY_ADMIN', 'COMMENT_DELETED_BY_ADMIN', 'SESSION_REVOKED', 'APPROVAL_REQUESTED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED', 'RESERVATION_CANCELLED_BY_ADMIN', 'RESERVATION_DELETED_BY_ADMIN', 'CHAT_MESSAGE');
ALTER TABLE "notification_model" ALTER COLUMN "action_type" TYPE "NotificationActionType_new" USING ("action_type"::text::"NotificationActionType_new");
ALTER TYPE "NotificationActionType" RENAME TO "NotificationActionType_old";
ALTER TYPE "NotificationActionType_new" RENAME TO "NotificationActionType";
DROP TYPE "public"."NotificationActionType_old";
COMMIT;

