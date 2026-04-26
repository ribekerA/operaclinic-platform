ALTER TYPE "CommercialOnboardingStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "commercial_onboardings"
ADD COLUMN "expires_at" TIMESTAMPTZ(6);

UPDATE "commercial_onboardings"
SET "expires_at" = COALESCE("updated_at", "created_at") + INTERVAL '48 hours'
WHERE "expires_at" IS NULL;

ALTER TABLE "commercial_onboardings"
ALTER COLUMN "expires_at" SET NOT NULL;

CREATE INDEX "idx_commercial_onboardings_expires_at"
ON "commercial_onboardings" ("expires_at");

CREATE UNIQUE INDEX "uq_commercial_onboardings_pending_admin_email"
ON "commercial_onboardings" ("admin_email")
WHERE "admin_email" IS NOT NULL
  AND "status" IN ('INITIATED', 'AWAITING_PAYMENT', 'PAID', 'ONBOARDING_STARTED');

CREATE UNIQUE INDEX "uq_commercial_onboardings_pending_clinic_contact_email"
ON "commercial_onboardings" ("clinic_contact_email")
WHERE "clinic_contact_email" IS NOT NULL
  AND "status" IN ('INITIATED', 'AWAITING_PAYMENT', 'PAID', 'ONBOARDING_STARTED');
