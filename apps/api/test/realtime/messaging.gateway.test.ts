import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingGateway } from "../../src/modules/messaging/gateways/messaging.gateway";
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
    id: "socket-msg-1",
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

describe("MessagingGateway", () => {
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

  it("joins only the authenticated tenant room", async () => {
    realtimeAuthService.authenticateSocket.mockResolvedValue(
      buildClinicActor({
        roles: [RoleCode.RECEPTION],
        activeTenantId: "tenant-1",
      }),
    );

    const gateway = new MessagingGateway(
      realtimeAuthService as never,
      observability as never,
      logger as never,
    );
    const client = buildClient({ tenantId: "tenant-1" });

    await gateway.handleConnection(client as never);

    expect(client.join).toHaveBeenCalledWith("tenant:tenant-1");
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(observability.recordFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: "realtime.messaging.connect",
        outcome: "success",
        tenantId: "tenant-1",
      }),
    );
  });

  it("rejects users without messaging clinic role", async () => {
    realtimeAuthService.authenticateSocket.mockResolvedValue(
      buildClinicActor({
        roles: [RoleCode.PROFESSIONAL],
        activeTenantId: "tenant-1",
      }),
    );

    const gateway = new MessagingGateway(
      realtimeAuthService as never,
      observability as never,
      logger as never,
    );
    const client = buildClient({ tenantId: "tenant-1" });

    await gateway.handleConnection(client as never);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith("realtime_unauthorized", {
      message: "Unauthorized realtime connection.",
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("emits tenant events only to the authenticated tenant room", () => {
    const realtimeServer = {
      to: vi.fn().mockReturnValue({
        emit: vi.fn(),
      }),
    };
    const gateway = new MessagingGateway(
      realtimeAuthService as never,
      observability as never,
      logger as never,
    );

    gateway.server = realtimeServer as never;
    gateway.emitThreadUpdated("tenant-1", {
      threadId: "thread-1",
      status: "OPEN",
      lastMessagePreview: null,
      lastMessageAt: null,
    });

    expect(realtimeServer.to).toHaveBeenCalledWith("tenant:tenant-1");
  });
});
