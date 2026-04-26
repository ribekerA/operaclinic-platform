type RawEnv = Record<string, unknown>;

interface ValidatedEnv {
  NODE_ENV: string;
  APP_NAME: string;
  API_PORT: number;
  API_PREFIX: string;
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL: string;
  COMMERCIAL_ONBOARDING_TTL_HOURS: number;
  COMMERCIAL_ONBOARDING_ENABLE_MOCK_CHECKOUT: boolean;
  PAYMENT_PROVIDER: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  WEB_URL: string;
  MESSAGING_WHATSAPP_META_ENABLED: boolean;
  MESSAGING_WHATSAPP_META_API_BASE_URL: string;
  MESSAGING_WHATSAPP_META_API_VERSION: string;
  MESSAGING_WHATSAPP_META_ACCESS_TOKEN: string;
  MESSAGING_WHATSAPP_META_APP_SECRET: string;
  AGENT_LAYER_ENABLED: boolean;
  AGENT_LAYER_ROLLOUT_PERCENTAGE: number;
}

const JWT_TTL_PATTERN = /^\d+(s|m|h|d)$/i;
const PLACEHOLDER_SECRET_MARKERS = [
  "change-this",
  "replace-with",
  "replace_me",
  "dev-access-secret",
  "dev-refresh-secret",
  "example",
];

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
}

function toRequiredString(config: RawEnv, key: string): string {
  const normalized = String(config[key] ?? "").trim();

  if (!normalized) {
    throw new Error(`${key} cannot be empty.`);
  }

  return normalized;
}

function validateJwtTtl(value: string, key: string): void {
  if (!JWT_TTL_PATTERN.test(value.trim())) {
    throw new Error(`${key} must use the format <number><s|m|h|d>.`);
  }
}

function validateJwtSecret(value: string, key: string, nodeEnv: string): void {
  const normalized = value.trim().toLowerCase();

  if (nodeEnv === "production") {
    if (value.trim().length < 32) {
      throw new Error(`${key} must have at least 32 characters in production.`);
    }

    if (PLACEHOLDER_SECRET_MARKERS.some((marker) => normalized.includes(marker))) {
      throw new Error(`${key} cannot use placeholder or development values in production.`);
    }
  }
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return fallback;
}

export function validateEnv(config: RawEnv): ValidatedEnv {
  const validated: ValidatedEnv = {
    NODE_ENV: String(config.NODE_ENV ?? "development"),
    APP_NAME: String(config.APP_NAME ?? "OperaClinic API"),
    API_PORT: toNumber(config.API_PORT, 3001),
    API_PREFIX: String(config.API_PREFIX ?? "api/v1"),
    DATABASE_URL: toRequiredString(config, "DATABASE_URL"),
    JWT_ACCESS_SECRET: toRequiredString(config, "JWT_ACCESS_SECRET"),
    JWT_REFRESH_SECRET: toRequiredString(config, "JWT_REFRESH_SECRET"),
    JWT_ACCESS_TTL: String(config.JWT_ACCESS_TTL ?? "15m"),
    JWT_REFRESH_TTL: String(config.JWT_REFRESH_TTL ?? "7d"),
    COMMERCIAL_ONBOARDING_TTL_HOURS: toNumber(
      config.COMMERCIAL_ONBOARDING_TTL_HOURS,
      48,
    ),
    COMMERCIAL_ONBOARDING_ENABLE_MOCK_CHECKOUT: toBoolean(
      config.COMMERCIAL_ONBOARDING_ENABLE_MOCK_CHECKOUT,
      false,
    ),
    PAYMENT_PROVIDER: String(config.PAYMENT_PROVIDER ?? ""),
    STRIPE_SECRET_KEY: String(config.STRIPE_SECRET_KEY ?? ""),
    STRIPE_WEBHOOK_SECRET: String(config.STRIPE_WEBHOOK_SECRET ?? ""),
    WEB_URL: String(config.WEB_URL ?? "http://localhost:3000"),
    MESSAGING_WHATSAPP_META_ENABLED: toBoolean(
      config.MESSAGING_WHATSAPP_META_ENABLED,
      false,
    ),
    MESSAGING_WHATSAPP_META_API_BASE_URL: String(
      config.MESSAGING_WHATSAPP_META_API_BASE_URL ??
        "https://graph.facebook.com",
    ),
    MESSAGING_WHATSAPP_META_API_VERSION: String(
      config.MESSAGING_WHATSAPP_META_API_VERSION ?? "v21.0",
    ),
    MESSAGING_WHATSAPP_META_ACCESS_TOKEN: String(
      config.MESSAGING_WHATSAPP_META_ACCESS_TOKEN ?? "",
    ),
    MESSAGING_WHATSAPP_META_APP_SECRET: String(
      config.MESSAGING_WHATSAPP_META_APP_SECRET ?? "",
    ),
    AGENT_LAYER_ENABLED: toBoolean(config.AGENT_LAYER_ENABLED, true),
    AGENT_LAYER_ROLLOUT_PERCENTAGE: toNumber(
      config.AGENT_LAYER_ROLLOUT_PERCENTAGE,
      100,
    ),
  };

  if (validated.API_PORT <= 0 || validated.API_PORT > 65535) {
    throw new Error("API_PORT must be between 1 and 65535.");
  }

  if (!validated.API_PREFIX.trim()) {
    throw new Error("API_PREFIX cannot be empty.");
  }

  validateJwtTtl(validated.JWT_ACCESS_TTL, "JWT_ACCESS_TTL");
  validateJwtTtl(validated.JWT_REFRESH_TTL, "JWT_REFRESH_TTL");
  validateJwtSecret(validated.JWT_ACCESS_SECRET, "JWT_ACCESS_SECRET", validated.NODE_ENV);
  validateJwtSecret(validated.JWT_REFRESH_SECRET, "JWT_REFRESH_SECRET", validated.NODE_ENV);

  if (validated.JWT_ACCESS_SECRET === validated.JWT_REFRESH_SECRET) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.");
  }

  if (
    !Number.isInteger(validated.COMMERCIAL_ONBOARDING_TTL_HOURS) ||
    validated.COMMERCIAL_ONBOARDING_TTL_HOURS < 1 ||
    validated.COMMERCIAL_ONBOARDING_TTL_HOURS > 168
  ) {
    throw new Error(
      "COMMERCIAL_ONBOARDING_TTL_HOURS must be an integer between 1 and 168.",
    );
  }

  if (
    validated.NODE_ENV === "production" &&
    validated.COMMERCIAL_ONBOARDING_ENABLE_MOCK_CHECKOUT
  ) {
    throw new Error(
      "COMMERCIAL_ONBOARDING_ENABLE_MOCK_CHECKOUT must be disabled in production.",
    );
  }

  const normalizedPaymentProvider = validated.PAYMENT_PROVIDER.trim().toLowerCase();

  if (
    normalizedPaymentProvider &&
    normalizedPaymentProvider !== "mock" &&
    normalizedPaymentProvider !== "stripe"
  ) {
    throw new Error("PAYMENT_PROVIDER must be one of: mock, stripe.");
  }

  if (!/^https?:\/\//i.test(validated.WEB_URL)) {
    throw new Error("WEB_URL must be an absolute http(s) URL.");
  }

  const requiresStripe =
    validated.NODE_ENV === "production" || normalizedPaymentProvider === "stripe";

  if (validated.NODE_ENV === "production" && normalizedPaymentProvider === "mock") {
    throw new Error("PAYMENT_PROVIDER=mock is not allowed in production.");
  }

  if (requiresStripe) {
    if (!validated.STRIPE_SECRET_KEY.trim()) {
      throw new Error(
        "STRIPE_SECRET_KEY is required when Stripe payments are enabled.",
      );
    }

    if (!validated.STRIPE_WEBHOOK_SECRET.trim()) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET is required when Stripe payments are enabled.",
      );
    }
  }

  if (!/^https?:\/\//i.test(validated.MESSAGING_WHATSAPP_META_API_BASE_URL)) {
    throw new Error(
      "MESSAGING_WHATSAPP_META_API_BASE_URL must be an absolute http(s) URL.",
    );
  }

  if (!/^v\d+\.\d+$/i.test(validated.MESSAGING_WHATSAPP_META_API_VERSION.trim())) {
    throw new Error(
      "MESSAGING_WHATSAPP_META_API_VERSION must use the format v<number>.<number>.",
    );
  }

  if (validated.MESSAGING_WHATSAPP_META_ENABLED) {
    if (!validated.MESSAGING_WHATSAPP_META_ACCESS_TOKEN.trim()) {
      throw new Error(
        "MESSAGING_WHATSAPP_META_ACCESS_TOKEN is required when MESSAGING_WHATSAPP_META_ENABLED=true.",
      );
    }

    if (!validated.MESSAGING_WHATSAPP_META_APP_SECRET.trim()) {
      throw new Error(
        "MESSAGING_WHATSAPP_META_APP_SECRET is required when MESSAGING_WHATSAPP_META_ENABLED=true.",
      );
    }
  }

  if (
    !Number.isInteger(validated.AGENT_LAYER_ROLLOUT_PERCENTAGE) ||
    validated.AGENT_LAYER_ROLLOUT_PERCENTAGE < 0 ||
    validated.AGENT_LAYER_ROLLOUT_PERCENTAGE > 100
  ) {
    throw new Error(
      "AGENT_LAYER_ROLLOUT_PERCENTAGE must be an integer between 0 and 100.",
    );
  }

  return validated;
}
