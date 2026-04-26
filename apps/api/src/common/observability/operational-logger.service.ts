import { Injectable, Logger, Optional } from "@nestjs/common";
import { TraceContextService } from "./trace-context.service";

@Injectable()
export class OperationalLoggerService {
  private readonly logger = new Logger(OperationalLoggerService.name);

  constructor(
    @Optional() private readonly traceContext?: TraceContextService,
  ) {}

  info(event: string, payload: Record<string, unknown>): void {
    this.logger.log(this.serialize("info", event, payload));
  }

  warn(event: string, payload: Record<string, unknown>): void {
    this.logger.warn(this.serialize("warn", event, payload));
  }

  error(
    event: string,
    payload: Record<string, unknown>,
    stack?: string,
  ): void {
    this.logger.error(this.serialize("error", event, payload), stack);
  }

  private serialize(
    level: "info" | "warn" | "error",
    event: string,
    payload: Record<string, unknown>,
  ): string {
    const traceFields = this.traceContext?.getStore()
      ? {
          traceId: this.traceContext.getTraceId(),
          tenantId: this.traceContext.getTenantId(),
          userId: this.traceContext.getUserId(),
        }
      : {};

    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...traceFields,
      ...payload,
    });
  }
}
