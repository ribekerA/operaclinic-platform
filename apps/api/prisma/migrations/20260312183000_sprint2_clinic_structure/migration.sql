-- AlterEnum
ALTER TYPE "RoleCode" ADD VALUE 'CLINIC_MANAGER';

-- CreateTable
CREATE TABLE "clinics" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "legal_name" VARCHAR(180),
    "document_number" VARCHAR(40),
    "contact_email" VARCHAR(180),
    "contact_phone" VARCHAR(40),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialties" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professionals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "professional_register" VARCHAR(80) NOT NULL,
    "visible_for_self_booking" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_specialties" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "specialty_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_units" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "buffer_before_minutes" INTEGER NOT NULL DEFAULT 0,
    "buffer_after_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_first_visit" BOOLEAN NOT NULL DEFAULT false,
    "is_return_visit" BOOLEAN NOT NULL DEFAULT false,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "consultation_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinics_tenant_id_key" ON "clinics"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_clinics_tenant_id" ON "clinics"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_units_tenant_name" ON "units"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "idx_units_tenant_id" ON "units"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_specialties_tenant_name" ON "specialties"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "idx_specialties_tenant_id" ON "specialties"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_professionals_tenant_register" ON "professionals"("tenant_id", "professional_register");

-- CreateIndex
CREATE INDEX "idx_professionals_tenant_id" ON "professionals"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_professional_specialties_professional_specialty" ON "professional_specialties"("professional_id", "specialty_id");

-- CreateIndex
CREATE INDEX "idx_professional_specialties_tenant_id" ON "professional_specialties"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_professional_specialties_professional_id" ON "professional_specialties"("professional_id");

-- CreateIndex
CREATE INDEX "idx_professional_specialties_specialty_id" ON "professional_specialties"("specialty_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_professional_units_professional_unit" ON "professional_units"("professional_id", "unit_id");

-- CreateIndex
CREATE INDEX "idx_professional_units_tenant_id" ON "professional_units"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_professional_units_professional_id" ON "professional_units"("professional_id");

-- CreateIndex
CREATE INDEX "idx_professional_units_unit_id" ON "professional_units"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_consultation_types_tenant_name" ON "consultation_types"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "idx_consultation_types_tenant_id" ON "consultation_types"("tenant_id");

-- AddForeignKey
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specialties" ADD CONSTRAINT "specialties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_specialties" ADD CONSTRAINT "professional_specialties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_specialties" ADD CONSTRAINT "professional_specialties_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_specialties" ADD CONSTRAINT "professional_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_units" ADD CONSTRAINT "professional_units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_units" ADD CONSTRAINT "professional_units_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_units" ADD CONSTRAINT "professional_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_types" ADD CONSTRAINT "consultation_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

