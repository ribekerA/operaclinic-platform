ALTER TYPE "AppointmentStatus" ADD VALUE 'CALLED';
ALTER TYPE "AppointmentStatus" ADD VALUE 'AWAITING_CLOSURE';

ALTER TABLE "appointments"
  ADD COLUMN "called_at" TIMESTAMPTZ(6),
  ADD COLUMN "closure_ready_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_appointments_called_at" ON "appointments"("called_at");
CREATE INDEX "idx_appointments_closure_ready_at" ON "appointments"("closure_ready_at");
