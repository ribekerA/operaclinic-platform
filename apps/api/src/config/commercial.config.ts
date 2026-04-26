import { registerAs } from "@nestjs/config";

export default registerAs("commercial", () => ({
  onboardingTtlHours: Number(
    process.env.COMMERCIAL_ONBOARDING_TTL_HOURS ?? 48,
  ),
  enableMockCheckout:
    process.env.COMMERCIAL_ONBOARDING_ENABLE_MOCK_CHECKOUT === "true",
}));
