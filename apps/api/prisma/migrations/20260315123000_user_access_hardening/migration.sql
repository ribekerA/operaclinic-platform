ALTER TABLE "users"
ADD COLUMN "password_changed_at" TIMESTAMPTZ(6),
ADD COLUMN "password_reset_token_hash" VARCHAR(255),
ADD COLUMN "password_reset_expires_at" TIMESTAMPTZ(6),
ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "idx_users_password_reset_expires_at"
ON "users" ("password_reset_expires_at");
