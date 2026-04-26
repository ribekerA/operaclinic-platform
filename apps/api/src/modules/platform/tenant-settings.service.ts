import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaClient | PrismaService;

@Injectable()
export class TenantSettingsService {
  private static readonly DEFAULT_SETTINGS: Record<string, string> = {
    locale: "pt-BR",
    currency: "BRL",
  };

  constructor(private readonly prisma: PrismaService) {}

  buildInitialSettings(
    incoming?: Record<string, string>,
  ): Record<string, string> {
    const normalizedIncoming = this.normalizeSettings(incoming);

    return {
      ...TenantSettingsService.DEFAULT_SETTINGS,
      ...normalizedIncoming,
    };
  }

  normalizeSettings(incoming?: Record<string, string>): Record<string, string> {
    if (!incoming) {
      return {};
    }

    if (typeof incoming !== "object" || Array.isArray(incoming)) {
      throw new BadRequestException("settings must be an object map.");
    }

    const output: Record<string, string> = {};

    for (const [key, value] of Object.entries(incoming)) {
      const normalizedKey = key.trim();

      if (!normalizedKey) {
        throw new BadRequestException("settings keys cannot be empty.");
      }

      if (normalizedKey.length > 120) {
        throw new BadRequestException("settings keys must have at most 120 chars.");
      }

      if (typeof value !== "string") {
        throw new BadRequestException(`settings value for key '${normalizedKey}' must be a string.`);
      }

      output[normalizedKey] = value;
    }

    return output;
  }

  async upsertMany(
    tenantId: string,
    settings: Record<string, string>,
    dbClient?: DbClient,
  ): Promise<void> {
    const db = dbClient ?? this.prisma;

    for (const [key, value] of Object.entries(settings)) {
      await db.tenantSetting.upsert({
        where: {
          tenantId_key: {
            tenantId,
            key,
          },
        },
        create: {
          tenantId,
          key,
          value,
        },
        update: {
          value,
        },
      });
    }
  }

  toMap(
    settings: Array<{ key: string; value: string }>,
  ): Record<string, string> {
    return settings.reduce<Record<string, string>>((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});
  }
}
