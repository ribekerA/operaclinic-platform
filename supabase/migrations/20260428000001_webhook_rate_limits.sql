-- Migration: webhook_rate_limits
-- Purpose: Persist per-origin rate limiting counters for public webhook endpoints
--          so limits are enforced correctly across multiple API pods.

CREATE TABLE IF NOT EXISTS webhook_rate_limits (
  id          UUID         NOT NULL DEFAULT gen_random_uuid(),
  fingerprint VARCHAR(160) NOT NULL,
  count       INTEGER      NOT NULL DEFAULT 1,
  reset_at    TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT pk_webhook_rate_limits PRIMARY KEY (id),
  CONSTRAINT uq_webhook_rate_limits_fingerprint UNIQUE (fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_webhook_rate_limits_reset_at
  ON webhook_rate_limits (reset_at);

COMMENT ON TABLE webhook_rate_limits IS
  'Per-origin rate limit counters for public-facing webhook endpoints (WhatsApp verify/receive). '
  'Stored in DB so limits are shared across API pods. Rows are lazily cleaned up when a new '
  'request arrives for an expired window.';
