/*
  Warnings:

  - You are about to drop the column `position_id` on the `user_department_model` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "user_department_model" DROP CONSTRAINT "user_department_model_position_id_fkey";

-- DropIndex
DROP INDEX "user_department_model_position_id_deleted_idx";

-- AlterTable
ALTER TABLE "user_department_model" DROP COLUMN "position_id";

-- AlterTable
ALTER TABLE "users_model" ADD COLUMN     "position_id" INTEGER;

-- CreateIndex
CREATE INDEX "users_model_position_id_deleted_idx" ON "users_model"("position_id", "deleted");

-- AddForeignKey
ALTER TABLE "users_model" ADD CONSTRAINT "users_model_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;
