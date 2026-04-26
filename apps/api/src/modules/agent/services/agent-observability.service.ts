import { Injectable } from "@nestjs/common";

interface SkillExecutionEvent {
  skillName: string;
  tenantId: string;
  correlationId: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
}

interface SkillSummary {
  total: number;
  success: number;
  failed: number;
  failureRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
}

export interface AgentMetricsSnapshot {
  windowMinutes: number;
  totalExecutions: number;
  successExecutions: number;
  failedExecutions: number;
  failureRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
  perSkill: Record<string, SkillSummary>;
}

@Injectable()
export class AgentObservabilityService {
  private readonly events: SkillExecutionEvent[] = [];
  private readonly maxEvents = 10_000;

  recordSkillExecution(event: SkillExecutionEvent): void {
    this.events.push(event);

    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
  }

  getMetricsSnapshot(windowMinutes: number): AgentMetricsSnapshot {
    const windowStart = Date.now() - windowMinutes * 60_000;
    const windowEvents = this.events.filter((event) => event.timestamp >= windowStart);

    const totalExecutions = windowEvents.length;
    const successExecutions = windowEvents.filter((event) => event.success).length;
    const failedExecutions = totalExecutions - successExecutions;
    const failureRate = totalExecutions === 0 ? 0 : failedExecutions / totalExecutions;

    const durations = windowEvents.map((event) => event.durationMs);
    const avgDurationMs = this.average(durations);
    const p95DurationMs = this.percentile(durations, 95);

    const perSkillEvents = new Map<string, SkillExecutionEvent[]>();

    for (const event of windowEvents) {
      const existing = perSkillEvents.get(event.skillName) ?? [];
      existing.push(event);
      perSkillEvents.set(event.skillName, existing);
    }

    const perSkill: Record<string, SkillSummary> = {};

    for (const [skillName, skillEvents] of perSkillEvents.entries()) {
      const skillDurations = skillEvents.map((event) => event.durationMs);
      const skillTotal = skillEvents.length;
      const skillSuccess = skillEvents.filter((event) => event.success).length;
      const skillFailed = skillTotal - skillSuccess;

      perSkill[skillName] = {
        total: skillTotal,
        success: skillSuccess,
        failed: skillFailed,
        failureRate: skillTotal === 0 ? 0 : skillFailed / skillTotal,
        avgDurationMs: this.average(skillDurations),
        p95DurationMs: this.percentile(skillDurations, 95),
      };
    }

    return {
      windowMinutes,
      totalExecutions,
      successExecutions,
      failedExecutions,
      failureRate,
      avgDurationMs,
      p95DurationMs,
      perSkill,
    };
  }

  private average(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }

    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
  }

  private percentile(values: number[], percentile: number): number {
    if (values.length === 0) {
      return 0;
    }

    const sorted = [...values].sort((left, right) => left - right);
    const rank = Math.ceil((percentile / 100) * sorted.length) - 1;
    const index = Math.max(0, Math.min(rank, sorted.length - 1));

    return sorted[index];
  }
}