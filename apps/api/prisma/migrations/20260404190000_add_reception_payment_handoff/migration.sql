ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT';

ALTER TABLE "appointments"
ADD COLUMN "awaiting_payment_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_appointments_awaiting_payment_at"
ON "appointments"("awaiting_payment_at");
