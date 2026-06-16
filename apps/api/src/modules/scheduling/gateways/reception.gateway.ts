import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { UnauthorizedException } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { AuthenticatedUser } from "../../../auth/interfaces/authenticated-user.interface";
import { RealtimeAuthService } from "../../../auth/realtime-auth.service";
import { OperationalLoggerService } from "../../../common/observability/operational-logger.service";
import {
  OperationalFlowOutcome,
  OperationalObservabilityService,
} from "../../../common/observability/operational-observability.service";
import { resolveRealtimeCorsOrigin } from "../../../common/observability/realtime.utils";

export interface ReceptionRealtimeEvent {
  appointmentId: string;
  tenantId: string;
  status: string;
  event:
    | "APPOINTMENT_CREATED"
    | "APPOINTMENT_UPDATED"
    | "APPOINTMENT_STATUS_CHANGED"
    | "APPOINTMENT_NOTES_UPDATED";
  occurredAt: string;
}

@WebSocketGateway({
  cors: {
    origin: resolveRealtimeCorsOrigin(),
    credentials: true,
  },
  namespace: "reception",
})
export class ReceptionGateway
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
      namespace: "reception",
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const startedAt = Date.now();

    try {
      const user = await this.realtimeAuthService.authenticateSocket(client);
      const tenantId = this.resolveTenantId(user);

      this.assertRequestedScope(client, tenantId);

      client.data.user = user;
      client.data.tenantId = tenantId;

      client.join(this.buildTenantRoom(tenantId));

      this.recordFlow(
        "realtime.reception.connect",
        "success",
        Date.now() - startedAt,
        tenantId,
      );
      this.logger.info("realtime.connection.accepted", {
        channel: "realtime",
        flow: "reception.connect",
        socketId: client.id,
        tenantId,
        userId: user.id,
      });
    } catch (error) {
      this.recordFlow(
        "realtime.reception.connect",
        "rejected",
        Date.now() - startedAt,
        null,
      );
      this.logger.warn("realtime.connection.rejected", {
        channel: "realtime",
        flow: "reception.connect",
        socketId: client.id,
        reason:
          error instanceof Error ? error.message : "Unauthorized realtime connection.",
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
      flow: "reception.disconnect",
      socketId: client.id,
      tenantId:
        typeof client.data?.tenantId === "string" ? client.data.tenantId : null,
      userId:
        client.data?.user && typeof client.data.user.id === "string"
          ? client.data.user.id
          : null,
    });
  }

  emitAppointmentUpdated(data: ReceptionRealtimeEvent): void {
    const room = this.buildTenantRoom(data.tenantId);

    try {
      this.server.to(room).emit("appointment_updated", data);
      this.recordFlow(
        "realtime.reception.emit.appointment_updated",
        "success",
        0,
        data.tenantId,
      );
    } catch (error) {
      this.recordFlow(
        "realtime.reception.emit.appointment_updated",
        "failure",
        0,
        data.tenantId,
      );
      this.logger.warn("realtime.emit.failed", {
        channel: "realtime",
        flow: "reception.emit.appointment_updated",
        tenantId: data.tenantId,
        appointmentId: data.appointmentId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private resolveTenantId(user: AuthenticatedUser): string {
    if (!user.activeTenantId?.trim()) {
      throw new UnauthorizedException("Active tenant context is required.");
    }
    return user.activeTenantId.trim();
  }

  private assertRequestedScope(client: Socket, tenantId: string): void {
    const requestedTenantId = this.readHandshakeValue(client, "tenantId");
    if (requestedTenantId && requestedTenantId !== tenantId) {
      throw new UnauthorizedException("Realtime tenant scope mismatch.");
    }
  }

  private readHandshakeValue(client: Socket, field: string): string | null {
    const value = client.handshake.query[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    return null;
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
