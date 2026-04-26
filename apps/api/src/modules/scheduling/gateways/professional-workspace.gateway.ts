import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { ProfessionalWorkspaceRealtimeEvent } from "@operaclinic/shared";
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

@WebSocketGateway({
  cors: {
    origin: resolveRealtimeCorsOrigin(),
    credentials: true,
  },
  namespace: "professional-workspace",
})
export class ProfessionalWorkspaceGateway
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
      namespace: "professional-workspace",
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const startedAt = Date.now();

    try {
      const user = await this.realtimeAuthService.authenticateSocket(client);
      const tenantId = this.resolveTenantId(user);
      const professionalId = this.resolveProfessionalId(user);

      this.assertRequestedScope(client, tenantId, professionalId);

      client.data.user = user;
      client.data.tenantId = tenantId;
      client.data.professionalId = professionalId;

      client.join(this.buildTenantRoom(tenantId));
      client.join(this.buildProfessionalRoom(tenantId, professionalId));

      this.recordFlow(
        "realtime.professional_workspace.connect",
        "success",
        Date.now() - startedAt,
        tenantId,
      );
      this.logger.info("realtime.connection.accepted", {
        channel: "realtime",
        flow: "professional_workspace.connect",
        socketId: client.id,
        tenantId,
        professionalId,
        userId: user.id,
      });
    } catch (error) {
      this.recordFlow(
        "realtime.professional_workspace.connect",
        "rejected",
        Date.now() - startedAt,
        null,
      );
      this.logger.warn("realtime.connection.rejected", {
        channel: "realtime",
        flow: "professional_workspace.connect",
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
      flow: "professional_workspace.disconnect",
      socketId: client.id,
      tenantId:
        typeof client.data?.tenantId === "string" ? client.data.tenantId : null,
      professionalId:
        typeof client.data?.professionalId === "string"
          ? client.data.professionalId
          : null,
      userId:
        client.data?.user && typeof client.data.user.id === "string"
          ? client.data.user.id
          : null,
    });
  }

  emitDashboardUpdated(data: ProfessionalWorkspaceRealtimeEvent) {
    const room = this.buildProfessionalRoom(data.tenantId, data.professionalId);

    try {
      this.server.to(room).emit("dashboard_updated", data);
      this.recordFlow(
        "realtime.professional_workspace.emit.dashboard_updated",
        "success",
        0,
        data.tenantId,
      );
    } catch (error) {
      this.recordFlow(
        "realtime.professional_workspace.emit.dashboard_updated",
        "failure",
        0,
        data.tenantId,
      );
      this.logger.warn("realtime.emit.failed", {
        channel: "realtime",
        flow: "professional_workspace.emit.dashboard_updated",
        tenantId: data.tenantId,
        professionalId: data.professionalId,
        appointmentId: data.appointmentId,
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

  private resolveProfessionalId(user: AuthenticatedUser): string {
    if (!user.roles.includes(RoleCode.PROFESSIONAL)) {
      throw new ForbiddenException("Professional role is required.");
    }

    const professionalId = user.linkedProfessionalId?.trim();

    if (!professionalId) {
      throw new ForbiddenException(
        "Current session is not linked to a professional profile.",
      );
    }

    return professionalId;
  }

  private assertRequestedScope(
    client: Socket,
    tenantId: string,
    professionalId: string,
  ): void {
    const requestedTenantId = this.readHandshakeValue(client, "tenantId");
    const requestedProfessionalId = this.readHandshakeValue(client, "professionalId");

    if (requestedTenantId && requestedTenantId !== tenantId) {
      throw new UnauthorizedException("Realtime tenant scope mismatch.");
    }

    if (requestedProfessionalId && requestedProfessionalId !== professionalId) {
      throw new UnauthorizedException("Realtime professional scope mismatch.");
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

  private buildProfessionalRoom(tenantId: string, professionalId: string): string {
    return `tenant:${tenantId}:professional:${professionalId}`;
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
