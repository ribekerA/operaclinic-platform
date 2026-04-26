DO $$
BEGIN
  CREATE TYPE "MessagingChannel" AS ENUM ('WHATSAPP');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "IntegrationProvider" AS ENUM ('WHATSAPP_MOCK', 'WHATSAPP_META');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "MessageThreadStatus" AS ENUM ('OPEN', 'IN_HANDOFF', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "MessageEventDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "MessageEventType" AS ENUM (
    'THREAD_CREATED',
    'MESSAGE_RECEIVED',
    'MESSAGE_SENT',
    'MESSAGE_SEND_FAILED',
    'HANDOFF_OPENED',
    'HANDOFF_CLOSED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "HandoffStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "integration_connections" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "channel" "MessagingChannel" NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "display_name" VARCHAR(120) NOT NULL,
  "phone_number" VARCHAR(40),
  "normalized_phone_number" VARCHAR(40),
  "external_account_id" VARCHAR(120),
  "webhook_verify_token_hash" VARCHAR(255),
  "config" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_integration_connections_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "message_templates" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "channel" "MessagingChannel" NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "body_text" TEXT NOT NULL,
  "variables" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_message_templates_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "message_threads" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "patient_id" UUID,
  "integration_connection_id" UUID NOT NULL,
  "channel" "MessagingChannel" NOT NULL,
  "status" "MessageThreadStatus" NOT NULL DEFAULT 'OPEN',
  "contact_display_value" VARCHAR(120) NOT NULL,
  "normalized_contact_value" VARCHAR(40) NOT NULL,
  "patient_display_name" VARCHAR(160),
  "external_thread_id" VARCHAR(120),
  "last_message_preview" VARCHAR(255),
  "last_message_at" TIMESTAMPTZ(6),
  "last_inbound_at" TIMESTAMPTZ(6),
  "last_outbound_at" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_message_threads_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_message_threads_patient" FOREIGN KEY ("patient_id") REFERENCES "patients" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fk_message_threads_connection" FOREIGN KEY ("integration_connection_id") REFERENCES "integration_connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "webhook_events" (
  "id" UUID NOT NULL,
  "tenant_id" UUID,
  "integration_connection_id" UUID,
  "thread_id" UUID,
  "channel" "MessagingChannel" NOT NULL,
  "provider" "IntegrationProvider",
  "provider_event_id" VARCHAR(120),
  "event_type" VARCHAR(80) NOT NULL,
  "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payload" JSONB NOT NULL,
  "error_message" VARCHAR(255),
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_webhook_events_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fk_webhook_events_connection" FOREIGN KEY ("integration_connection_id") REFERENCES "integration_connections" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fk_webhook_events_thread" FOREIGN KEY ("thread_id") REFERENCES "message_threads" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "handoff_requests" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "status" "HandoffStatus" NOT NULL DEFAULT 'OPEN',
  "reason" VARCHAR(120) NOT NULL,
  "note" VARCHAR(255),
  "closed_note" VARCHAR(255),
  "opened_by_user_id" UUID,
  "closed_by_user_id" UUID,
  "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "handoff_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_handoff_requests_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_handoff_requests_thread" FOREIGN KEY ("thread_id") REFERENCES "message_threads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_handoff_requests_opened_by" FOREIGN KEY ("opened_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fk_handoff_requests_closed_by" FOREIGN KEY ("closed_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "message_events" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "patient_id" UUID,
  "integration_connection_id" UUID NOT NULL,
  "template_id" UUID,
  "webhook_event_id" UUID,
  "handoff_request_id" UUID,
  "actor_user_id" UUID,
  "direction" "MessageEventDirection" NOT NULL,
  "event_type" "MessageEventType" NOT NULL,
  "provider_message_id" VARCHAR(120),
  "content_text" TEXT,
  "metadata" JSONB,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_message_events_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_message_events_thread" FOREIGN KEY ("thread_id") REFERENCES "message_threads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_message_events_patient" FOREIGN KEY ("patient_id") REFERENCES "patients" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fk_message_events_connection" FOREIGN KEY ("integration_connection_id") REFERENCES "integration_connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_message_events_template" FOREIGN KEY ("template_id") REFERENCES "message_templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fk_message_events_webhook" FOREIGN KEY ("webhook_event_id") REFERENCES "webhook_events" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fk_message_events_handoff" FOREIGN KEY ("handoff_request_id") REFERENCES "handoff_requests" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fk_message_events_actor_user" FOREIGN KEY ("actor_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_integration_connections_tenant_channel_display_name"
ON "integration_connections" ("tenant_id", "channel", "display_name");

CREATE UNIQUE INDEX "uq_integration_connections_channel_external_account_id"
ON "integration_connections" ("channel", "external_account_id");

CREATE UNIQUE INDEX "uq_message_templates_tenant_channel_code"
ON "message_templates" ("tenant_id", "channel", "code");

CREATE UNIQUE INDEX "uq_message_threads_connection_contact"
ON "message_threads" ("tenant_id", "integration_connection_id", "channel", "normalized_contact_value");

CREATE UNIQUE INDEX "uq_webhook_events_connection_provider_event"
ON "webhook_events" ("integration_connection_id", "provider_event_id");

CREATE UNIQUE INDEX "uq_handoff_requests_thread_open"
ON "handoff_requests" ("thread_id")
WHERE "status" = 'OPEN';

CREATE INDEX "idx_integration_connections_tenant_id"
ON "integration_connections" ("tenant_id");

CREATE INDEX "idx_integration_connections_status"
ON "integration_connections" ("status");

CREATE INDEX "idx_message_templates_tenant_id"
ON "message_templates" ("tenant_id");

CREATE INDEX "idx_message_templates_is_active"
ON "message_templates" ("is_active");

CREATE INDEX "idx_message_threads_tenant_id"
ON "message_threads" ("tenant_id");

CREATE INDEX "idx_message_threads_patient_id"
ON "message_threads" ("patient_id");

CREATE INDEX "idx_message_threads_status"
ON "message_threads" ("status");

CREATE INDEX "idx_message_threads_last_message_at"
ON "message_threads" ("last_message_at");

CREATE INDEX "idx_webhook_events_tenant_id"
ON "webhook_events" ("tenant_id");

CREATE INDEX "idx_webhook_events_thread_id"
ON "webhook_events" ("thread_id");

CREATE INDEX "idx_webhook_events_status"
ON "webhook_events" ("status");

CREATE INDEX "idx_webhook_events_received_at"
ON "webhook_events" ("received_at");

CREATE INDEX "idx_handoff_requests_tenant_id"
ON "handoff_requests" ("tenant_id");

CREATE INDEX "idx_handoff_requests_thread_id"
ON "handoff_requests" ("thread_id");

CREATE INDEX "idx_handoff_requests_status"
ON "handoff_requests" ("status");

CREATE INDEX "idx_handoff_requests_opened_at"
ON "handoff_requests" ("opened_at");

CREATE INDEX "idx_message_events_tenant_id"
ON "message_events" ("tenant_id");

CREATE INDEX "idx_message_events_thread_id"
ON "message_events" ("thread_id");

CREATE INDEX "idx_message_events_webhook_event_id"
ON "message_events" ("webhook_event_id");

CREATE INDEX "idx_message_events_handoff_request_id"
ON "message_events" ("handoff_request_id");

CREATE INDEX "idx_message_events_occurred_at"
ON "message_events" ("occurred_at");
