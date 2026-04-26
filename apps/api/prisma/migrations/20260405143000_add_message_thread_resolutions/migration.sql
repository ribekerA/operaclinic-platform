CREATE TYPE "MessageThreadResolutionActorType" AS ENUM ('HUMAN', 'AUTOMATION');

CREATE TABLE "message_thread_resolutions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "patient_id" UUID,
    "handoff_request_id" UUID,
    "message_event_id" UUID,
    "agent_execution_id" UUID,
    "resolved_by_user_id" UUID,
    "actor_type" "MessageThreadResolutionActorType" NOT NULL,
    "correlation_id" VARCHAR(120),
    "note" VARCHAR(255),
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "message_thread_resolutions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_message_thread_resolutions_tenant_id"
    ON "message_thread_resolutions"("tenant_id");

CREATE INDEX "idx_message_thread_resolutions_thread_id"
    ON "message_thread_resolutions"("thread_id");

CREATE INDEX "idx_message_thread_resolutions_actor_type"
    ON "message_thread_resolutions"("actor_type");

CREATE INDEX "idx_message_thread_resolutions_occurred_at"
    ON "message_thread_resolutions"("occurred_at");

CREATE INDEX "idx_message_thread_resolutions_correlation_id"
    ON "message_thread_resolutions"("correlation_id");

CREATE INDEX "idx_message_thread_resolutions_agent_execution_id"
    ON "message_thread_resolutions"("agent_execution_id");
