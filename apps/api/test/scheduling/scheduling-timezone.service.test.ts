import { describe, expect, it } from "vitest";
import { SchedulingTimezoneService } from "../../src/modules/scheduling/scheduling-timezone.service";

describe("SchedulingTimezoneService", () => {
  const service = new SchedulingTimezoneService({} as never);

  it("resolves tenant local date across UTC boundary", () => {
    expect(
      service.getTenantDateKey(
        new Date("2030-03-12T02:30:00.000Z"),
        "America/Sao_Paulo",
      ),
    ).toBe("2030-03-11");
  });

  it("builds day bounds from tenant timezone instead of UTC midnight", () => {
    const context = service.buildDayContext("2030-03-12", "America/Sao_Paulo");

    expect(context.dayStartUtc.toISOString()).toBe("2030-03-12T03:00:00.000Z");
    expect(context.dayEndUtcExclusive.toISOString()).toBe("2030-03-13T03:00:00.000Z");
    expect(context.date).toBe("2030-03-12");
  });

  it("rejects datetimes without explicit timezone offset", () => {
    expect(() =>
      service.parseIsoInstant("2030-03-12T09:00:00", "startsAt"),
    ).toThrow(/explicit timezone offset/i);
  });
});
