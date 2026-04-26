import { beforeAll, describe, expect, it } from "vitest";
import type {
  AuthResponsePayload,
  PasswordMutationResponsePayload,
  PasswordResetRequestResponsePayload,
  SessionMePayload,
} from "@operaclinic/shared";
import { SMOKE_E2E } from "@operaclinic/shared";
import { BrowserSession, type BrowserJsonResponse } from "./helpers/http-browser-session";

interface RuntimeStatusPayload {
  api: {
    status: "ok" | "degraded" | "down";
    message: string;
  };
  web: {
    status: "ok" | "degraded" | "down";
    message: string;
  };
}

interface NamedClinicResource {
  id: string;
  name: string;
}

interface ProfessionalResource {
  id: string;
  fullName: string;
  displayName: string;
  professionalRegister: string;
}

interface ReceptionPatientSummary {
  id: string;
  fullName: string;
}

interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
  professionalId: string;
  unitId: string;
}

interface ReceptionAppointmentDetail {
  id: string;
  status: string;
  patientId: string;
  patientName: string;
  professionalId: string;
  consultationTypeId: string;
  unitId: string | null;
  startsAt: string;
  endsAt: string;
  confirmedAt: string | null;
  checkedInAt: string | null;
  cancellationReason: string | null;
}

interface UserSummary {
  id: string;
  email: string;
  status: string;
}

interface SmokeResources {
  patientId: string;
  professionalId: string;
  consultationTypeId: string;
  unitId: string;
}

const TENANT_TIMEZONE = "America/Sao_Paulo";
const MIN_CHECKIN_LEAD_MINUTES = 20;
const SMOKE_TEST_TIMEOUT_MS = 40_000;

function toTenantDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TENANT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildIdempotencyKey(label: string): string {
  return `smoke-e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function throwIfNotSuccessful<T>(
  result: BrowserJsonResponse<T>,
  label: string,
): T {
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${label} failed with ${result.status}: ${JSON.stringify(result.data)}`);
  }

  return result.data;
}

function expectUnauthorized<T>(
  result: BrowserJsonResponse<T>,
  label: string,
): void {
  expect(
    result.status,
    `${label} should be unauthorized: ${JSON.stringify(result.data)}`,
  ).toBe(401);
}

function extractResetToken(payload: PasswordResetRequestResponsePayload): string {
  if (payload.resetTokenPreview?.trim()) {
    return payload.resetTokenPreview;
  }

  if (payload.resetUrlPreview?.trim()) {
    const url = new URL(payload.resetUrlPreview, "http://localhost:3000");
    const token = url.searchParams.get("token");

    if (token?.trim()) {
      return token;
    }
  }

  throw new Error(`Password reset preview is unavailable: ${JSON.stringify(payload)}`);
}

async function resolveSmokeResources(session: BrowserSession): Promise<SmokeResources> {
  const professionals = throwIfNotSuccessful(
    await session.requestJson<ProfessionalResource[]>("/api/professionals"),
    "load professionals",
  );
  const consultationTypes = throwIfNotSuccessful(
    await session.requestJson<NamedClinicResource[]>("/api/consultation-types"),
    "load consultation types",
  );
  const units = throwIfNotSuccessful(
    await session.requestJson<NamedClinicResource[]>("/api/units"),
    "load units",
  );
  const patients = throwIfNotSuccessful(
    await session.requestJson<ReceptionPatientSummary[]>("/api/reception/patients", {
      query: {
        search: SMOKE_E2E.aestheticClinicResources.patientFullName,
        limit: 5,
      },
    }),
    "search smoke patient",
  );

  const professional = professionals.find(
    (candidate) =>
      candidate.professionalRegister === SMOKE_E2E.aestheticClinicResources.professionalRegister,
  );
  const consultationType = consultationTypes.find(
    (candidate) => candidate.name === SMOKE_E2E.aestheticClinicResources.consultationTypeName,
  );
  const unit = units.find((candidate) => candidate.name === SMOKE_E2E.aestheticClinicResources.unitName);
  const patient = patients.find(
    (candidate) => candidate.fullName === SMOKE_E2E.aestheticClinicResources.patientFullName,
  );

  if (!professional || !consultationType || !unit || !patient) {
    throw new Error(
      `Smoke fixture resources are missing. Run prisma seed and smoke:e2e:seed first. ${JSON.stringify({
        professionalFound: Boolean(professional),
        consultationTypeFound: Boolean(consultationType),
        unitFound: Boolean(unit),
        patientFound: Boolean(patient),
      })}`,
    );
  }

  return {
    patientId: patient.id,
    professionalId: professional.id,
    consultationTypeId: consultationType.id,
    unitId: unit.id,
  };
}

async function findAvailabilitySlot(
  session: BrowserSession,
  resources: SmokeResources,
  date: Date,
  minimumStartsAt = 0,
): Promise<AvailabilitySlot> {
  const dateKey = toTenantDateKey(date);
  const availability = throwIfNotSuccessful(
    await session.requestJson<AvailabilitySlot[]>("/api/reception/availability", {
      query: {
        professionalId: resources.professionalId,
        consultationTypeId: resources.consultationTypeId,
        unitId: resources.unitId,
        date: dateKey,
      },
    }),
    `load availability for ${dateKey}`,
  );

  const slot = availability.find(
    (candidate) => new Date(candidate.startsAt).getTime() >= minimumStartsAt,
  );

  if (!slot) {
    throw new Error(
      `No smoke slot found for ${dateKey}. Ensure the fixture seed ran and there is remaining future availability on the clinic local day.`,
    );
  }

  return slot;
}

async function loginClinicUser(
  email: string,
  password: string,
): Promise<BrowserSession> {
  const session = new BrowserSession();
  throwIfNotSuccessful(
    await session.login({
      email,
      password,
    }),
    `login ${email}`,
  );
  return session;
}

describe.sequential("smoke e2e", () => {
  let smokeResources: SmokeResources;

  beforeAll(async () => {
    const runtimeSession = new BrowserSession();
    const runtimeStatus = throwIfNotSuccessful(
      await runtimeSession.requestJson<RuntimeStatusPayload>("/api/runtime/status"),
      "load runtime status",
    );

    if (runtimeStatus.web.status !== "ok" || runtimeStatus.api.status !== "ok") {
      throw new Error(
        `Web/API are not ready for smoke E2E: ${JSON.stringify(runtimeStatus)}`,
      );
    }

    const adminSession = await loginClinicUser(
      SMOKE_E2E.aestheticClinicAdmin.email,
      SMOKE_E2E.aestheticClinicAdmin.password,
    );

    smokeResources = await resolveSmokeResources(adminSession);
  });

  it("logs into the platform", async () => {
    const session = new BrowserSession();
    const login = throwIfNotSuccessful(
      await session.login({
        email: SMOKE_E2E.platform.email,
        password: SMOKE_E2E.platform.password,
      }),
      "platform login",
    );

    expect(login.user.profile).toBe("platform");

    const me = throwIfNotSuccessful(
      await session.sessionMe("platform"),
      "platform session me",
    );

    expect(me.user.email).toBe(SMOKE_E2E.platform.email);
    expect(me.user.profile).toBe("platform");
    expect(me.user.roles).toContain("SUPER_ADMIN");
  }, SMOKE_TEST_TIMEOUT_MS);

  it("logs into the clinic", async () => {
    const session = new BrowserSession();
    const login = throwIfNotSuccessful(
      await session.login({
        email: SMOKE_E2E.aestheticClinicReception.email,
        password: SMOKE_E2E.aestheticClinicReception.password,
      }),
      "clinic login",
    );

    expect(login.user.profile).toBe("clinic");
    expect(login.user.activeTenantId).toBeTruthy();

    const me = throwIfNotSuccessful(
      await session.sessionMe("clinic"),
      "clinic session me",
    );

    expect(me.user.email).toBe(SMOKE_E2E.aestheticClinicReception.email);
    expect(me.user.profile).toBe("clinic");

    const dashboard = throwIfNotSuccessful(
      await session.requestJson("/api/reception/dashboard"),
      "reception dashboard",
    );

    expect(dashboard).toBeTruthy();
  }, SMOKE_TEST_TIMEOUT_MS);

  it("reception creates, confirms and checks in an appointment", async () => {
    const receptionSession = await loginClinicUser(
      SMOKE_E2E.aestheticClinicReception.email,
      SMOKE_E2E.aestheticClinicReception.password,
    );
    const minimumStartsAt =
      Date.now() + MIN_CHECKIN_LEAD_MINUTES * 60 * 1000;
    const slot = await findAvailabilitySlot(
      receptionSession,
      smokeResources,
      new Date(),
      minimumStartsAt,
    );

    const created = throwIfNotSuccessful(
      await receptionSession.requestJson<ReceptionAppointmentDetail>("/api/reception/appointments", {
        method: "POST",
        body: {
          patientId: smokeResources.patientId,
          professionalId: smokeResources.professionalId,
          consultationTypeId: smokeResources.consultationTypeId,
          unitId: smokeResources.unitId,
          startsAt: slot.startsAt,
          room: SMOKE_E2E.aestheticClinicResources.appointmentRoom,
          notes: SMOKE_E2E.aestheticClinicResources.appointmentNote,
          idempotencyKey: buildIdempotencyKey("check-in"),
        },
      }),
      "create same-day reception appointment",
    );

    expect(created.status).toBe("BOOKED");

    const confirmed = throwIfNotSuccessful(
      await receptionSession.requestJson<ReceptionAppointmentDetail>(
        `/api/reception/appointments/${created.id}/confirm`,
        {
          method: "PATCH",
          body: {
            reason: "Smoke E2E confirmation",
          },
        },
      ),
      "confirm reception appointment",
    );

    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.confirmedAt).toBeTruthy();

    const checkedIn = throwIfNotSuccessful(
      await receptionSession.requestJson<ReceptionAppointmentDetail>(
        `/api/reception/appointments/${created.id}/check-in`,
        {
          method: "PATCH",
          body: {
            reason: "Smoke E2E check-in",
          },
        },
      ),
      "check in reception appointment",
    );

    expect(checkedIn.status).toBe("CHECKED_IN");
    expect(checkedIn.checkedInAt).toBeTruthy();
  }, SMOKE_TEST_TIMEOUT_MS);

  it("reception creates and cancels a future appointment", async () => {
    const receptionSession = await loginClinicUser(
      SMOKE_E2E.aestheticClinicReception.email,
      SMOKE_E2E.aestheticClinicReception.password,
    );
    const slot = await findAvailabilitySlot(
      receptionSession,
      smokeResources,
      addDays(new Date(), 1),
    );

    const created = throwIfNotSuccessful(
      await receptionSession.requestJson<ReceptionAppointmentDetail>("/api/reception/appointments", {
        method: "POST",
        body: {
          patientId: smokeResources.patientId,
          professionalId: smokeResources.professionalId,
          consultationTypeId: smokeResources.consultationTypeId,
          unitId: smokeResources.unitId,
          startsAt: slot.startsAt,
          room: SMOKE_E2E.aestheticClinicResources.appointmentRoom,
          notes: `${SMOKE_E2E.aestheticClinicResources.appointmentNote} cancel`,
          idempotencyKey: buildIdempotencyKey("cancel"),
        },
      }),
      "create cancellable appointment",
    );

    const canceled = throwIfNotSuccessful(
      await receptionSession.requestJson<ReceptionAppointmentDetail>(
        `/api/reception/appointments/${created.id}/cancel`,
        {
          method: "PATCH",
          body: {
            reason: "Smoke E2E cancellation",
          },
        },
      ),
      "cancel reception appointment",
    );

    expect(canceled.status).toBe("CANCELED");
    expect(canceled.cancellationReason).toBe("Smoke E2E cancellation");
  }, SMOKE_TEST_TIMEOUT_MS);

  it("keeps clinic and platform sessions isolated in the same browser", async () => {
    const browser = new BrowserSession();

    throwIfNotSuccessful(
      await browser.login({
        email: SMOKE_E2E.aestheticClinicAdmin.email,
        password: SMOKE_E2E.aestheticClinicAdmin.password,
      }),
      "clinic login in shared browser",
    );
    throwIfNotSuccessful(
      await browser.login({
        email: SMOKE_E2E.platform.email,
        password: SMOKE_E2E.platform.password,
      }),
      "platform login in shared browser",
    );

    const clinicMe = throwIfNotSuccessful(
      await browser.sessionMe("clinic"),
      "shared browser clinic session",
    );
    const platformMe = throwIfNotSuccessful(
      await browser.sessionMe("platform"),
      "shared browser platform session",
    );

    expect(clinicMe.user.profile).toBe("clinic");
    expect(clinicMe.user.email).toBe(SMOKE_E2E.aestheticClinicAdmin.email);
    expect(platformMe.user.profile).toBe("platform");
    expect(platformMe.user.email).toBe(SMOKE_E2E.platform.email);
  }, SMOKE_TEST_TIMEOUT_MS);

  it("forces reauthentication after the clinic user changes their password", async () => {
    const accountSession = await loginClinicUser(
      SMOKE_E2E.aestheticClinicAccountUser.email,
      SMOKE_E2E.smokePassword,
    );

    const changed = throwIfNotSuccessful(
      await accountSession.requestJson<PasswordMutationResponsePayload>(
        "/api/auth/change-password",
        {
          method: "POST",
          query: {
            profile: "clinic",
          },
          body: {
            currentPassword: SMOKE_E2E.smokePassword,
            newPassword: SMOKE_E2E.smokeChangedPassword,
          },
        },
      ),
      "change clinic account password",
    );

    expect(changed.success).toBe(true);
    expect(changed.requiresReauthentication).toBe(true);

    expectUnauthorized(
      await accountSession.sessionMe("clinic"),
      "old clinic account session after password change",
    );

    const oldLoginSession = new BrowserSession();
    expectUnauthorized(
      await oldLoginSession.login({
        email: SMOKE_E2E.aestheticClinicAccountUser.email,
        password: SMOKE_E2E.smokePassword,
      }),
      "old clinic account password login",
    );

    const newLoginSession = new BrowserSession();
    const freshLogin = throwIfNotSuccessful(
      await newLoginSession.login({
        email: SMOKE_E2E.aestheticClinicAccountUser.email,
        password: SMOKE_E2E.smokeChangedPassword,
      }),
      "new clinic account password login",
    );

    expect(freshLogin.user.email).toBe(SMOKE_E2E.aestheticClinicAccountUser.email);
  }, SMOKE_TEST_TIMEOUT_MS);

  it("resets password with a secure token and invalidates active sessions", async () => {
    const existingSession = await loginClinicUser(
      SMOKE_E2E.aestheticClinicResetUser.email,
      SMOKE_E2E.smokePassword,
    );

    const resetRequest = throwIfNotSuccessful(
      await new BrowserSession().requestJson<PasswordResetRequestResponsePayload>(
        "/api/auth/request-password-reset",
        {
          method: "POST",
          body: {
            email: SMOKE_E2E.aestheticClinicResetUser.email,
          },
        },
      ),
      "request password reset",
    );

    expect(resetRequest.accepted).toBe(true);

    const resetToken = extractResetToken(resetRequest);

    const resetResult = throwIfNotSuccessful(
      await new BrowserSession().requestJson<PasswordMutationResponsePayload>(
        "/api/auth/reset-password",
        {
          method: "POST",
          body: {
            token: resetToken,
            newPassword: SMOKE_E2E.smokeChangedPassword,
          },
        },
      ),
      "reset password",
    );

    expect(resetResult.success).toBe(true);

    expectUnauthorized(
      await existingSession.sessionMe("clinic"),
      "existing session after password reset",
    );

    const oldLoginSession = new BrowserSession();
    expectUnauthorized(
      await oldLoginSession.login({
        email: SMOKE_E2E.aestheticClinicResetUser.email,
        password: SMOKE_E2E.smokePassword,
      }),
      "old reset user password login",
    );

    const newLogin = throwIfNotSuccessful(
      await new BrowserSession().login({
        email: SMOKE_E2E.aestheticClinicResetUser.email,
        password: SMOKE_E2E.smokeChangedPassword,
      }),
      "new reset user password login",
    );

    expect(newLogin.user.email).toBe(SMOKE_E2E.aestheticClinicResetUser.email);
  }, SMOKE_TEST_TIMEOUT_MS);

  it("blocks inactive users and restores access after reactivation", async () => {
    const adminSession = await loginClinicUser(
      SMOKE_E2E.aestheticClinicAdmin.email,
      SMOKE_E2E.aestheticClinicAdmin.password,
    );
    const lifecycleSession = await loginClinicUser(
      SMOKE_E2E.aestheticClinicLifecycleUser.email,
      SMOKE_E2E.smokePassword,
    );

    const users = throwIfNotSuccessful(
      await adminSession.requestJson<UserSummary[]>("/api/users", {
        query: {
          search: SMOKE_E2E.aestheticClinicLifecycleUser.email,
        },
      }),
      "search lifecycle user",
    );

    const lifecycleUser = users.find(
      (candidate) => candidate.email === SMOKE_E2E.aestheticClinicLifecycleUser.email,
    );

    if (!lifecycleUser) {
      throw new Error("Smoke lifecycle user not found.");
    }

    const deactivated = throwIfNotSuccessful(
      await adminSession.requestJson<UserSummary>(
        `/api/users/${lifecycleUser.id}/deactivate`,
        {
          method: "PATCH",
        },
      ),
      "deactivate lifecycle user",
    );

    expect(deactivated.status).toBe("INACTIVE");

    expectUnauthorized(
      await lifecycleSession.sessionMe("clinic"),
      "inactive lifecycle session",
    );

    const blockedLogin = new BrowserSession();
    expectUnauthorized(
      await blockedLogin.login({
        email: SMOKE_E2E.aestheticClinicLifecycleUser.email,
        password: SMOKE_E2E.smokePassword,
      }),
      "inactive lifecycle login",
    );

    const reactivated = throwIfNotSuccessful(
      await adminSession.requestJson<UserSummary>(
        `/api/users/${lifecycleUser.id}/reactivate`,
        {
          method: "PATCH",
        },
      ),
      "reactivate lifecycle user",
    );

    expect(reactivated.status).toBe("ACTIVE");

    const restoredLogin = throwIfNotSuccessful(
      await new BrowserSession().login({
        email: SMOKE_E2E.aestheticClinicLifecycleUser.email,
        password: SMOKE_E2E.smokePassword,
      }),
      "reactivated lifecycle login",
    );

    expect(restoredLogin.user.email).toBe(SMOKE_E2E.aestheticClinicLifecycleUser.email);
  }, SMOKE_TEST_TIMEOUT_MS);
});
