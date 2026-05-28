/**
 * Scheduling timezone edge cases — focused smoke suite
 *
 * Coverage gaps addressed:
 *   - combineDateAndTime: UTC midnight crossing, positive UTC offset, negative offset
 *   - parseIsoInstant: Z suffix, +HH:MM, -HH:MM, :mm seconds, rejection paths
 *   - getTenantDateKey: positive UTC offset timezone, date on UTC boundary
 *   - buildDayContext: weekday resolution, BRT vs Kolkata boundaries
 *   - assertCanCheckIn (policies) with REAL SchedulingTimezoneService:
 *       UTC/BRT boundary — same local day, different local day
 */

import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { SchedulingPoliciesService } from "../../src/modules/scheduling/scheduling-policies.service";
import { SchedulingTimezoneService } from "../../src/modules/scheduling/scheduling-timezone.service";

// SchedulingTimezoneService is pure math — PrismaService is not used by any method
// tested here (getCurrentInstant and getTenantTimezone would require DB, but are not
// exercised in this file).
const tz = new SchedulingTimezoneService({} as never);

// SchedulingPoliciesService.assertCanCheckIn is synchronous and only calls
// tz.getTenantDateKey — which is also synchronous and does not require DB.
const policies = new SchedulingPoliciesService({} as never, tz);

// ---------------------------------------------------------------------------
// combineDateAndTime
// ---------------------------------------------------------------------------

describe("SchedulingTimezoneService.combineDateAndTime", () => {
  // BRT = UTC-3 (America/Sao_Paulo has no DST since 2019)
  it("converts 09:00 UTC-hour to correct UTC instant in BRT timezone", () => {
    // time param: 09:00 UTC (but treated as LOCAL hour in the given TZ)
    // "2026-04-29T09:00:00" in BRT (UTC-3) → 12:00 UTC
    const result = tz.combineDateAndTime(
      "2026-04-29",
      new Date("1970-01-01T09:00:00Z"),
      "America/Sao_Paulo",
    );
    expect(result.toISOString()).toBe("2026-04-29T12:00:00.000Z");
  });

  it("crosses UTC midnight when local time is late evening", () => {
    // 22:30 BRT → 01:30 UTC next day → date in UTC becomes 2026-04-30
    const result = tz.combineDateAndTime(
      "2026-04-29",
      new Date("1970-01-01T22:30:00Z"),
      "America/Sao_Paulo",
    );
    expect(result.toISOString()).toBe("2026-04-30T01:30:00.000Z");
  });

  it("handles positive UTC offset (Asia/Kolkata +05:30)", () => {
    // 09:00 IST (local) → 09:00 - 5:30 = 03:30 UTC
    const result = tz.combineDateAndTime(
      "2026-04-29",
      new Date("1970-01-01T09:00:00Z"),
      "Asia/Kolkata",
    );
    expect(result.toISOString()).toBe("2026-04-29T03:30:00.000Z");
  });

  it("handles zero-UTC-offset timezone (UTC/GMT)", () => {
    // 14:00 UTC local = 14:00 UTC stored
    const result = tz.combineDateAndTime(
      "2026-04-29",
      new Date("1970-01-01T14:00:00Z"),
      "UTC",
    );
    expect(result.toISOString()).toBe("2026-04-29T14:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// parseIsoInstant
// ---------------------------------------------------------------------------

describe("SchedulingTimezoneService.parseIsoInstant", () => {
  it("accepts ISO datetime with Z suffix", () => {
    const result = tz.parseIsoInstant("2026-04-29T09:00:00Z", "startsAt");
    expect(result.toISOString()).toBe("2026-04-29T09:00:00.000Z");
  });

  it("accepts ISO datetime with negative offset -03:00", () => {
    // 09:00-03:00 = 12:00 UTC
    const result = tz.parseIsoInstant("2026-04-29T09:00:00-03:00", "startsAt");
    expect(result.toISOString()).toBe("2026-04-29T12:00:00.000Z");
  });

  it("accepts ISO datetime with positive offset +05:30", () => {
    // 09:00+05:30 = 03:30 UTC
    const result = tz.parseIsoInstant("2026-04-29T09:00:00+05:30", "startsAt");
    expect(result.toISOString()).toBe("2026-04-29T03:30:00.000Z");
  });

  it("accepts ISO datetime without seconds (HH:MM format)", () => {
    const result = tz.parseIsoInstant("2026-04-29T09:00Z", "startsAt");
    expect(result.toISOString()).toBe("2026-04-29T09:00:00.000Z");
  });

  it("rejects datetime without explicit timezone offset", () => {
    expect(() =>
      tz.parseIsoInstant("2026-04-29T09:00:00", "startsAt"),
    ).toThrow(BadRequestException);
  });

  it("rejects date-only string (no time component)", () => {
    expect(() => tz.parseIsoInstant("2026-04-29", "startsAt")).toThrow(
      BadRequestException,
    );
  });

  it("rejects empty string", () => {
    expect(() => tz.parseIsoInstant("", "startsAt")).toThrow(BadRequestException);
  });

  it("rejects completely invalid string", () => {
    expect(() => tz.parseIsoInstant("not-a-date", "startsAt")).toThrow(
      BadRequestException,
    );
  });
});

// ---------------------------------------------------------------------------
// getTenantDateKey — timezone boundary
// ---------------------------------------------------------------------------

describe("SchedulingTimezoneService.getTenantDateKey", () => {
  it("resolves correct local date for BRT when UTC instant is next UTC day", () => {
    // 2026-04-30T01:00:00Z = 22:00 BRT on 2026-04-29
    expect(
      tz.getTenantDateKey(new Date("2026-04-30T01:00:00Z"), "America/Sao_Paulo"),
    ).toBe("2026-04-29");
  });

  it("resolves correct local date for BRT at UTC midnight boundary", () => {
    // 2026-04-29T03:00:00Z = midnight BRT (00:00 BRT) = 2026-04-29
    expect(
      tz.getTenantDateKey(new Date("2026-04-29T03:00:00Z"), "America/Sao_Paulo"),
    ).toBe("2026-04-29");
  });

  it("resolves correct local date for IST (positive offset) crossing UTC midnight", () => {
    // 2026-04-29T19:00:00Z = 00:30 IST → local date 2026-04-30 (next IST day)
    expect(
      tz.getTenantDateKey(new Date("2026-04-29T19:00:00Z"), "Asia/Kolkata"),
    ).toBe("2026-04-30");
  });

  it("resolves UTC date unchanged when timezone is UTC", () => {
    expect(
      tz.getTenantDateKey(new Date("2026-04-29T23:59:59Z"), "UTC"),
    ).toBe("2026-04-29");
  });
});

// ---------------------------------------------------------------------------
// buildDayContext — weekday and UTC bounds
// ---------------------------------------------------------------------------

describe("SchedulingTimezoneService.buildDayContext", () => {
  it("resolves TUESDAY for 2026-04-28 in BRT", () => {
    // 2026-04-28 is a Tuesday
    const ctx = tz.buildDayContext("2026-04-28", "America/Sao_Paulo");
    expect(ctx.weekday).toBe("TUESDAY");
  });

  it("resolves WEDNESDAY for 2026-04-29 in BRT", () => {
    const ctx = tz.buildDayContext("2026-04-29", "America/Sao_Paulo");
    expect(ctx.weekday).toBe("WEDNESDAY");
  });

  it("emits correct UTC bounds for 2026-04-29 in BRT (UTC-3)", () => {
    const ctx = tz.buildDayContext("2026-04-29", "America/Sao_Paulo");
    // midnight BRT = 03:00 UTC; next midnight = 03:00 UTC next day
    expect(ctx.dayStartUtc.toISOString()).toBe("2026-04-29T03:00:00.000Z");
    expect(ctx.dayEndUtcExclusive.toISOString()).toBe("2026-04-30T03:00:00.000Z");
    expect(ctx.date).toBe("2026-04-29");
  });

  it("emits correct UTC bounds for IST timezone (UTC+5:30)", () => {
    // midnight IST on 2026-04-29 = 2026-04-28T18:30:00Z
    // next midnight IST = 2026-04-29T18:30:00Z
    const ctx = tz.buildDayContext("2026-04-29", "Asia/Kolkata");
    expect(ctx.dayStartUtc.toISOString()).toBe("2026-04-28T18:30:00.000Z");
    expect(ctx.dayEndUtcExclusive.toISOString()).toBe("2026-04-29T18:30:00.000Z");
  });

  it("rejects invalid date format", () => {
    expect(() => tz.buildDayContext("29-04-2026", "America/Sao_Paulo")).toThrow(
      BadRequestException,
    );
  });
});

// ---------------------------------------------------------------------------
// normalizeDateOnly
// ---------------------------------------------------------------------------

describe("SchedulingTimezoneService.normalizeDateOnly", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(tz.normalizeDateOnly("2026-04-29")).toBe("2026-04-29");
  });

  it("rejects date with single-digit month (M instead of MM)", () => {
    expect(() => tz.normalizeDateOnly("2026-4-29")).toThrow(BadRequestException);
  });

  it("rejects datetime string (has T separator)", () => {
    expect(() => tz.normalizeDateOnly("2026-04-29T09:00:00Z")).toThrow(
      BadRequestException,
    );
  });

  it("rejects empty string", () => {
    expect(() => tz.normalizeDateOnly("")).toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// assertCanCheckIn — real timezone service, UTC/BRT boundary smoke
// ---------------------------------------------------------------------------

describe("SchedulingPoliciesService.assertCanCheckIn — timezone boundary", () => {
  // BRT = UTC-3
  // Appointment: 23:00 BRT on 2026-04-29 = 2026-04-30T02:00:00Z
  const appointmentAt23BRT = { startsAt: new Date("2026-04-30T02:00:00Z"), status: "BOOKED" as const };

  it("allows check-in when local BRT date matches appointment local date (before UTC midnight)", () => {
    // Check-in attempt: 22:00 UTC 2026-04-29 = 19:00 BRT 2026-04-29 → same BRT day
    expect(() =>
      policies.assertCanCheckIn(
        appointmentAt23BRT,
        "America/Sao_Paulo",
        new Date("2026-04-29T22:00:00Z"),
      ),
    ).not.toThrow();
  });

  it("blocks check-in when UTC date matches but BRT day is ahead (after local midnight)", () => {
    // Check-in attempt: 04:00 UTC 2026-04-30 = 01:00 BRT 2026-04-30 → different BRT day
    expect(() =>
      policies.assertCanCheckIn(
        appointmentAt23BRT,
        "America/Sao_Paulo",
        new Date("2026-04-30T04:00:00Z"),
      ),
    ).toThrow(BadRequestException);
  });

  it("blocks check-in when check-in is on the previous local BRT day", () => {
    // Appointment: 01:00 BRT on 2026-04-29 = 2026-04-29T04:00:00Z
    // Check-in at: 22:00 UTC 2026-04-28 = 19:00 BRT 2026-04-28 → day before
    expect(() =>
      policies.assertCanCheckIn(
        { startsAt: new Date("2026-04-29T04:00:00Z"), status: "BOOKED" as const },
        "America/Sao_Paulo",
        new Date("2026-04-28T22:00:00Z"),
      ),
    ).toThrow(BadRequestException);
  });

  it("allows check-in for positive UTC-offset timezone (IST) when local dates match", () => {
    // Appointment: 09:00 IST 2026-04-29 = 2026-04-29T03:30:00Z
    // Check-in at: 2026-04-29T06:00:00Z = 11:30 IST 2026-04-29 → same IST day
    expect(() =>
      policies.assertCanCheckIn(
        { startsAt: new Date("2026-04-29T03:30:00Z"), status: "CONFIRMED" as const },
        "Asia/Kolkata",
        new Date("2026-04-29T06:00:00Z"),
      ),
    ).not.toThrow();
  });

  it("blocks check-in for IST timezone when local date crosses midnight", () => {
    // Appointment: 00:30 IST 2026-04-29 = 2026-04-28T19:00:00Z
    // Check-in at: 2026-04-28T18:00:00Z = 23:30 IST 2026-04-28 → day before in IST
    expect(() =>
      policies.assertCanCheckIn(
        { startsAt: new Date("2026-04-28T19:00:00Z"), status: "BOOKED" as const },
        "Asia/Kolkata",
        new Date("2026-04-28T18:00:00Z"),
      ),
    ).toThrow(BadRequestException);
  });
});
