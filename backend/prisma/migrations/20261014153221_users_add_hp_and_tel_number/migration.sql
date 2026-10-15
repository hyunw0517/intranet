-- AlterTable
ALTER TABLE "users_model" ADD COLUMN     "hp" VARCHAR(20),
ADD COLUMN     "tel" VARCHAR(20),
ALTER COLUMN "role" SET DEFAULT 'GUEST';
