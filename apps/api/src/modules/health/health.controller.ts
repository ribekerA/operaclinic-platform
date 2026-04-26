import { Controller, Get } from "@nestjs/common";
import {
  HealthReadinessResponse,
  HealthResponse,
  HealthService,
} from "./health.service";
import {
  BusinessMetricsSnapshot,
  OperationalMetricsSnapshot,
  OperationalObservabilityService,
} from "../../common/observability/operational-observability.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly observability: OperationalObservabilityService,
  ) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    return this.healthService.getHealth();
  }

  @Get("readiness")
  async getReadiness(): Promise<HealthReadinessResponse> {
    return this.healthService.getReadiness();
  }

  @Get("metrics")
  getHttpMetrics(): OperationalMetricsSnapshot {
    return this.observability.getMetricsSnapshot(60);
  }

  @Get("metrics/business")
  getBusinessMetrics(): BusinessMetricsSnapshot {
    return this.observability.getBusinessMetrics();
  }
}
