CREATE EXTENSION IF NOT EXISTS btree_gist;
-- Note: buffer_before_minutes / buffer_after_minutes are intentionally
-- excluded from the GIST index expressions because make_interval() is STABLE
-- (not IMMUTABLE) in PostgreSQL and cannot be used in index expressions.
-- Buffer enforcement is applied at the application layer in
-- scheduling-concurrency.service.ts.
ALTER TABLE "slot_holds"
ADD COLUMN "duration_minutes" INTEGER,
ADD COLUMN "buffer_before_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "buffer_after_minutes" INTEGER NOT NULL DEFAULT 0;

UPDATE "slot_holds" AS "slot_hold"
SET
  "duration_minutes" = GREATEST(
    1,
    FLOOR(EXTRACT(EPOCH FROM ("slot_hold"."ends_at" - "slot_hold"."starts_at")) / 60)::INTEGER
  ),
  "buffer_before_minutes" = "consultation_type"."buffer_before_minutes",
  "buffer_after_minutes" = "consultation_type"."buffer_after_minutes"
FROM "consultation_types" AS "consultation_type"
WHERE "consultation_type"."id" = "slot_hold"."consultation_type_id";

ALTER TABLE "slot_holds"
ALTER COLUMN "duration_minutes" SET NOT NULL;

UPDATE "slot_holds"
SET "status" = 'EXPIRED'::"SlotHoldStatus"
WHERE "status" = 'ACTIVE'::"SlotHoldStatus"
  AND "expires_at" <= NOW();

ALTER TABLE "appointments"
ADD CONSTRAINT "ex_appointments_professional_occupancy"
EXCLUDE USING GIST (
  "tenant_id" WITH =,
  "professional_id" WITH =,
  tstzrange(
    "starts_at",
    "ends_at",
    '[)'
  ) WITH &&
)
WHERE (
  "status" IN (
    'BOOKED'::"AppointmentStatus",
    'CONFIRMED'::"AppointmentStatus",
    'CHECKED_IN'::"AppointmentStatus",
    'RESCHEDULED'::"AppointmentStatus"
  )
);

ALTER TABLE "slot_holds"
ADD CONSTRAINT "ex_slot_holds_professional_occupancy"
EXCLUDE USING GIST (
  "tenant_id" WITH =,
  "professional_id" WITH =,
  tstzrange(
    "starts_at",
    "ends_at",
    '[)'
  ) WITH &&
)
WHERE (
  "status" = 'ACTIVE'::"SlotHoldStatus"
);
