import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { AuthenticatedRequest } from "../../auth/interfaces/authenticated-request.interface";
import { OperationalLoggerService } from "../observability/operational-logger.service";
import {
  OperationalFlowOutcome,
  OperationalObservabilityService,
} from "../observability/operational-observability.service";

interface RequestWithTrace extends AuthenticatedRequest {
  requestId?: string;
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly observability: OperationalObservabilityService,
    private readonly logger: OperationalLoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithTrace>();
    const startedAt = Date.now();
    const flow = `${context.getClass().name}.${context.getHandler().name}`;

    return next.handle().pipe(
      tap({
        next: () => {
          this.recordRequest({
            request,
            flow,
            durationMs: Date.now() - startedAt,
            statusCode: httpContext.getResponse<{ statusCode: number }>().statusCode,
          });
        },
        error: (error: unknown) => {
          this.recordRequest({
            request,
            flow,
            durationMs: Date.now() - startedAt,
            statusCode: this.resolveStatusCode(error),
            error,
          });
        },
      }),
    );
  }

  private recordRequest(input: {
    request: RequestWithTrace;
    flow: string;
    durationMs: number;
    statusCode: number;
    error?: unknown;
  }): void {
    const outcome = this.resolveOutcome(input.statusCode);
    const tenantId = input.request.user?.activeTenantId ?? null;
    const payload = {
      channel: "http",
      flow: input.flow,
      method: input.request.method,
      path: input.request.originalUrl,
      statusCode: input.statusCode,
      outcome,
      durationMs: input.durationMs,
      traceId: input.request.requestId ?? null,
      tenantId,
      userId: input.request.user?.id ?? null,
      profile: input.request.user?.profile ?? null,
    } satisfies Record<string, unknown>;

    this.observability.recordFlow({
      channel: "http",
      flow: input.flow,
      outcome,
      durationMs: input.durationMs,
      timestamp: Date.now(),
      tenantId,
    });

    if (outcome === "failure") {
      this.logger.error(
        "http.request",
        {
          ...payload,
          errorMessage: input.error instanceof Error ? input.error.message : String(input.error),
        },
        input.error instanceof Error ? input.error.stack : undefined,
      );
      return;
    }

    if (outcome === "rejected" || outcome === "conflict") {
      this.logger.warn("http.request", payload);
      return;
    }

    this.logger.info("http.request", payload);
  }

  private resolveStatusCode(error: unknown): number {
    if (error instanceof HttpException) {
      return error.getStatus();
    }

    return 500;
  }

  private resolveOutcome(statusCode: number): OperationalFlowOutcome {
    if (statusCode >= 500) {
      return "failure";
    }

    if (statusCode === 409) {
      return "conflict";
    }

    if (statusCode >= 400) {
      return "rejected";
    }

    return "success";
  }
}
