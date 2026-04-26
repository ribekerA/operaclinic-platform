import { registerAs } from "@nestjs/config";

export default registerAs("agent", () => ({
  enabled: process.env.AGENT_LAYER_ENABLED !== "false",
  rolloutPercentage: Number(process.env.AGENT_LAYER_ROLLOUT_PERCENTAGE ?? 100),
  metricsWindowMinutes: Number(process.env.AGENT_METRICS_WINDOW_MINUTES ?? 15),
  failureRateAlertThreshold: Number(
    process.env.AGENT_SKILL_FAILURE_RATE_ALERT_THRESHOLD ?? 0.05,
  ),
  p95LatencyAlertMs: Number(process.env.AGENT_SKILL_P95_ALERT_MS ?? 1500),
}));