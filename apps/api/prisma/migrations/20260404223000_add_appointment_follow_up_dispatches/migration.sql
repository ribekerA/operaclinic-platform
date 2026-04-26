DO $$
BEGIN
  CREATE TYPE "AppointmentFollowUpKind" AS ENUM ('APPOINTMENT_REMINDER_24H');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AppointmentFollowUpDispatchStatus" AS ENUM ('PROCESSING', 'SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "patient_contacts"
ADD COLUMN "allow_automated_messaging" BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN "automated_messaging_opted_out_at" TIMESTAMPTZ(6);

CREATE TABLE "appointment_follow_up_dispatches" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "appointment_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "patient_contact_id" UUID NOT NULL,
  "thread_id" UUID,
  "integration_connection_id" UUID,
  "template_id" UUID NOT NULL,
  "message_event_id" UUID,
  "initiated_by_user_id" UUID,
  "kind" "AppointmentFollowUpKind" NOT NULL,
  "status" "AppointmentFollowUpDispatchStatus" NOT NULL,
  "dispatch_key" VARCHAR(160) NOT NULL,
  "correlation_id" VARCHAR(120) NOT NULL,
  "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
  "started_at" TIMESTAMPTZ(6),
  "dispatched_at" TIMESTAMPTZ(6),
  "failed_at" TIMESTAMPTZ(6),
  "error_message" VARCHAR(255),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_follow_up_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_appointment_follow_up_dispatches_tenant_dispatch_key"
ON "appointment_follow_up_dispatches" ("tenant_id", "dispatch_key");

CREATE INDEX "idx_appointment_follow_up_dispatches_tenant_id"
ON "appointment_follow_up_dispatches" ("tenant_id");

CREATE INDEX "idx_appointment_follow_up_dispatches_appointment_id"
ON "appointment_follow_up_dispatches" ("appointment_id");

CREATE INDEX "idx_appointment_follow_up_dispatches_status"
ON "appointment_follow_up_dispatches" ("status");

CREATE INDEX "idx_appointment_follow_up_dispatches_scheduled_for"
ON "appointment_follow_up_dispatches" ("scheduled_for");
