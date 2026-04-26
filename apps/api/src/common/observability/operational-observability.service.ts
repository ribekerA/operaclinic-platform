import { Injectable } from "@nestjs/common";

export type OperationalFlowChannel = "http" | "realtime";
export type OperationalFlowOutcome =
  | "success"
  | "conflict"
  | "rejected"
  | "failure";

interface OperationalFlowEvent {
  channel: OperationalFlowChannel;
  flow: string;
  outcome: OperationalFlowOutcome;
  durationMs: number;
  timestamp: number;
  tenantId?: string | null;
}

export interface OperationalFlowMetrics {
  channel: OperationalFlowChannel;
  totalEvents: number;
  successEvents: number;
  conflictEvents: number;
  rejectedEvents: number;
  failureEvents: number;
  avgDurationMs: number;
  p95DurationMs: number;
  lastSeenAt: string | null;
}

export interface OperationalMetricsSnapshot {
  windowMinutes: number;
  totalEvents: number;
  perFlow: Record<string, OperationalFlowMetrics>;
}

// ---------------------------------------------------------------------------
// Business metrics counters (RED: Rate, Errors, Duration proxy)
// ---------------------------------------------------------------------------

type BusinessCounterKey = string; // "<event>:<tenantId>"

interface BusinessCounter {
  event: string;
  tenantId: string;
  count: number;
  lastAt: string;
}

export interface BusinessMetricsSnapshot {
  counters: BusinessCounter[];
}

@Injectable()
export class OperationalObservabilityService {
  private readonly events: OperationalFlowEvent[] = [];
  private readonly maxEvents = 20_000;

  /** In-memory business counters, keyed by "<event>:<tenantId>". */
  private readonly businessCounters = new Map<BusinessCounterKey, BusinessCounter>();

  recordFlow(event: OperationalFlowEvent): void {
    this.events.push(event);

    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
  }

  /**
   * Increment a named business counter for a tenant.
   * Examples: "appointment.created", "no_show.auto_marked", "messaging.webhook.dedup"
   */
  incrementCounter(event: string, tenantId: string, amount = 1): void {
    const key: BusinessCounterKey = `${event}:${tenantId}`;
    const existing = this.businessCounters.get(key);
    if (existing) {
      existing.count += amount;
      existing.lastAt = new Date().toISOString();
    } else {
      this.businessCounters.set(key, {
        event,
        tenantId,
        count: amount,
        lastAt: new Date().toISOString(),
      });
    }
  }

  getBusinessMetrics(): BusinessMetricsSnapshot {
    return {
      counters: Array.from(this.businessCounters.values()),
    };
  }

  getMetricsSnapshot(windowMinutes: number): OperationalMetricsSnapshot {
    const windowStart = Date.now() - windowMinutes * 60_000;
    const windowEvents = this.events.filter((event) => event.timestamp >= windowStart);
    const groupedEvents = new Map<string, OperationalFlowEvent[]>();

    for (const event of windowEvents) {
      const key = `${event.channel}:${event.flow}`;
      const current = groupedEvents.get(key) ?? [];
      current.push(event);
      groupedEvents.set(key, current);
    }

    const perFlow: Record<string, OperationalFlowMetrics> = {};

    for (const [key, events] of groupedEvents.entries()) {
      const durations = events.map((event) => event.durationMs);
      const lastSeenTimestamp = events.reduce(
        (latest, event) => Math.max(latest, event.timestamp),
        0,
      );

      perFlow[key] = {
        channel: events[0]?.channel ?? "http",
        totalEvents: events.length,
        successEvents: events.filter((event) => event.outcome === "success").length,
        conflictEvents: events.filter((event) => event.outcome === "conflict").length,
        rejectedEvents: events.filter((event) => event.outcome === "rejected").length,
        failureEvents: events.filter((event) => event.outcome === "failure").length,
        avgDurationMs: this.average(durations),
        p95DurationMs: this.percentile(durations, 95),
        lastSeenAt: lastSeenTimestamp ? new Date(lastSeenTimestamp).toISOString() : null,
      };
    }

    return {
      windowMinutes,
      totalEvents: windowEvents.length,
      perFlow,
    };
  }

  private average(values: number[]): number {
    if (!values.length) {
      return 0;
    }

    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
  }

  private percentile(values: number[], percentile: number): number {
    if (!values.length) {
      return 0;
    }

    const sorted = [...values].sort((left, right) => left - right);
    const rank = Math.ceil((percentile / 100) * sorted.length) - 1;
    const index = Math.max(0, Math.min(rank, sorted.length - 1));

    return sorted[index];
  }
}
