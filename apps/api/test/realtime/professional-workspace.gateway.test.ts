import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfessionalWorkspaceGateway } from "../../src/modules/scheduling/gateways/professional-workspace.gateway";
import { buildClinicActor } from "../helpers/actors";

function buildClient(
  query: Record<string, string> = {},
): {
  id: string;
  handshake: {
    query: Record<string, string>;
    auth: Record<string, string>;
    headers: Record<string, string>;
  };
  data: Record<string, unknown>;
  join: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
} {
  return {
    id: "socket-prof-1",
    handshake: {
      query,
      auth: {},
      headers: {},
    },
    data: {},
    join: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe("ProfessionalWorkspaceGateway", () => {
  const realtimeAuthService = {
    authenticateSocket: vi.fn(),
  };
  const observability = {
    recordFlow: vi.fn(),
  };
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("joins only tenant-scoped professional room from authenticated session", async () => {
    realtimeAuthService.authenticateSocket.mockResolvedValue(
      buildClinicActor({
        roles: [RoleCode.PROFESSIONAL],
        activeTenantId: "tenant-1",
        linkedProfessionalId: "professional-1",
      }),
    );

    const gateway = new ProfessionalWorkspaceGateway(
      realtimeAuthService as never,
      observability as never,
      logger as never,
    );
    const client = buildClient({
      tenantId: "tenant-1",
      professionalId: "professional-1",
    });

    await gateway.handleConnection(client as never);

    expect(client.join).toHaveBeenCalledWith("tenant:tenant-1");
    expect(client.join).toHaveBeenCalledWith(
      "tenant:tenant-1:professional:professional-1",
    );
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(observability.recordFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "realtime",
        flow: "realtime.professional_workspace.connect",
        outcome: "success",
        tenantId: "tenant-1",
      }),
    );
  });

  it("rejects connection when requested scope does not match authenticated professional", async () => {
    realtimeAuthService.authenticateSocket.mockResolvedValue(
      buildClinicActor({
        roles: [RoleCode.PROFESSIONAL],
        activeTenantId: "tenant-1",
        linkedProfessionalId: "professional-1",
      }),
    );

    const gateway = new ProfessionalWorkspaceGateway(
      realtimeAuthService as never,
      observability as never,
      logger as never,
    );
    const client = buildClient({
      tenantId: "tenant-1",
      professionalId: "professional-other",
    });

    await gateway.handleConnection(client as never);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith("realtime_unauthorized", {
      message: "Unauthorized realtime connection.",
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(observability.recordFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: "realtime.professional_workspace.connect",
        outcome: "rejected",
      }),
    );
  });

  it("emits dashboard updates to tenant-scoped professional room", () => {
    const realtimeServer = {
      to: vi.fn().mockReturnValue({
        emit: vi.fn(),
      }),
    };
    const gateway = new ProfessionalWorkspaceGateway(
      realtimeAuthService as never,
      observability as never,
      logger as never,
    );

    gateway.server = realtimeServer as never;

    gateway.emitDashboardUpdated({
      appointmentId: "appointment-1",
      tenantId: "tenant-1",
      professionalId: "professional-1",
      status: "BOOKED",
      event: "APPOINTMENT_UPDATED",
      occurredAt: "2030-01-01T00:00:00.000Z",
    });

    expect(realtimeServer.to).toHaveBeenCalledWith(
      "tenant:tenant-1:professional:professional-1",
    );
  });
});
