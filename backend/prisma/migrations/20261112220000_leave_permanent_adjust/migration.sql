-- AlterTable
ALTER TABLE "leave_grant_model" ADD COLUMN     "permanent_days" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "leave_user_setting_model" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "permanent_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "permanent_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_user_setting_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_user_setting_model_user_id_key" ON "leave_user_setting_model"("user_id");

-- AddForeignKey
ALTER TABLE "leave_user_setting_model" ADD CONSTRAINT "leave_user_setting_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

