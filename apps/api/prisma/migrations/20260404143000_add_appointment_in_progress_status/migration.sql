ALTER TYPE "AppointmentStatus" ADD VALUE 'IN_PROGRESS';

ALTER TABLE "appointments"
  ADD COLUMN "started_at" TIMESTAMPTZ(6),
  ADD COLUMN "completed_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_appointments_started_at" ON "appointments"("started_at");
CREATE INDEX "idx_appointments_completed_at" ON "appointments"("completed_at");
