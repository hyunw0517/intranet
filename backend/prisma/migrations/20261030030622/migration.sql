-- AlterTable
ALTER TABLE "board_model" ADD COLUMN     "allow_secret" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_anonymous" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "post_model" ADD COLUMN     "is_secret" BOOLEAN NOT NULL DEFAULT false;
