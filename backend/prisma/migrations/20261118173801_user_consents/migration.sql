-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TERMS_OF_SERVICE', 'PRIVACY_COLLECTION');

-- CreateEnum
CREATE TYPE "ConsentAction" AS ENUM ('AGREE', 'WITHDRAW');

-- CreateTable
CREATE TABLE "user_consent_model" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "ConsentType" NOT NULL,
    "action" "ConsentAction" NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_consent_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_consent_model_user_id_type_created_at_idx" ON "user_consent_model"("user_id", "type", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "user_consent_model" ADD CONSTRAINT "user_consent_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
