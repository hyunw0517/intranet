-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditActionType" ADD VALUE 'LOGIN_LOCKED';
ALTER TYPE "AuditActionType" ADD VALUE 'LOGIN_UNLOCKED';

-- CreateTable
CREATE TABLE "login_history_model" (
    "id" SERIAL NOT NULL,
    "emp_no" VARCHAR(50) NOT NULL,
    "user_id" INTEGER,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "lock_level" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_failed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_history_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "login_history_model_emp_no_key" ON "login_history_model"("emp_no");

-- CreateIndex
CREATE INDEX "login_history_model_last_failed_at_idx" ON "login_history_model"("last_failed_at");
