-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProjectTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- AlterEnum
ALTER TYPE "AdminPermission" ADD VALUE 'PROJECTS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditTargetType" ADD VALUE 'PROJECT_CLIENT';
ALTER TYPE "AuditTargetType" ADD VALUE 'PROJECT_CLIENT_CONTACT';
ALTER TYPE "AuditTargetType" ADD VALUE 'PROJECT';
ALTER TYPE "AuditTargetType" ADD VALUE 'PROJECT_MEMBER';
ALTER TYPE "AuditTargetType" ADD VALUE 'PROJECT_TASK';

-- CreateTable
CREATE TABLE "project_client_model" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "business_no" VARCHAR(20),
    "ceo_name" TEXT,
    "address" TEXT,
    "tel" VARCHAR(20),
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "project_client_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_client_contact_model" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "job_title" TEXT,
    "hp" VARCHAR(20),
    "email" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "project_client_contact_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_model" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "start_date" DATE,
    "end_date" DATE,
    "client_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "project_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_member_model" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "ProjectMemberRole" NOT NULL DEFAULT 'MEMBER',
    "can_view_amount" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "project_member_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_task_model" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectTaskStatus" NOT NULL DEFAULT 'TODO',
    "assignee_id" INTEGER,
    "due_date" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_id" INTEGER NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "project_task_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_client_model_deleted_name_idx" ON "project_client_model"("deleted", "name");

-- CreateIndex
CREATE UNIQUE INDEX "project_client_model_business_no_key" ON "project_client_model"("business_no") WHERE ("deleted" = false);

-- CreateIndex
CREATE INDEX "project_client_contact_model_client_id_deleted_idx" ON "project_client_contact_model"("client_id", "deleted");

-- CreateIndex
CREATE INDEX "project_model_deleted_status_idx" ON "project_model"("deleted", "status");

-- CreateIndex
CREATE INDEX "project_model_client_id_idx" ON "project_model"("client_id");

-- CreateIndex
CREATE INDEX "project_member_model_user_id_deleted_idx" ON "project_member_model"("user_id", "deleted");

-- CreateIndex
CREATE UNIQUE INDEX "project_member_model_project_id_user_id_key" ON "project_member_model"("project_id", "user_id") WHERE ("deleted" = false);

-- CreateIndex
CREATE INDEX "project_task_model_project_id_deleted_status_sort_order_idx" ON "project_task_model"("project_id", "deleted", "status", "sort_order");

-- CreateIndex
CREATE INDEX "project_task_model_assignee_id_deleted_idx" ON "project_task_model"("assignee_id", "deleted");

-- AddForeignKey
ALTER TABLE "project_client_contact_model" ADD CONSTRAINT "project_client_contact_model_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "project_client_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_model" ADD CONSTRAINT "project_model_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "project_client_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member_model" ADD CONSTRAINT "project_member_model_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member_model" ADD CONSTRAINT "project_member_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task_model" ADD CONSTRAINT "project_task_model_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task_model" ADD CONSTRAINT "project_task_model_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 직접 작성 (Prisma가 만들지 않는 제약, docs/design/projects.md 5장, 2026-11-16 사용자 확인)
-- 프로젝트 기간: 시작·종료일이 둘 다 있으면 시작 <= 종료 (하나라도 비면 통과). 서비스도 같은 규칙을 400으로 먼저 검사한다.
ALTER TABLE "project_model" ADD CONSTRAINT "project_model_period_check"
  CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "start_date" <= "end_date");
