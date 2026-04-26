import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { Observable } from "rxjs";
import { Request, Response } from "express";
import { REQUEST_ID_HEADER } from "../constants/request.constants";
import { TraceContextService } from "../observability/trace-context.service";
import { AuthenticatedRequest } from "../../auth/interfaces/authenticated-request.interface";

interface RequestWithRequestId extends Request {
  requestId?: string;
}

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  constructor(private readonly traceContext: TraceContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithRequestId & AuthenticatedRequest>();
    const response = httpContext.getResponse<Response>();

    const incomingRequestId = request.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof incomingRequestId === "string" && incomingRequestId.trim().length > 0
        ? incomingRequestId
        : randomUUID();

    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    return new Observable((subscriber) => {
      this.traceContext.run(
        {
          traceId: requestId,
          tenantId: request.user?.activeTenantId ?? null,
          userId: request.user?.id ?? null,
        },
        () => {
          next.handle().subscribe(subscriber);
        },
      );
    });
  }
}
