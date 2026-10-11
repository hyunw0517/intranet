/*
  Warnings:

  - A unique constraint covering the columns `[emp_no]` on the table `users_model` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "users_model_emp_no_key" ON "users_model"("emp_no") WHERE ("deleted" = false);
