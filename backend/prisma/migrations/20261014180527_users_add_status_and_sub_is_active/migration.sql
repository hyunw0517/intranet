/*
  Warnings:

  - You are about to drop the column `is_active` on the `users_model` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RESIGNED');

-- AlterTable
ALTER TABLE "users_model" DROP COLUMN "is_active",
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
