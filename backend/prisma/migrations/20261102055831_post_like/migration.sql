-- AlterTable
ALTER TABLE "post_model" ADD COLUMN     "like_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "post_like_model" (
    "post_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_like_model_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateIndex
CREATE INDEX "post_like_model_user_id_idx" ON "post_like_model"("user_id");

-- AddForeignKey
ALTER TABLE "post_like_model" ADD CONSTRAINT "post_like_model_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_like_model" ADD CONSTRAINT "post_like_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
