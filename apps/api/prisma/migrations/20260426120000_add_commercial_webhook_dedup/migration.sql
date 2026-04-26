-- Migration: Add commercial_webhook_events table for payment webhook deduplication
-- Prevents duplicate Stripe webhook processing (concurrent retries → one result)

CREATE TABLE "commercial_webhook_events" (
  "id" UUID NOT NULL,
  "provider_event_id" VARCHAR(120) NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "commercial_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_commercial_webhook_events_provider_event_id"
  ON "commercial_webhook_events"("provider_event_id");

CREATE INDEX "idx_commercial_webhook_events_created_at"
  ON "commercial_webhook_events"("created_at");
