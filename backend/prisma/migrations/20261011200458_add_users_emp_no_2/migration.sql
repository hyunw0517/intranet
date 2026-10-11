/*
  Warnings:

  - Made the column `emp_no` on table `users_model` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "users_model" ALTER COLUMN "emp_no" SET NOT NULL;
