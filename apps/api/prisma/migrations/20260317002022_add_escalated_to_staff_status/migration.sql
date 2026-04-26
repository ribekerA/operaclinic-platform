-- AlterEnum
ALTER TYPE "CommercialOnboardingStatus" ADD VALUE 'ESCALATED_TO_STAFF';

-- DropIndex
DROP INDEX "idx_users_password_reset_expires_at";

-- AlterTable
ALTER TABLE "commercial_onboardings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "handoff_requests" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "integration_connections" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "message_templates" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "message_threads" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "webhook_events" ALTER COLUMN "updated_at" DROP DEFAULT;

-- RenameForeignKey
ALTER TABLE "handoff_requests" RENAME CONSTRAINT "fk_handoff_requests_assigned_to" TO "handoff_requests_assigned_to_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "handoff_requests" RENAME CONSTRAINT "fk_handoff_requests_closed_by" TO "handoff_requests_closed_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "handoff_requests" RENAME CONSTRAINT "fk_handoff_requests_opened_by" TO "handoff_requests_opened_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "handoff_requests" RENAME CONSTRAINT "fk_handoff_requests_tenant" TO "handoff_requests_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "handoff_requests" RENAME CONSTRAINT "fk_handoff_requests_thread" TO "handoff_requests_thread_id_fkey";

-- RenameForeignKey
ALTER TABLE "integration_connections" RENAME CONSTRAINT "fk_integration_connections_tenant" TO "integration_connections_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "message_events" RENAME CONSTRAINT "fk_message_events_actor_user" TO "message_events_actor_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "message_events" RENAME CONSTRAINT "fk_message_events_connection" TO "message_events_integration_connection_id_fkey";

-- RenameForeignKey
ALTER TABLE "message_events" RENAME CONSTRAINT "fk_message_events_handoff" TO "message_events_handoff_request_id_fkey";

-- RenameForeignKey
ALTER TABLE "message_events" RENAME CONSTRAINT "fk_message_events_patient" TO "message_events_patient_id_fkey";

-- RenameForeignKey
ALTER TABLE "message_events" RENAME CONSTRAINT "fk_message_events_template" TO "message_events_template_id_fkey";

-- RenameForeignKey
ALTER TABLE "message_events" RENAME CONSTRAINT "fk_message_events_tenant" TO "message_events_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "message_events" RENAME CONSTRAINT "fk_message_events_thread" TO "message_events_thread_id_fkey";

-- RenameForeignKey
ALTER TABLE "message_events" RENAME CONSTRAINT "fk_message_events_webhook" TO "message_events_webhook_event_id_fkey";

-- RenameForeignKey
ALTER TABLE "message_templates" RENAME CONSTRAINT "fk_message_templates_tenant" TO "message_templates_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "message_threads" RENAME CONSTRAINT "fk_message_threads_connection" TO "message_threads_integration_connection_id_fkey";

-- RenameForeignKey
ALTER TABLE "message_threads" RENAME CONSTRAINT "fk_message_threads_patient" TO "message_threads_patient_id_fkey";

-- RenameForeignKey
ALTER TABLE "message_threads" RENAME CONSTRAINT "fk_message_threads_tenant" TO "message_threads_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "webhook_events" RENAME CONSTRAINT "fk_webhook_events_connection" TO "webhook_events_integration_connection_id_fkey";

-- RenameForeignKey
ALTER TABLE "webhook_events" RENAME CONSTRAINT "fk_webhook_events_tenant" TO "webhook_events_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "webhook_events" RENAME CONSTRAINT "fk_webhook_events_thread" TO "webhook_events_thread_id_fkey";
