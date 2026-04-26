DO $$
BEGIN
  ALTER TYPE "MessageEventType" ADD VALUE IF NOT EXISTS 'HANDOFF_ASSIGNED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "MessageEventType" ADD VALUE IF NOT EXISTS 'THREAD_PATIENT_LINKED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "MessageEventType" ADD VALUE IF NOT EXISTS 'THREAD_RESOLVED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "HandoffStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "HandoffSource" AS ENUM ('MANUAL', 'AUTOMATIC');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "handoff_requests"
ADD COLUMN IF NOT EXISTS "source" "HandoffSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN IF NOT EXISTS "assigned_to_user_id" UUID,
ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMPTZ(6);

DO $$
BEGIN
  ALTER TABLE "handoff_requests"
  ADD CONSTRAINT "fk_handoff_requests_assigned_to"
  FOREIGN KEY ("assigned_to_user_id") REFERENCES "users" ("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_handoff_requests_assigned_to_user_id"
ON "handoff_requests" ("assigned_to_user_id");

DROP INDEX IF EXISTS "uq_handoff_requests_thread_open";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_handoff_requests_thread_active"
ON "handoff_requests" ("thread_id")
WHERE "status" <> 'CLOSED';
