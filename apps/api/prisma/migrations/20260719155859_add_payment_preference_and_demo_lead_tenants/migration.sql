-- CreateEnum
CREATE TYPE "PaymentMethodPreference" AS ENUM ('TRIAL_CARD', 'PAY_NOW');

-- AlterTable
ALTER TABLE "commercial_onboardings" ADD COLUMN     "payment_method_preference" "PaymentMethodPreference";

-- CreateTable
CREATE TABLE "demo_lead_tenants" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "lead_clinic_name" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_booked_at" TIMESTAMPTZ(6),
    "founder_notified_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "demo_lead_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demo_lead_tenants_tenant_id_key" ON "demo_lead_tenants"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "demo_lead_tenants_slug_key" ON "demo_lead_tenants"("slug");

-- CreateIndex
CREATE INDEX "idx_demo_lead_tenants_expires_at" ON "demo_lead_tenants"("expires_at");

-- AddForeignKey
ALTER TABLE "demo_lead_tenants" ADD CONSTRAINT "demo_lead_tenants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
