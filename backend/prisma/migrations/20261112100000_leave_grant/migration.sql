-- CreateTable
CREATE TABLE "leave_grant_model" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "base_days" DECIMAL(5,2) NOT NULL,
    "adjust_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "adjust_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_grant_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_grant_model_year_idx" ON "leave_grant_model"("year");

-- CreateIndex
CREATE UNIQUE INDEX "leave_grant_model_user_id_year_key" ON "leave_grant_model"("user_id", "year");

-- AddForeignKey
ALTER TABLE "leave_grant_model" ADD CONSTRAINT "leave_grant_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

