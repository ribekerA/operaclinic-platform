import { Injectable } from "@nestjs/common";
import { IntegrationConnectionStatus, IntegrationProvider } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import {
  AgentMetricsSnapshot,
  AgentObservabilityService,
} from "../agent/services/agent-observability.service";
import {
  OperationalMetricsSnapshot,
  OperationalObservabilityService,
} from "../../common/observability/operational-observability.service";

const OPERATIONAL_METRICS_WINDOW_MINUTES = 60;

export type CheckStatus = "ok" | "degraded" | "error";

export interface DependencyCheck {
  status: CheckStatus;
  issues: string[];
}

export interface HealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
}

export interface HealthReadinessResponse {
  status: CheckStatus;
  service: string;
  environment: string;
  timestamp: string;
  checks: {
    database: DependencyCheck & { latencyMs: number | null };
    operations: DependencyCheck & {
      metricsWindowMinutes: number;
      metrics: OperationalMetricsSnapshot;
    };
    agent: DependencyCheck & {
      enabled: boolean;
      rolloutPercentage: number;
      metricsWindowMinutes: number;
      failureRateAlertThreshold: number;
      p95LatencyAlertMs: number;
      metrics: AgentMetricsSnapshot;
    };
    payment: DependencyCheck & {
      provider: "mock" | "stripe";
      mockCheckoutEnabled: boolean;
      webhookConfigured: boolean;
    };
    messaging: DependencyCheck & {
      metaEnabled: boolean;
      activeMetaConnections: number;
      activeMetaConnectionsMissingPhoneNumberId: number;
    };
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly agentObservability: AgentObservabilityService,
    private readonly operationalObservability: OperationalObservabilityService,
  ) {}

  async getHealth(): Promise<HealthResponse> {
    return {
      status: "ok",
      service: this.configService.get<string>("app.name", "OperaClinic API"),
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<HealthReadinessResponse> {
    const timestamp = new Date().toISOString();
    const environment = this.configService.get<string>("app.environment", "development");
    const [database, payment, messaging] = await Promise.all([
      this.buildDatabaseCheck(),
      this.buildPaymentCheck(environment),
      this.buildMessagingCheck(),
    ]);
    const agent = this.buildAgentCheck();
    const operations = this.buildOperationsCheck();

    return {
      status: this.resolveOverallStatus([
        database.status,
        payment.status,
        messaging.status,
        agent.status,
        operations.status,
      ]),
      service: this.configService.get<string>("app.name", "OperaClinic API"),
      environment,
      timestamp,
      checks: {
        database,
        operations,
        agent,
        payment,
        messaging,
      },
    };
  }

  private buildOperationsCheck(): DependencyCheck & {
    metricsWindowMinutes: number;
    metrics: OperationalMetricsSnapshot;
  } {
    return {
      status: "ok",
      issues: [],
      metricsWindowMinutes: OPERATIONAL_METRICS_WINDOW_MINUTES,
      metrics: this.operationalObservability.getMetricsSnapshot(
        OPERATIONAL_METRICS_WINDOW_MINUTES,
      ),
    };
  }

  private buildAgentCheck(): DependencyCheck & {
    enabled: boolean;
    rolloutPercentage: number;
    metricsWindowMinutes: number;
    failureRateAlertThreshold: number;
    p95LatencyAlertMs: number;
    metrics: AgentMetricsSnapshot;
  } {
    const enabled = this.configService.get<boolean>("agent.enabled", true);
    const rolloutPercentage = this.configService.get<number>(
      "agent.rolloutPercentage",
      100,
    );
    const metricsWindowMinutes = this.configService.get<number>(
      "agent.metricsWindowMinutes",
      15,
    );
    const failureRateAlertThreshold = this.configService.get<number>(
      "agent.failureRateAlertThreshold",
      0.05,
    );
    const p95LatencyAlertMs = this.configService.get<number>(
      "agent.p95LatencyAlertMs",
      1500,
    );
    const metrics = this.agentObservability.getMetricsSnapshot(metricsWindowMinutes);

    const issues: string[] = [];
    let status: CheckStatus = "ok";

    if (!enabled) {
      status = "degraded";
      issues.push("Agent layer is disabled by AGENT_LAYER_ENABLED=false.");
    }

    if (!Number.isInteger(rolloutPercentage) || rolloutPercentage < 0 || rolloutPercentage > 100) {
      status = "error";
      issues.push("AGENT_LAYER_ROLLOUT_PERCENTAGE must be between 0 and 100.");
    } else if (rolloutPercentage < 100) {
      status = "degraded";
      issues.push(`Agent layer rollout is partial (${rolloutPercentage}%).`);
    }

    if (metrics.totalExecutions > 0) {
      if (metrics.failureRate >= failureRateAlertThreshold) {
        status = status === "error" ? "error" : "degraded";
        issues.push(
          `Agent skill failure rate alert: ${(metrics.failureRate * 100).toFixed(2)}% >= ${(failureRateAlertThreshold * 100).toFixed(2)}%.`,
        );
      }

      if (metrics.p95DurationMs >= p95LatencyAlertMs) {
        status = status === "error" ? "error" : "degraded";
        issues.push(
          `Agent skill p95 latency alert: ${metrics.p95DurationMs.toFixed(0)}ms >= ${p95LatencyAlertMs}ms.`,
        );
      }
    }

    return {
      status,
      issues,
      enabled,
      rolloutPercentage,
      metricsWindowMinutes,
      failureRateAlertThreshold,
      p95LatencyAlertMs,
      metrics,
    };
  }

  private async buildDatabaseCheck(): Promise<
    DependencyCheck & { latencyMs: number | null }
  > {
    const startedAt = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: "ok",
        issues: [],
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        status: "error",
        issues: [
          error instanceof Error ? error.message : "Database connectivity check failed.",
        ],
        latencyMs: null,
      };
    }
  }

  private async buildMessagingCheck(): Promise<
    DependencyCheck & {
      metaEnabled: boolean;
      activeMetaConnections: number;
      activeMetaConnectionsMissingPhoneNumberId: number;
    }
  > {
    const metaEnabled = this.configService.get<boolean>("messaging.metaEnabled", false);
    const metaAccessToken = this.configService.get<string>("messaging.metaAccessToken", "");
    const metaAppSecret = this.configService.get<string>("messaging.metaAppSecret", "");
    const activeMetaConnections = await this.prisma.integrationConnection.count({
      where: {
        provider: IntegrationProvider.WHATSAPP_META,
        status: IntegrationConnectionStatus.ACTIVE,
      },
    });
    const activeMetaConnectionsMissingPhoneNumberId =
      await this.prisma.integrationConnection.count({
        where: {
          provider: IntegrationProvider.WHATSAPP_META,
          status: IntegrationConnectionStatus.ACTIVE,
          OR: [
            { externalAccountId: null },
            { externalAccountId: "" },
          ],
        },
      });

    const issues: string[] = [];
    let status: CheckStatus = "ok";

    if (!metaEnabled) {
      status = "degraded";
      issues.push("Meta WhatsApp is disabled at environment level.");
    } else {
      if (!metaAccessToken.trim()) {
        status = "error";
        issues.push("MESSAGING_WHATSAPP_META_ACCESS_TOKEN is not configured.");
      }

      if (!metaAppSecret.trim()) {
        status = "error";
        issues.push("MESSAGING_WHATSAPP_META_APP_SECRET is not configured.");
      }

      if (activeMetaConnections === 0) {
        status = status === "error" ? "error" : "degraded";
        issues.push("No active Meta WhatsApp integration connection is registered.");
      }

      if (activeMetaConnectionsMissingPhoneNumberId > 0) {
        status = status === "error" ? "error" : "degraded";
        issues.push(
          `${activeMetaConnectionsMissingPhoneNumberId} active Meta connection(s) are missing externalAccountId/phone number id.`,
        );
      }
    }

    return {
      status,
      issues,
      metaEnabled,
      activeMetaConnections,
      activeMetaConnectionsMissingPhoneNumberId,
    };
  }

  private buildPaymentCheck(
    environment: string,
  ): DependencyCheck & {
    provider: "mock" | "stripe";
    mockCheckoutEnabled: boolean;
    webhookConfigured: boolean;
  } {
    const forcedProvider = this.configService
      .get<string>("payment.provider", "")
      .trim()
      .toLowerCase();
    const stripeSecretKey = this.configService.get<string>("stripe.secretKey", "");
    const stripeWebhookSecret = this.configService.get<string>("stripe.webhookSecret", "");
    const mockCheckoutEnabled = this.configService.get<boolean>(
      "commercial.enableMockCheckout",
      false,
    );
    const provider: "mock" | "stripe" =
      forcedProvider === "stripe" || (!forcedProvider && stripeSecretKey.trim())
        ? "stripe"
        : "mock";

    const issues: string[] = [];
    let status: CheckStatus = "ok";

    if (provider === "mock") {
      status = environment === "production" ? "error" : "degraded";
      issues.push("Payment provider is using mock checkout.");
    }

    if (provider === "stripe") {
      if (!stripeSecretKey.trim()) {
        status = "error";
        issues.push("STRIPE_SECRET_KEY is not configured.");
      }

      if (!stripeWebhookSecret.trim()) {
        status = "error";
        issues.push("STRIPE_WEBHOOK_SECRET is not configured.");
      }
    }

    if (mockCheckoutEnabled) {
      status = environment === "production" ? "error" : "degraded";
      issues.push("COMMERCIAL_ONBOARDING_ENABLE_MOCK_CHECKOUT is enabled.");
    }

    return {
      status,
      issues,
      provider,
      mockCheckoutEnabled,
      webhookConfigured: Boolean(stripeWebhookSecret.trim()),
    };
  }

  private resolveOverallStatus(statuses: CheckStatus[]): CheckStatus {
    if (statuses.includes("error")) {
      return "error";
    }

    if (statuses.includes("degraded")) {
      return "degraded";
    }

    return "ok";
  }
}
