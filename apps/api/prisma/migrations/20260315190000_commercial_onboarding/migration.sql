-- CreateEnum
CREATE TYPE "CommercialOnboardingStatus" AS ENUM (
  'INITIATED',
  'AWAITING_PAYMENT',
  'PAID',
  'ONBOARDING_STARTED',
  'ONBOARDING_COMPLETED'
);

-- AlterTable
ALTER TABLE "plans"
ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "commercial_onboardings" (
  "id" UUID NOT NULL,
  "public_token_hash" VARCHAR(255) NOT NULL,
  "status" "CommercialOnboardingStatus" NOT NULL DEFAULT 'INITIATED',
  "plan_id" UUID NOT NULL,
  "clinic_display_name" VARCHAR(160),
  "clinic_legal_name" VARCHAR(180),
  "clinic_document_number" VARCHAR(40),
  "clinic_contact_email" VARCHAR(180),
  "clinic_contact_phone" VARCHAR(40),
  "timezone" VARCHAR(64),
  "initial_unit_name" VARCHAR(160),
  "admin_full_name" VARCHAR(160),
  "admin_email" VARCHAR(180),
  "admin_password_hash" VARCHAR(255),
  "payment_reference" VARCHAR(120),
  "checkout_confirmed_at" TIMESTAMPTZ(6),
  "onboarding_started_at" TIMESTAMPTZ(6),
  "onboarding_completed_at" TIMESTAMPTZ(6),
  "tenant_id" UUID,
  "clinic_id" UUID,
  "unit_id" UUID,
  "admin_user_id" UUID,
  "subscription_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "commercial_onboardings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commercial_onboardings_public_token_hash_key"
ON "commercial_onboardings"("public_token_hash");

-- CreateIndex
CREATE INDEX "idx_commercial_onboardings_plan_id"
ON "commercial_onboardings"("plan_id");

-- CreateIndex
CREATE INDEX "idx_commercial_onboardings_status"
ON "commercial_onboardings"("status");

-- CreateIndex
CREATE INDEX "idx_commercial_onboardings_admin_email"
ON "commercial_onboardings"("admin_email");

-- CreateIndex
CREATE INDEX "idx_commercial_onboardings_clinic_contact_email"
ON "commercial_onboardings"("clinic_contact_email");

-- CreateIndex
CREATE INDEX "idx_commercial_onboardings_tenant_id"
ON "commercial_onboardings"("tenant_id");

-- AddForeignKey
ALTER TABLE "commercial_onboardings"
ADD CONSTRAINT "commercial_onboardings_plan_id_fkey"
FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
