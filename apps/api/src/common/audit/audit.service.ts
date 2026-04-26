import { Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AuditAction } from "./audit.constants";

type DbClient = Prisma.TransactionClient | PrismaClient | PrismaService;

export interface RecordAuditInput {
  action: AuditAction;
  actor: AuthenticatedUser;
  tenantId?: string | null;
  targetType: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditInput, dbClient?: DbClient): Promise<void> {
    const db = dbClient ?? this.prisma;

    await db.auditLog.create({
      data: {
        action: input.action,
        actorUserId: input.actor.id,
        actorProfile: input.actor.profile,
        actorRoles: input.actor.roles.map((role) => String(role)),
        tenantId: input.tenantId ?? null,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        metadata: input.metadata === undefined ? undefined : input.metadata,
      },
    });
  }
}
