import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { getAccessTokenCookieName } from "@/lib/session/constants";

function toBase64Url(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makeToken(payload: Record<string, unknown>): string {
  const header = toBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = toBase64Url(JSON.stringify(payload));

  return `${header}.${body}.signature`;
}

function runMiddleware(
  pathname: string,
  tokens?: Partial<Record<"clinic" | "platform", string>>,
) {
  const url = `http://localhost:3000${pathname}`;
  const headers = new Headers();

  const cookieParts = [
    tokens?.clinic
      ? `${getAccessTokenCookieName("clinic")}=${tokens.clinic}`
      : null,
    tokens?.platform
      ? `${getAccessTokenCookieName("platform")}=${tokens.platform}`
      : null,
  ].filter(Boolean);

  if (cookieParts.length > 0) {
    headers.set("cookie", cookieParts.join("; "));
  }

  const request = new NextRequest(url, { headers });
  return middleware(request);
}

describe("middleware integration", () => {
  it("redirects reception from clinic root to reception page", () => {
    const token = makeToken({
      profile: "clinic",
      roles: ["RECEPTION"],
    });

    const response = runMiddleware("/clinic", { clinic: token });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/clinic/reception",
    );
  });

  it("redirects professional from clinic root to professional page", () => {
    const token = makeToken({
      profile: "clinic",
      roles: ["PROFESSIONAL"],
    });

    const response = runMiddleware("/clinic", { clinic: token });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/clinic/professional",
    );
  });

  it("redirects unauthenticated clinic route to clinic login", () => {
    const response = runMiddleware("/clinic/patients");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login/clinic",
    );
  });

  it("keeps tenant admin in clinic users route", () => {
    const token = makeToken({
      profile: "clinic",
      roles: ["TENANT_ADMIN"],
    });

    const response = runMiddleware("/clinic/users", { clinic: token });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects reception away from clinic users route", () => {
    const token = makeToken({
      profile: "clinic",
      roles: ["RECEPTION"],
    });

    const response = runMiddleware("/clinic/users", { clinic: token });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/clinic/reception",
    );
  });

  it("keeps reception in clinic account route", () => {
    const token = makeToken({
      profile: "clinic",
      roles: ["RECEPTION"],
    });

    const response = runMiddleware("/clinic/account", { clinic: token });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps reception in clinic messaging route", () => {
    const token = makeToken({
      profile: "clinic",
      roles: ["RECEPTION"],
    });

    const response = runMiddleware("/clinic/messaging", { clinic: token });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects professional away from reception route", () => {
    const token = makeToken({
      profile: "clinic",
      roles: ["PROFESSIONAL"],
    });

    const response = runMiddleware("/clinic/reception", { clinic: token });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/clinic/professional",
    );
  });

  it("redirects to platform login when only clinic session exists", () => {
    const clinicToken = makeToken({
      profile: "clinic",
      roles: ["TENANT_ADMIN"],
    });

    const response = runMiddleware("/platform/tenants", { clinic: clinicToken });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login/platform",
    );
  });

  it("keeps clinic and platform sessions isolated in the same browser", () => {
    const clinicToken = makeToken({
      profile: "clinic",
      roles: ["TENANT_ADMIN"],
    });
    const platformToken = makeToken({
      profile: "platform",
      roles: ["SUPER_ADMIN"],
    });

    const clinicResponse = runMiddleware("/clinic", {
      clinic: clinicToken,
      platform: platformToken,
    });
    const platformResponse = runMiddleware("/platform", {
      clinic: clinicToken,
      platform: platformToken,
    });

    expect(clinicResponse.status).toBe(200);
    expect(clinicResponse.headers.get("x-middleware-next")).toBe("1");
    expect(platformResponse.status).toBe(200);
    expect(platformResponse.headers.get("x-middleware-next")).toBe("1");
  });
});
