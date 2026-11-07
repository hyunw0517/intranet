-- CreateTable
CREATE TABLE "auth_session_model" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_version" INTEGER NOT NULL,
    "current_jti" UUID NOT NULL,
    "previous_jti" UUID,
    "rotated_at" TIMESTAMP(3),
    "user_agent" VARCHAR(500),
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_session_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_session_model_user_id_idx" ON "auth_session_model"("user_id");

-- AddForeignKey
ALTER TABLE "auth_session_model" ADD CONSTRAINT "auth_session_model_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
