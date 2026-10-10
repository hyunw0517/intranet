/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `users_model` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "FileTargetType" AS ENUM ('USER_PROFILE', 'POST');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'GUEST';

-- AlterTable
ALTER TABLE "users_model" ADD COLUMN     "birthday" DATE,
ADD COLUMN     "nickname" TEXT;

-- CreateTable
CREATE TABLE "files_model" (
    "id" SERIAL NOT NULL,
    "target_type" "FileTargetType",
    "target_id" INTEGER,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_id" INTEGER,

    CONSTRAINT "files_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_model_stored_name_key" ON "files_model"("stored_name");

-- CreateIndex
CREATE INDEX "files_model_target_type_target_id_idx" ON "files_model"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_model_email_key" ON "users_model"("email") WHERE ("deleted" = false);
