import { describe, expect, it } from "vitest";
import { getNavigationByProfile } from "@/lib/navigation";

describe("navigation by role", () => {
  it("shows administrative menu for tenant admin", () => {
    const items = getNavigationByProfile("clinic", ["TENANT_ADMIN"]);

    expect(items.some((item) => item.href === "/clinic")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/users")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/account")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/reception")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/messaging")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/integrations")).toBe(true);
  });

  it("shows management menu for clinic manager", () => {
    const items = getNavigationByProfile("clinic", ["CLINIC_MANAGER"]);

    expect(items.some((item) => item.href === "/clinic")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/reception")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/messaging")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/integrations")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/patients")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/users")).toBe(false);
    expect(items.some((item) => item.href === "/clinic/account")).toBe(true);
  });

  it("hides executive dashboard for reception", () => {
    const items = getNavigationByProfile("clinic", ["RECEPTION"]);

    expect(items.some((item) => item.href === "/clinic")).toBe(false);
    expect(items.some((item) => item.href === "/clinic/reception")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/messaging")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/integrations")).toBe(false);
    expect(items.some((item) => item.href === "/clinic/patients")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/account")).toBe(true);
  });

  it("shows dedicated workspace for professional only", () => {
    const items = getNavigationByProfile("clinic", ["PROFESSIONAL"]);

    expect(items).toHaveLength(2);
    expect(items.some((item) => item.href === "/clinic/account")).toBe(true);
    expect(items.some((item) => item.href === "/clinic/professional")).toBe(true);
  });
});
