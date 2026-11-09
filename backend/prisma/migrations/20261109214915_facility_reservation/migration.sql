-- CreateEnum
CREATE TYPE "FacilityReservationStatus" AS ENUM ('RESERVED', 'CANCELLED');

-- AlterEnum
BEGIN;
CREATE TYPE "AuditTargetType_new" AS ENUM ('USER', 'AUTH_SESSION', 'DEPARTMENT', 'POSITION', 'JOB_TITLE', 'USER_DEPARTMENT', 'BOARD', 'BOARD_AUTH', 'POST', 'COMMENT', 'FILE', 'FACILITY_CATEGORY', 'FACILITY', 'FACILITY_RESERVATION', 'APPROVAL_LINE', 'APPROVAL', 'LEAVE');
ALTER TABLE "audit_model" ALTER COLUMN "target_type" TYPE "AuditTargetType_new" USING ("target_type"::text::"AuditTargetType_new");
ALTER TYPE "AuditTargetType" RENAME TO "AuditTargetType_old";
ALTER TYPE "AuditTargetType_new" RENAME TO "AuditTargetType";
DROP TYPE "public"."AuditTargetType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationTargetType_new" AS ENUM ('USER', 'POST', 'COMMENT', 'APPROVAL', 'FACILITY_RESERVATION', 'CHAT_ROOM');
ALTER TABLE "notification_model" ALTER COLUMN "target_type" TYPE "NotificationTargetType_new" USING ("target_type"::text::"NotificationTargetType_new");
ALTER TYPE "NotificationTargetType" RENAME TO "NotificationTargetType_old";
ALTER TYPE "NotificationTargetType_new" RENAME TO "NotificationTargetType";
DROP TYPE "public"."NotificationTargetType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "meeting_room_reservation_model" DROP CONSTRAINT "meeting_room_reservation_model_meeting_room_id_fkey";

-- DropForeignKey
ALTER TABLE "meeting_room_reservation_model" DROP CONSTRAINT "meeting_room_reservation_model_user_id_fkey";

-- DropForeignKey
ALTER TABLE "meeting_room_unavailable_model" DROP CONSTRAINT "meeting_room_unavailable_model_meeting_room_id_fkey";

-- DropTable
DROP TABLE "meeting_room_model";

-- DropTable
DROP TABLE "meeting_room_reservation_model";

-- DropTable
DROP TABLE "meeting_room_unavailable_model";

-- DropEnum
DROP TYPE "MeetingReservationStatus";

-- CreateTable
CREATE TABLE "facility_category_model" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "facility_category_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_model" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "capacity" INTEGER,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "facility_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_reservation_model" (
    "id" SERIAL NOT NULL,
    "facility_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" "FacilityReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "facility_reservation_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_unavailable_model" (
    "id" SERIAL NOT NULL,
    "facility_id" INTEGER NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "facility_unavailable_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "facility_category_model_deleted_sort_order_idx" ON "facility_category_model"("deleted", "sort_order");

-- CreateIndex
CREATE INDEX "facility_model_category_id_deleted_is_active_idx" ON "facility_model"("category_id", "deleted", "is_active");

-- CreateIndex
CREATE INDEX "facility_reservation_model_facility_id_status_start_at_end__idx" ON "facility_reservation_model"("facility_id", "status", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "facility_reservation_model_user_id_status_start_at_idx" ON "facility_reservation_model"("user_id", "status", "start_at");

-- CreateIndex
CREATE INDEX "facility_unavailable_model_facility_id_deleted_start_at_end_idx" ON "facility_unavailable_model"("facility_id", "deleted", "start_at", "end_at");

-- AddForeignKey
ALTER TABLE "facility_model" ADD CONSTRAINT "facility_model_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "facility_category_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_reservation_model" ADD CONSTRAINT "facility_reservation_model_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_reservation_model" ADD CONSTRAINT "facility_reservation_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_unavailable_model" ADD CONSTRAINT "facility_unavailable_model_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

