ALTER TYPE "AppointmentStatus" ADD VALUE 'CHECKED_IN';

ALTER TABLE "appointments"
ADD COLUMN "confirmed_at" TIMESTAMPTZ(6),
ADD COLUMN "checked_in_at" TIMESTAMPTZ(6),
ADD COLUMN "no_show_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_appointments_checked_in_at" ON "appointments"("checked_in_at");
