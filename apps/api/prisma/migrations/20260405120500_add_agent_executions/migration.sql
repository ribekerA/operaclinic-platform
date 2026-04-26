CREATE TYPE "AgentKind" AS ENUM ('CAPTACAO', 'AGENDAMENTO');

CREATE TYPE "AgentExecutionStatus" AS ENUM (
  'WAITING_FOR_INPUT',
  'WAITING_FOR_SLOT_SELECTION',
  'HANDOFF_OPENED',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "agent_executions" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "patient_id" UUID,
  "handoff_request_id" UUID,
  "appointment_id" UUID,
  "correlation_id" VARCHAR(120) NOT NULL,
  "agent" "AgentKind" NOT NULL,
  "status" "AgentExecutionStatus" NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "skill_calls" INTEGER NOT NULL DEFAULT 0,
  "failed_skill_calls" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMPTZ(6) NOT NULL,
  "finished_at" TIMESTAMPTZ(6) NOT NULL,
  "error_message" VARCHAR(255),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_agent_executions_tenant_id"
ON "agent_executions"("tenant_id");

CREATE INDEX "idx_agent_executions_thread_id"
ON "agent_executions"("thread_id");

CREATE INDEX "idx_agent_executions_correlation_id"
ON "agent_executions"("correlation_id");

CREATE INDEX "idx_agent_executions_agent"
ON "agent_executions"("agent");

CREATE INDEX "idx_agent_executions_status"
ON "agent_executions"("status");

CREATE INDEX "idx_agent_executions_finished_at"
ON "agent_executions"("finished_at");
