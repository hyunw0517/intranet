/*
  Warnings:

  - The `role` column on the `users_model` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('GUEST', 'USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "BoardType" AS ENUM ('CATEGORY', 'NORMAL', 'NOTICE', 'CALENDAR');

-- CreateEnum
CREATE TYPE "SystemTargetType" AS ENUM ('USER', 'POST', 'APPROVAL', 'LEAVE', 'MEETING_ROOM', 'MEETING_RESERVATION', 'CHAT_MESSAGE');

-- CreateEnum
CREATE TYPE "SystemActionType" AS ENUM ('SYSTEM', 'APPROVED', 'REJECTED', 'CREATE', 'UPDATE', 'DELETE', 'LOGIN');

-- CreateEnum
CREATE TYPE "MeetingReservationStatus" AS ENUM ('RESERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'CANCELLED', 'REQUESTED', 'IN_PROGRESS', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalDocumentType" AS ENUM ('GENERAL', 'LEAVE');

-- CreateEnum
CREATE TYPE "ApprovalStepStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalLineScope" AS ENUM ('ADMIN', 'DEPARTMENT', 'PERSONAL');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'OFFICIAL');

-- CreateEnum
CREATE TYPE "LeaveUnit" AS ENUM ('FULL', 'HALF', 'QUARTER');

-- CreateEnum
CREATE TYPE "ChatRoomType" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "ChatRoomMemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'FILE', 'SYSTEM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FileTargetType" ADD VALUE 'APPROVAL_DOCUMENT';
ALTER TYPE "FileTargetType" ADD VALUE 'CHAT_MESSAGE';

-- AlterTable
ALTER TABLE "users_model" ADD COLUMN     "joinAt" DATE,
DROP COLUMN "role",
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'GUEST';

-- DropEnum
DROP TYPE "Role";

-- CreateTable
CREATE TABLE "department_model" (
    "id" SERIAL NOT NULL,
    "parent_department_id" INTEGER,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "department_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_model" (
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

    CONSTRAINT "position_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_title_model" (
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

    CONSTRAINT "job_title_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_department_model" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,
    "position_id" INTEGER NOT NULL,
    "job_title_id" INTEGER,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "user_department_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_model" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "target_type" "SystemTargetType",
    "target_id" INTEGER,
    "action_type" "SystemActionType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "notification_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_model" (
    "id" BIGSERIAL NOT NULL,
    "target_type" "SystemTargetType",
    "target_id" INTEGER,
    "action_type" "SystemActionType" NOT NULL,
    "content" TEXT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER,

    CONSTRAINT "audit_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_model" (
    "id" SERIAL NOT NULL,
    "parent_board_id" INTEGER,
    "type" "BoardType" NOT NULL DEFAULT 'NORMAL',
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "board_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_model" (
    "id" SERIAL NOT NULL,
    "board_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "event_start_at" TIMESTAMP(3),
    "event_end_at" TIMESTAMP(3),
    "is_all_day" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "post_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_model" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "parent_comment_id" INTEGER,
    "author_id" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "comment_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_auth_model" (
    "id" SERIAL NOT NULL,
    "board_id" INTEGER NOT NULL,
    "department_id" INTEGER,
    "include_sub_department" BOOLEAN NOT NULL DEFAULT false,
    "position_id" INTEGER,
    "auth_admin" BOOLEAN NOT NULL DEFAULT false,
    "auth_read" BOOLEAN NOT NULL DEFAULT true,
    "auth_write" BOOLEAN NOT NULL DEFAULT false,
    "auth_comment" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "board_auth_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_auth_job_title_model" (
    "board_auth_id" INTEGER NOT NULL,
    "job_title_id" INTEGER NOT NULL,

    CONSTRAINT "board_auth_job_title_model_pkey" PRIMARY KEY ("board_auth_id","job_title_id")
);

-- CreateTable
CREATE TABLE "meeting_room_model" (
    "id" SERIAL NOT NULL,
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

    CONSTRAINT "meeting_room_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_room_reservation_model" (
    "id" SERIAL NOT NULL,
    "meeting_room_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" "MeetingReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "meeting_room_reservation_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_room_unavailable_model" (
    "id" SERIAL NOT NULL,
    "meeting_room_id" INTEGER NOT NULL,
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

    CONSTRAINT "meeting_room_unavailable_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_line_template_model" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "ApprovalLineScope" NOT NULL,
    "department_id" INTEGER,
    "owner_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "approval_line_template_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_line_template_step_model" (
    "id" SERIAL NOT NULL,
    "approval_line_template_id" INTEGER NOT NULL,
    "approver_id" INTEGER NOT NULL,
    "step_order" INTEGER NOT NULL,
    "name" TEXT,

    CONSTRAINT "approval_line_template_step_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_document_model" (
    "id" SERIAL NOT NULL,
    "requester_id" INTEGER NOT NULL,
    "approval_line_template_id" INTEGER,
    "document_type" "ApprovalDocumentType" NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "content" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "current_step_order" INTEGER,
    "requested_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "approval_document_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_document_step_model" (
    "id" SERIAL NOT NULL,
    "approval_document_id" INTEGER NOT NULL,
    "approver_id" INTEGER NOT NULL,
    "step_order" INTEGER NOT NULL,
    "status" "ApprovalStepStatus" NOT NULL DEFAULT 'WAITING',
    "comment" TEXT,
    "acted_at" TIMESTAMP(3),
    "approver_name" TEXT NOT NULL,
    "department_name" TEXT,
    "position_name" TEXT,
    "job_title_name" TEXT,

    CONSTRAINT "approval_document_step_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_document_history_model" (
    "id" BIGSERIAL NOT NULL,
    "approval_document_id" INTEGER NOT NULL,
    "actor_id" INTEGER,
    "from_status" "ApprovalStatus",
    "to_status" "ApprovalStatus" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_document_history_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request_model" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "approval_document_id" INTEGER NOT NULL,
    "type" "LeaveType" NOT NULL,
    "unit" "LeaveUnit" NOT NULL DEFAULT 'FULL',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_time" TIME(0),
    "end_time" TIME(0),
    "days" DECIMAL(5,2) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_request_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_room_model" (
    "id" SERIAL NOT NULL,
    "type" "ChatRoomType" NOT NULL,
    "name" TEXT,
    "direct_key" TEXT,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "chat_room_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_room_member_model" (
    "chat_room_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "ChatRoomMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "last_read_message_id" INTEGER,

    CONSTRAINT "chat_room_member_model_pkey" PRIMARY KEY ("chat_room_id","user_id")
);

-- CreateTable
CREATE TABLE "chat_message_model" (
    "id" SERIAL NOT NULL,
    "chat_room_id" INTEGER NOT NULL,
    "sender_id" INTEGER,
    "type" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "chat_message_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "department_model_parent_department_id_deleted_idx" ON "department_model"("parent_department_id", "deleted");

-- CreateIndex
CREATE INDEX "user_department_model_user_id_deleted_idx" ON "user_department_model"("user_id", "deleted");

-- CreateIndex
CREATE INDEX "user_department_model_department_id_deleted_idx" ON "user_department_model"("department_id", "deleted");

-- CreateIndex
CREATE INDEX "user_department_model_position_id_deleted_idx" ON "user_department_model"("position_id", "deleted");

-- CreateIndex
CREATE INDEX "user_department_model_job_title_id_deleted_idx" ON "user_department_model"("job_title_id", "deleted");

-- CreateIndex
CREATE UNIQUE INDEX "user_department_model_user_id_key" ON "user_department_model"("user_id") WHERE ("is_primary" = true AND "deleted" = false);

-- CreateIndex
CREATE INDEX "notification_model_user_id_deleted_created_at_id_idx" ON "notification_model"("user_id", "deleted", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notification_model_target_type_target_id_created_at_idx" ON "notification_model"("target_type", "target_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_model_created_id_created_at_idx" ON "audit_model"("created_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_model_target_type_target_id_created_at_idx" ON "audit_model"("target_type", "target_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "board_model_parent_board_id_deleted_sort_order_idx" ON "board_model"("parent_board_id", "deleted", "sort_order");

-- CreateIndex
CREATE INDEX "post_model_board_id_deleted_created_at_idx" ON "post_model"("board_id", "deleted", "created_at" DESC);

-- CreateIndex
CREATE INDEX "post_model_created_id_deleted_created_at_idx" ON "post_model"("created_id", "deleted", "created_at" DESC);

-- CreateIndex
CREATE INDEX "post_model_board_id_deleted_event_start_at_idx" ON "post_model"("board_id", "deleted", "event_start_at");

-- CreateIndex
CREATE INDEX "comment_model_post_id_deleted_created_at_idx" ON "comment_model"("post_id", "deleted", "created_at" DESC);

-- CreateIndex
CREATE INDEX "comment_model_parent_comment_id_deleted_idx" ON "comment_model"("parent_comment_id", "deleted");

-- CreateIndex
CREATE INDEX "board_auth_model_board_id_deleted_idx" ON "board_auth_model"("board_id", "deleted");

-- CreateIndex
CREATE INDEX "board_auth_model_department_id_position_id_idx" ON "board_auth_model"("department_id", "position_id");

-- CreateIndex
CREATE INDEX "board_auth_job_title_model_job_title_id_idx" ON "board_auth_job_title_model"("job_title_id");

-- CreateIndex
CREATE INDEX "meeting_room_model_deleted_is_active_idx" ON "meeting_room_model"("deleted", "is_active");

-- CreateIndex
CREATE INDEX "meeting_room_reservation_model_meeting_room_id_status_start_idx" ON "meeting_room_reservation_model"("meeting_room_id", "status", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "meeting_room_reservation_model_user_id_status_start_at_idx" ON "meeting_room_reservation_model"("user_id", "status", "start_at");

-- CreateIndex
CREATE INDEX "meeting_room_unavailable_model_meeting_room_id_deleted_star_idx" ON "meeting_room_unavailable_model"("meeting_room_id", "deleted", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "approval_line_template_model_scope_department_id_deleted_idx" ON "approval_line_template_model"("scope", "department_id", "deleted");

-- CreateIndex
CREATE INDEX "approval_line_template_model_scope_owner_user_id_deleted_idx" ON "approval_line_template_model"("scope", "owner_user_id", "deleted");

-- CreateIndex
CREATE INDEX "approval_line_template_step_model_approver_id_idx" ON "approval_line_template_step_model"("approver_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_line_template_step_model_approval_line_template_id_key" ON "approval_line_template_step_model"("approval_line_template_id", "step_order");

-- CreateIndex
CREATE INDEX "approval_document_model_requester_id_status_created_at_idx" ON "approval_document_model"("requester_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "approval_document_model_status_created_at_idx" ON "approval_document_model"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "approval_document_step_model_approver_id_status_idx" ON "approval_document_step_model"("approver_id", "status");

-- CreateIndex
CREATE INDEX "approval_document_step_model_approval_document_id_status_idx" ON "approval_document_step_model"("approval_document_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_document_step_model_approval_document_id_step_orde_key" ON "approval_document_step_model"("approval_document_id", "step_order");

-- CreateIndex
CREATE INDEX "approval_document_history_model_approval_document_id_create_idx" ON "approval_document_history_model"("approval_document_id", "created_at");

-- CreateIndex
CREATE INDEX "approval_document_history_model_actor_id_created_at_idx" ON "approval_document_history_model"("actor_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "leave_request_model_approval_document_id_key" ON "leave_request_model"("approval_document_id");

-- CreateIndex
CREATE INDEX "leave_request_model_user_id_type_start_date_idx" ON "leave_request_model"("user_id", "type", "start_date" DESC);

-- CreateIndex
CREATE INDEX "chat_room_model_type_deleted_idx" ON "chat_room_model"("type", "deleted");

-- CreateIndex
CREATE INDEX "chat_room_model_last_message_at_idx" ON "chat_room_model"("last_message_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "chat_room_model_direct_key_key" ON "chat_room_model"("direct_key") WHERE ("deleted" = false);

-- CreateIndex
CREATE INDEX "chat_room_member_model_user_id_left_at_idx" ON "chat_room_member_model"("user_id", "left_at");

-- CreateIndex
CREATE INDEX "chat_message_model_chat_room_id_deleted_id_idx" ON "chat_message_model"("chat_room_id", "deleted", "id" DESC);

-- CreateIndex
CREATE INDEX "chat_message_model_sender_id_created_at_idx" ON "chat_message_model"("sender_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "department_model" ADD CONSTRAINT "department_model_parent_department_id_fkey" FOREIGN KEY ("parent_department_id") REFERENCES "department_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_department_model" ADD CONSTRAINT "user_department_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_department_model" ADD CONSTRAINT "user_department_model_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_department_model" ADD CONSTRAINT "user_department_model_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_department_model" ADD CONSTRAINT "user_department_model_job_title_id_fkey" FOREIGN KEY ("job_title_id") REFERENCES "job_title_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_model" ADD CONSTRAINT "notification_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_model" ADD CONSTRAINT "board_model_parent_board_id_fkey" FOREIGN KEY ("parent_board_id") REFERENCES "board_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_model" ADD CONSTRAINT "post_model_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_model" ADD CONSTRAINT "post_model_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_model" ADD CONSTRAINT "comment_model_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_model" ADD CONSTRAINT "comment_model_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_model" ADD CONSTRAINT "comment_model_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "comment_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_auth_model" ADD CONSTRAINT "board_auth_model_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_auth_model" ADD CONSTRAINT "board_auth_model_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_auth_model" ADD CONSTRAINT "board_auth_model_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_auth_job_title_model" ADD CONSTRAINT "board_auth_job_title_model_board_auth_id_fkey" FOREIGN KEY ("board_auth_id") REFERENCES "board_auth_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_auth_job_title_model" ADD CONSTRAINT "board_auth_job_title_model_job_title_id_fkey" FOREIGN KEY ("job_title_id") REFERENCES "job_title_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_room_reservation_model" ADD CONSTRAINT "meeting_room_reservation_model_meeting_room_id_fkey" FOREIGN KEY ("meeting_room_id") REFERENCES "meeting_room_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_room_reservation_model" ADD CONSTRAINT "meeting_room_reservation_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_room_unavailable_model" ADD CONSTRAINT "meeting_room_unavailable_model_meeting_room_id_fkey" FOREIGN KEY ("meeting_room_id") REFERENCES "meeting_room_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_line_template_model" ADD CONSTRAINT "approval_line_template_model_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_line_template_model" ADD CONSTRAINT "approval_line_template_model_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_line_template_step_model" ADD CONSTRAINT "approval_line_template_step_model_approval_line_template_i_fkey" FOREIGN KEY ("approval_line_template_id") REFERENCES "approval_line_template_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_line_template_step_model" ADD CONSTRAINT "approval_line_template_step_model_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_document_model" ADD CONSTRAINT "approval_document_model_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_document_model" ADD CONSTRAINT "approval_document_model_approval_line_template_id_fkey" FOREIGN KEY ("approval_line_template_id") REFERENCES "approval_line_template_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_document_step_model" ADD CONSTRAINT "approval_document_step_model_approval_document_id_fkey" FOREIGN KEY ("approval_document_id") REFERENCES "approval_document_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_document_step_model" ADD CONSTRAINT "approval_document_step_model_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_document_history_model" ADD CONSTRAINT "approval_document_history_model_approval_document_id_fkey" FOREIGN KEY ("approval_document_id") REFERENCES "approval_document_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_document_history_model" ADD CONSTRAINT "approval_document_history_model_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request_model" ADD CONSTRAINT "leave_request_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request_model" ADD CONSTRAINT "leave_request_model_approval_document_id_fkey" FOREIGN KEY ("approval_document_id") REFERENCES "approval_document_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_room_member_model" ADD CONSTRAINT "chat_room_member_model_chat_room_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "chat_room_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_room_member_model" ADD CONSTRAINT "chat_room_member_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_model" ADD CONSTRAINT "chat_message_model_chat_room_id_fkey" FOREIGN KEY ("chat_room_id") REFERENCES "chat_room_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_model" ADD CONSTRAINT "chat_message_model_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;
