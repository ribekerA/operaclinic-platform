import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CronGuard } from "../../src/auth/guards/cron.guard";

const VALID_SECRET = "super-secret-cron-token-for-testing-32chars";

function buildConfigService(cronSecret: string | undefined) {
  return {
    get: vi.fn((key: string) => {
      if (key === "app.cronSecret") return cronSecret;
      return undefined;
    }),
  };
}

function buildExecutionContext(headers: Record<string, string | undefined>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as any;
}

describe("CronGuard", () => {
  it("allows request with correct X-Cron-Token", () => {
    const guard = new CronGuard(buildConfigService(VALID_SECRET) as any);
    const ctx = buildExecutionContext({ "x-cron-token": VALID_SECRET });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("rejects when X-Cron-Token header is missing", () => {
    const guard = new CronGuard(buildConfigService(VALID_SECRET) as any);
    const ctx = buildExecutionContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("rejects when X-Cron-Token header is empty string", () => {
    const guard = new CronGuard(buildConfigService(VALID_SECRET) as any);
    const ctx = buildExecutionContext({ "x-cron-token": "   " });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("rejects when token does not match secret", () => {
    const guard = new CronGuard(buildConfigService(VALID_SECRET) as any);
    const ctx = buildExecutionContext({ "x-cron-token": "wrong-token-value-padding-here" });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("rejects when CRON_SECRET is not configured (empty string)", () => {
    const guard = new CronGuard(buildConfigService("") as any);
    const ctx = buildExecutionContext({ "x-cron-token": VALID_SECRET });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("rejects when CRON_SECRET is undefined", () => {
    const guard = new CronGuard(buildConfigService(undefined) as any);
    const ctx = buildExecutionContext({ "x-cron-token": VALID_SECRET });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("rejects when token length differs from secret (length-based check)", () => {
    const guard = new CronGuard(buildConfigService(VALID_SECRET) as any);
    // Same chars but one extra character — length mismatch path
    const ctx = buildExecutionContext({ "x-cron-token": VALID_SECRET + "x" });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
