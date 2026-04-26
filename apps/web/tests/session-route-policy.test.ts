import { describe, expect, it } from "vitest";
import { resolveRouteRedirect } from "@/lib/session-route-policy";

describe("session route policy", () => {
  it("redirects clinic admin from login to clinic dashboard", () => {
    const redirect = resolveRouteRedirect("/login/clinic", {
      profile: "clinic",
      roles: ["TENANT_ADMIN"],
    });

    expect(redirect).toBe("/clinic");
  });

  it("redirects clinic manager from clinic login to clinic dashboard", () => {
    const redirect = resolveRouteRedirect("/login/clinic", {
      profile: "clinic",
      roles: ["CLINIC_MANAGER"],
    });

    expect(redirect).toBe("/clinic");
  });

  it("redirects reception from clinic root to reception panel", () => {
    const redirect = resolveRouteRedirect("/clinic", {
      profile: "clinic",
      roles: ["RECEPTION"],
    });

    expect(redirect).toBe("/clinic/reception");
  });

  it("redirects professional from clinic login to professional panel", () => {
    const redirect = resolveRouteRedirect("/login/clinic", {
      profile: "clinic",
      roles: ["PROFESSIONAL"],
    });

    expect(redirect).toBe("/clinic/professional");
  });

  it("redirects professional away from clinic root", () => {
    const redirect = resolveRouteRedirect("/clinic", {
      profile: "clinic",
      roles: ["PROFESSIONAL"],
    });

    expect(redirect).toBe("/clinic/professional");
  });

  it("redirects professional away from reception route", () => {
    const redirect = resolveRouteRedirect("/clinic/reception", {
      profile: "clinic",
      roles: ["PROFESSIONAL"],
    });

    expect(redirect).toBe("/clinic/professional");
  });

  it("redirects missing session on clinic area to clinic login", () => {
    const redirect = resolveRouteRedirect("/clinic/patients", null);

    expect(redirect).toBe("/login/clinic");
  });

  it("redirects clinic profile trying to access platform area", () => {
    const redirect = resolveRouteRedirect("/platform/tenants", {
      profile: "clinic",
      roles: ["TENANT_ADMIN"],
    });

    expect(redirect).toBe("/clinic");
  });

  it("keeps super admin inside platform area", () => {
    const redirect = resolveRouteRedirect("/platform/tenants", {
      profile: "platform",
      roles: ["SUPER_ADMIN"],
    });

    expect(redirect).toBeNull();
  });

  it("redirects super admin from clinic area to platform dashboard", () => {
    const redirect = resolveRouteRedirect("/clinic/reception", {
      profile: "platform",
      roles: ["SUPER_ADMIN"],
    });

    expect(redirect).toBe("/platform");
  });

  it("keeps clinic admin in clinic root without redirect loop", () => {
    const redirect = resolveRouteRedirect("/clinic", {
      profile: "clinic",
      roles: ["TENANT_ADMIN"],
    });

    expect(redirect).toBeNull();
  });

  it("allows reception to stay in reception panel", () => {
    const redirect = resolveRouteRedirect("/clinic/reception", {
      profile: "clinic",
      roles: ["RECEPTION"],
    });

    expect(redirect).toBeNull();
  });

  it("allows reception in messaging route", () => {
    const redirect = resolveRouteRedirect("/clinic/messaging", {
      profile: "clinic",
      roles: ["RECEPTION"],
    });

    expect(redirect).toBeNull();
  });

  it("allows tenant admin to access clinic users page", () => {
    const redirect = resolveRouteRedirect("/clinic/users", {
      profile: "clinic",
      roles: ["TENANT_ADMIN"],
    });

    expect(redirect).toBeNull();
  });

  it("blocks reception from clinic users page", () => {
    const redirect = resolveRouteRedirect("/clinic/users", {
      profile: "clinic",
      roles: ["RECEPTION"],
    });

      expect(redirect).toBe("/clinic/reception");
  });

  it("blocks clinic manager from clinic users page", () => {
    const redirect = resolveRouteRedirect("/clinic/users", {
      profile: "clinic",
      roles: ["CLINIC_MANAGER"],
    });

    expect(redirect).toBe("/clinic");
  });

  it("allows reception in clinic account page", () => {
    const redirect = resolveRouteRedirect("/clinic/account", {
      profile: "clinic",
      roles: ["RECEPTION"],
    });

    expect(redirect).toBeNull();
  });

  it("keeps professional in professional panel", () => {
    const redirect = resolveRouteRedirect("/clinic/professional", {
      profile: "clinic",
      roles: ["PROFESSIONAL"],
    });

    expect(redirect).toBeNull();
  });

  it("keeps professional in no-access page if already there", () => {
    const redirect = resolveRouteRedirect("/clinic/no-access", {
      profile: "clinic",
      roles: ["PROFESSIONAL"],
    });

    expect(redirect).toBeNull();
  });
});
