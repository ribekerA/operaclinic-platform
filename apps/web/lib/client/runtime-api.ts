import { requestJson } from "@/lib/client/http";

export type RuntimeReadinessStatus = "ok" | "degraded" | "error";

export interface RuntimeDependencyCheck {
  status: RuntimeReadinessStatus;
  issues: string[];
}

export interface RuntimeReadinessPayload {
  status: RuntimeReadinessStatus;
  service: string;
  environment: string;
  timestamp: string;
  checks: {
    database: RuntimeDependencyCheck & {
      latencyMs: number | null;
    };
    operations: RuntimeDependencyCheck;
    agent: RuntimeDependencyCheck & {
      enabled: boolean;
      rolloutPercentage: number;
      metricsWindowMinutes: number;
      failureRateAlertThreshold: number;
      p95LatencyAlertMs: number;
    };
    payment: RuntimeDependencyCheck & {
      provider: "mock" | "stripe";
      mockCheckoutEnabled: boolean;
      webhookConfigured: boolean;
    };
    messaging: RuntimeDependencyCheck & {
      metaEnabled: boolean;
      activeMetaConnections: number;
      activeMetaConnectionsMissingPhoneNumberId: number;
    };
  };
}

export async function getRuntimeReadiness(): Promise<RuntimeReadinessPayload> {
  return requestJson<RuntimeReadinessPayload>("/api/runtime/readiness");
}
