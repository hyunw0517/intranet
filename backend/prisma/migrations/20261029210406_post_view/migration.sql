-- AlterEnum
ALTER TYPE "FileTargetType" ADD VALUE 'POST_IMAGE';

-- DropIndex
DROP INDEX "post_model_created_id_deleted_created_at_idx";

-- AlterTable
ALTER TABLE "board_model" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "post_model" ADD COLUMN     "is_pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "post_view_model" (
    "post_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_view_model_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateIndex
CREATE INDEX "post_view_model_user_id_idx" ON "post_view_model"("user_id");

-- CreateIndex
CREATE INDEX "post_model_author_id_deleted_created_at_idx" ON "post_model"("author_id", "deleted", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "post_view_model" ADD CONSTRAINT "post_view_model_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_view_model" ADD CONSTRAINT "post_view_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
