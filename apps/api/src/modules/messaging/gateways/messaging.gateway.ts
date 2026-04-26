import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { RoleCode } from "@prisma/client";
import { Server, Socket } from "socket.io";
import { AuthenticatedUser } from "../../../auth/interfaces/authenticated-user.interface";
import { RealtimeAuthService } from "../../../auth/realtime-auth.service";
import { OperationalLoggerService } from "../../../common/observability/operational-logger.service";
import {
  OperationalFlowOutcome,
  OperationalObservabilityService,
} from "../../../common/observability/operational-observability.service";
import { resolveRealtimeCorsOrigin } from "../../../common/observability/realtime.utils";

interface MessagingThreadActivityPayload {
  threadId: string;
  direction: "INBOUND" | "OUTBOUND" | "SYSTEM";
  eventType:
    | "MESSAGE_RECEIVED"
    | "MESSAGE_SENT"
    | "MESSAGE_SEND_FAILED"
    | "THREAD_RESOLVED"
    | "THREAD_PATIENT_LINKED";
  occurredAt: string;
}

interface MessagingThreadUpdatedPayload {
  threadId: string;
  status: "OPEN" | "IN_HANDOFF" | "CLOSED";
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
}

@WebSocketGateway({
  cors: {
    origin: resolveRealtimeCorsOrigin(),
    credentials: true,
  },
  namespace: "messaging",
})
export class MessagingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly realtimeAuthService: RealtimeAuthService,
    private readonly observability: OperationalObservabilityService,
    private readonly logger: OperationalLoggerService,
  ) {}

  afterInit() {
    this.logger.info("realtime.gateway.initialized", {
      channel: "realtime",
      namespace: "messaging",
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const startedAt = Date.now();

    try {
      const user = await this.realtimeAuthService.authenticateSocket(client);
      const tenantId = this.resolveTenantId(user);

      this.assertAuthorizedRole(user);
      this.assertRequestedScope(client, tenantId);

      client.data.user = user;
      client.data.tenantId = tenantId;

      client.join(this.buildTenantRoom(tenantId));
      this.recordFlow(
        "realtime.messaging.connect",
        "success",
        Date.now() - startedAt,
        tenantId,
      );
      this.logger.info("realtime.connection.accepted", {
        channel: "realtime",
        flow: "messaging.connect",
        socketId: client.id,
        tenantId,
        userId: user.id,
      });
    } catch (error) {
      this.recordFlow(
        "realtime.messaging.connect",
        "rejected",
        Date.now() - startedAt,
        null,
      );
      this.logger.warn("realtime.connection.rejected", {
        channel: "realtime",
        flow: "messaging.connect",
        socketId: client.id,
        reason: error instanceof Error ? error.message : "Unauthorized realtime connection.",
      });
      client.emit("realtime_unauthorized", {
        message: "Unauthorized realtime connection.",
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.info("realtime.connection.closed", {
      channel: "realtime",
      flow: "messaging.disconnect",
      socketId: client.id,
      tenantId:
        typeof client.data?.tenantId === "string" ? client.data.tenantId : null,
      userId:
        client.data?.user && typeof client.data.user.id === "string"
          ? client.data.user.id
          : null,
    });
  }

  /**
   * Emit handoff update to all clients in a tenant room
   */
  emitHandoffUpdate(tenantId: string, data: any) {
    this.emitToTenantRoom(tenantId, "handoff_updated", data);
  }

  /**
   * Emit new handoff alert
   */
  emitNewHandoff(tenantId: string, data: any) {
    this.emitToTenantRoom(tenantId, "new_handoff", data);
  }

  /**
   * Emit message activity (inbound/outbound/system) to update inboxes in real time.
   */
  emitThreadActivity(tenantId: string, data: MessagingThreadActivityPayload) {
    this.emitToTenantRoom(tenantId, "thread_activity", data);
  }

  /**
   * Emit thread summary updates so sidebars can refresh status/preview timestamps.
   */
  emitThreadUpdated(tenantId: string, data: MessagingThreadUpdatedPayload) {
    this.emitToTenantRoom(tenantId, "thread_updated", data);
  }

  private emitToTenantRoom(
    tenantId: string,
    eventName: string,
    data: unknown,
  ): void {
    try {
      this.server.to(this.buildTenantRoom(tenantId)).emit(eventName, data);
      this.recordFlow(
        `realtime.messaging.emit.${eventName}`,
        "success",
        0,
        tenantId,
      );
    } catch (error) {
      this.recordFlow(
        `realtime.messaging.emit.${eventName}`,
        "failure",
        0,
        tenantId,
      );
      this.logger.warn("realtime.emit.failed", {
        channel: "realtime",
        flow: `messaging.emit.${eventName}`,
        tenantId,
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private resolveTenantId(user: AuthenticatedUser): string {
    if (!user.activeTenantId?.trim()) {
      throw new UnauthorizedException("Active tenant context is required.");
    }

    return user.activeTenantId.trim();
  }

  private assertAuthorizedRole(user: AuthenticatedUser): void {
    const allowedRoles = [
      RoleCode.TENANT_ADMIN,
      RoleCode.CLINIC_MANAGER,
      RoleCode.RECEPTION,
    ];

    if (!allowedRoles.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException("Clinic messaging role is required.");
    }
  }

  private assertRequestedScope(client: Socket, tenantId: string): void {
    const requestedTenantId = client.handshake.query.tenantId;

    if (
      typeof requestedTenantId === "string" &&
      requestedTenantId.trim() &&
      requestedTenantId.trim() !== tenantId
    ) {
      throw new UnauthorizedException("Realtime tenant scope mismatch.");
    }
  }

  private buildTenantRoom(tenantId: string): string {
    return `tenant:${tenantId}`;
  }

  private recordFlow(
    flow: string,
    outcome: OperationalFlowOutcome,
    durationMs: number,
    tenantId: string | null,
  ): void {
    this.observability.recordFlow({
      channel: "realtime",
      flow,
      outcome,
      durationMs,
      timestamp: Date.now(),
      tenantId,
    });
  }
}
