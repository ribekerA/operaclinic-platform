import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "async_hooks";

interface TraceStore {
  traceId: string;
  tenantId?: string | null;
  userId?: string | null;
}

/**
 * TraceContextService propagates trace context (traceId, tenantId, userId)
 * across asynchronous boundaries using Node.js AsyncLocalStorage.
 *
 * Usage:
 *   - Populate it in RequestIdInterceptor at the HTTP boundary.
 *   - Read from it in OperationalLoggerService so every log entry automatically
 *     carries the correct traceId without explicit passing through service calls.
 */
@Injectable()
export class TraceContextService {
  private readonly storage = new AsyncLocalStorage<TraceStore>();

  run<T>(store: TraceStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  getTraceId(): string | undefined {
    return this.storage.getStore()?.traceId;
  }

  getTenantId(): string | null | undefined {
    return this.storage.getStore()?.tenantId;
  }

  getUserId(): string | null | undefined {
    return this.storage.getStore()?.userId;
  }

  getStore(): TraceStore | undefined {
    return this.storage.getStore();
  }
}
