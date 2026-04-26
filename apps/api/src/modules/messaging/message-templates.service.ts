import {
  ConflictException,
  Injectable,
} from "@nestjs/common";
import type {
  CreateMessagingTemplatePayload,
  MessagingTemplatePayload,
} from "@operaclinic/shared";
import { MessagingChannel, Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { CreateMessageTemplateDto } from "./dto/create-message-template.dto";
import { MessagingAccessService } from "./messaging-access.service";

@Injectable()
export class MessageTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: MessagingAccessService,
    private readonly auditService: AuditService,
  ) {}

  async listTemplates(
    actor: AuthenticatedUser,
  ): Promise<MessagingTemplatePayload[]> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const templates = await this.prisma.messageTemplate.findMany({
      where: {
        tenantId,
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });

    return templates.map((template) => this.mapTemplate(template));
  }

  async createTemplate(
    actor: AuthenticatedUser,
    input: CreateMessageTemplateDto,
  ): Promise<MessagingTemplatePayload> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const channel = input.channel ?? MessagingChannel.WHATSAPP;
    const variables = this.normalizeVariables(input.variables);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const template = await tx.messageTemplate.create({
          data: {
            tenantId,
            channel,
            code: input.code.trim().toUpperCase(),
            name: input.name.trim(),
            bodyText: input.bodyText.trim(),
            variables,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.MESSAGING_TEMPLATE_CREATED,
            actor,
            tenantId,
            targetType: "message_template",
            targetId: template.id,
            metadata: {
              code: template.code,
              channel: template.channel,
            },
          },
          tx,
        );

        return template;
      });

      return this.mapTemplate(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("A template with this code already exists.");
      }

      throw error;
    }
  }

  private normalizeVariables(
    variables?: CreateMessagingTemplatePayload["variables"],
  ): string[] {
    return (
      variables
        ?.map((variable) => variable.trim())
        .filter((variable) => variable.length > 0) ?? []
    );
  }

  private mapTemplate(
    template: {
      id: string;
      tenantId: string;
      channel: MessagingChannel;
      code: string;
      name: string;
      bodyText: string;
      variables: Prisma.JsonValue | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
  ): MessagingTemplatePayload {
    return {
      id: template.id,
      tenantId: template.tenantId,
      channel: template.channel,
      code: template.code,
      name: template.name,
      bodyText: template.bodyText,
      variables: Array.isArray(template.variables)
        ? template.variables.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }
}
