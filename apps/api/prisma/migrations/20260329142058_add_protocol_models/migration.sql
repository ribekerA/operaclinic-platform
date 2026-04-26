-- CreateEnum
CREATE TYPE "ProtocolSessionStatus" AS ENUM ('PLANNED', 'SCHEDULED', 'COMPLETED', 'CANCELED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PatientProtocolStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED', 'CANCELED');

-- CreateTable
CREATE TABLE "procedure_protocols" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "consultation_type_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "total_sessions" INTEGER NOT NULL,
    "interval_between_sessions_days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "procedure_protocols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_protocol_instances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "procedure_protocol_id" UUID NOT NULL,
    "status" "PatientProtocolStatus" NOT NULL DEFAULT 'ACTIVE',
    "sessions_planned" INTEGER NOT NULL,
    "sessions_scheduled" INTEGER NOT NULL DEFAULT 0,
    "sessions_completed" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_completion_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "abandoned_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patient_protocol_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_session_appointments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_protocol_instance_id" UUID NOT NULL,
    "procedure_protocol_id" UUID NOT NULL,
    "appointment_id" UUID,
    "session_sequence" INTEGER NOT NULL,
    "status" "ProtocolSessionStatus" NOT NULL DEFAULT 'PLANNED',
    "planned_start_date" DATE NOT NULL,
    "canceled_reason" VARCHAR(255),
    "skipped_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "protocol_session_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_procedure_protocols_tenant_id" ON "procedure_protocols"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_procedure_protocols_consultation_type_id" ON "procedure_protocols"("consultation_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_procedure_protocols_tenant_consultation_type_name" ON "procedure_protocols"("tenant_id", "consultation_type_id", "name");

-- CreateIndex
CREATE INDEX "idx_patient_protocol_instances_tenant_id" ON "patient_protocol_instances"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_patient_protocol_instances_patient_id" ON "patient_protocol_instances"("patient_id");

-- CreateIndex
CREATE INDEX "idx_patient_protocol_instances_procedure_protocol_id" ON "patient_protocol_instances"("procedure_protocol_id");

-- CreateIndex
CREATE INDEX "idx_patient_protocol_instances_status" ON "patient_protocol_instances"("status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_patient_protocol_instances_patient_protocol" ON "patient_protocol_instances"("patient_id", "procedure_protocol_id");

-- CreateIndex
CREATE INDEX "idx_protocol_session_appointments_tenant_id" ON "protocol_session_appointments"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_protocol_session_appointments_patient_protocol_instance_id" ON "protocol_session_appointments"("patient_protocol_instance_id");

-- CreateIndex
CREATE INDEX "idx_protocol_session_appointments_procedure_protocol_id" ON "protocol_session_appointments"("procedure_protocol_id");

-- CreateIndex
CREATE INDEX "idx_protocol_session_appointments_status" ON "protocol_session_appointments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_protocol_session_appointments_instance_sequence" ON "protocol_session_appointments"("patient_protocol_instance_id", "session_sequence");

-- AddForeignKey
ALTER TABLE "procedure_protocols" ADD CONSTRAINT "procedure_protocols_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_protocols" ADD CONSTRAINT "procedure_protocols_consultation_type_id_fkey" FOREIGN KEY ("consultation_type_id") REFERENCES "consultation_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_protocol_instances" ADD CONSTRAINT "patient_protocol_instances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_protocol_instances" ADD CONSTRAINT "patient_protocol_instances_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_protocol_instances" ADD CONSTRAINT "patient_protocol_instances_procedure_protocol_id_fkey" FOREIGN KEY ("procedure_protocol_id") REFERENCES "procedure_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_session_appointments" ADD CONSTRAINT "protocol_session_appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_session_appointments" ADD CONSTRAINT "protocol_session_appointments_patient_protocol_instance_id_fkey" FOREIGN KEY ("patient_protocol_instance_id") REFERENCES "patient_protocol_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_session_appointments" ADD CONSTRAINT "protocol_session_appointments_procedure_protocol_id_fkey" FOREIGN KEY ("procedure_protocol_id") REFERENCES "procedure_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_session_appointments" ADD CONSTRAINT "protocol_session_appointments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
