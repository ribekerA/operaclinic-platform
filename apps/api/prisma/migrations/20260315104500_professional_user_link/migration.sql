ALTER TABLE "professionals"
ADD COLUMN "user_id" UUID;

ALTER TABLE "professionals"
ADD CONSTRAINT "professionals_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE UNIQUE INDEX "professionals_user_id_key"
ON "professionals"("user_id");

CREATE INDEX "idx_professionals_user_id"
ON "professionals"("user_id");
