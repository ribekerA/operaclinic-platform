import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaClient | PrismaService;

export interface AudioSettings {
  enabled: boolean;
  maxDurationSeconds: number;
  minConfidence: number;
}

const AUDIO_SETTING_KEYS = {
  enabled: "audio.enabled",
  maxDurationSeconds: "audio.maxDurationSeconds",
  minConfidence: "audio.minConfidence",
} as const;

@Injectable()
export class TenantSettingsService {
  private static readonly DEFAULT_SETTINGS: Record<string, string> = {
    locale: "pt-BR",
    currency: "BRL",
  };

  // Defaults resolvidos em código, não seedados no banco por tenant — um tenant
  // sem override em `tenant_settings` recebe estes valores. Alterar aqui muda
  // o comportamento padrão de todos os tenants sem precisar de migração/backfill.
  private static readonly AUDIO_SETTING_DEFAULTS: AudioSettings = {
    enabled: true,
    maxDurationSeconds: 120,
    minConfidence: 0.6,
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve as configurações de áudio do tenant: default global do código,
   * sobrescrito por qualquer chave `audio.*` presente em `tenant_settings`
   * (gravada via o endpoint genérico de update de tenant, que já aceita
   * `settings` arbitrário).
   */
  async getAudioSettings(
    tenantId: string,
    dbClient?: DbClient,
  ): Promise<AudioSettings> {
    const db = dbClient ?? this.prisma;

    const overrides = await db.tenantSetting.findMany({
      where: {
        tenantId,
        key: { in: Object.values(AUDIO_SETTING_KEYS) },
      },
      select: { key: true, value: true },
    });

    const overrideMap = this.toMap(overrides);
    const defaults = TenantSettingsService.AUDIO_SETTING_DEFAULTS;

    return {
      enabled: this.parseBooleanSetting(
        overrideMap[AUDIO_SETTING_KEYS.enabled],
        defaults.enabled,
      ),
      maxDurationSeconds: this.parseIntSetting(
        overrideMap[AUDIO_SETTING_KEYS.maxDurationSeconds],
        defaults.maxDurationSeconds,
      ),
      minConfidence: this.parseFloatSetting(
        overrideMap[AUDIO_SETTING_KEYS.minConfidence],
        defaults.minConfidence,
      ),
    };
  }

  private parseBooleanSetting(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    return value === "true";
  }

  private parseIntSetting(value: string | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private parseFloatSetting(value: string | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

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
