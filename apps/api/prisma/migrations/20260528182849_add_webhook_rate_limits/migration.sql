-- AlterTable
ALTER TABLE "agent_executions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "appointment_follow_up_dispatches" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "webhook_rate_limits" (
    "id" UUID NOT NULL,
    "fingerprint" VARCHAR(160) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "reset_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_rate_limits_fingerprint_key" ON "webhook_rate_limits"("fingerprint");

-- CreateIndex
CREATE INDEX "idx_webhook_rate_limits_reset_at" ON "webhook_rate_limits"("reset_at");
