import { Global, Module } from "@nestjs/common";
import { RequestLoggingInterceptor } from "../interceptors/request-logging.interceptor";
import { RequestIdInterceptor } from "../interceptors/request-id.interceptor";
import { OperationalLoggerService } from "./operational-logger.service";
import { OperationalObservabilityService } from "./operational-observability.service";
import { TraceContextService } from "./trace-context.service";

@Global()
@Module({
  providers: [
    TraceContextService,
    OperationalObservabilityService,
    OperationalLoggerService,
    RequestLoggingInterceptor,
    RequestIdInterceptor,
  ],
  exports: [
    TraceContextService,
    OperationalObservabilityService,
    OperationalLoggerService,
    RequestLoggingInterceptor,
    RequestIdInterceptor,
  ],
})
export class ObservabilityModule {}
