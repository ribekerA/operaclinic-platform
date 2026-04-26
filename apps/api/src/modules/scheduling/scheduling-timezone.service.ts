import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, PrismaClient, ScheduleDayOfWeek } from "@prisma/client";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { PrismaService } from "../../database/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaClient | PrismaService;

export interface TenantDayContext {
  timezone: string;
  date: string;
  dateValue: Date;
  weekday: ScheduleDayOfWeek;
  dayStartUtc: Date;
  dayEndUtcInclusive: Date;
  dayEndUtcExclusive: Date;
}

@Injectable()
export class SchedulingTimezoneService {
  private static readonly ISO_INSTANT_WITH_OFFSET =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

  constructor(private readonly prisma: PrismaService) {}

  async getTenantTimezone(
    tenantId: string,
    dbClient?: DbClient,
  ): Promise<string> {
    const db = dbClient ?? this.prisma;

    const tenant = await db.tenant.findUnique({
      where: {
        id: tenantId,
      },
      select: {
        timezone: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException("Tenant not found.");
    }

    const timezone = tenant.timezone?.trim();

    if (!timezone) {
      throw new BadRequestException("Tenant timezone is not configured.");
    }

    return timezone;
  }

  async getDayContextByDateInput(
    tenantId: string,
    rawDate: string,
    dbClient?: DbClient,
  ): Promise<TenantDayContext> {
    const timezone = await this.getTenantTimezone(tenantId, dbClient);
    const date = this.normalizeDateOnly(rawDate);

    return this.buildDayContext(date, timezone);
  }

  async getDayContextByInstant(
    tenantId: string,
    instant: Date,
    dbClient?: DbClient,
  ): Promise<TenantDayContext> {
    if (Number.isNaN(instant.getTime())) {
      throw new BadRequestException("Invalid datetime.");
    }

    const timezone = await this.getTenantTimezone(tenantId, dbClient);
    const date = this.getTenantDateKey(instant, timezone);

    return this.buildDayContext(date, timezone);
  }

  async getCurrentInstant(dbClient?: DbClient): Promise<Date> {
    const db = dbClient ?? this.prisma;
    const rows = await db.$queryRaw<Array<{ current_instant: Date }>>`
      SELECT CURRENT_TIMESTAMP AS current_instant
    `;
    const currentInstant = rows[0]?.current_instant;

    if (!(currentInstant instanceof Date) || Number.isNaN(currentInstant.getTime())) {
      throw new BadRequestException("Unable to resolve current database time.");
    }

    return currentInstant;
  }

  getTenantDateKey(instant: Date, timezone: string): string {
    return formatInTimeZone(instant, timezone, "yyyy-MM-dd");
  }

  buildDayContext(date: string, timezone: string): TenantDayContext {
    const normalizedDate = this.normalizeDateOnly(date);
    const nextDate = this.addDays(normalizedDate, 1);
    const dayStartUtc = fromZonedTime(`${normalizedDate}T00:00:00`, timezone);
    const dayEndUtcExclusive = fromZonedTime(`${nextDate}T00:00:00`, timezone);

    return {
      timezone,
      date: normalizedDate,
      dateValue: this.toDateOnlyValue(normalizedDate),
      weekday: this.resolveDayOfWeek(normalizedDate),
      dayStartUtc,
      dayEndUtcInclusive: new Date(dayEndUtcExclusive.getTime() - 1),
      dayEndUtcExclusive,
    };
  }

  combineDateAndTime(date: string, time: Date, timezone: string): Date {
    const timePortion = [
      String(time.getUTCHours()).padStart(2, "0"),
      String(time.getUTCMinutes()).padStart(2, "0"),
      String(time.getUTCSeconds()).padStart(2, "0"),
    ].join(":");

    return fromZonedTime(`${this.normalizeDateOnly(date)}T${timePortion}`, timezone);
  }

  parseIsoInstant(rawValue: string, fieldName: string): Date {
    const normalized = rawValue?.trim();

    if (
      !normalized ||
      !SchedulingTimezoneService.ISO_INSTANT_WITH_OFFSET.test(normalized)
    ) {
      throw new BadRequestException(
        `${fieldName} must be a valid ISO datetime with an explicit timezone offset.`,
      );
    }

    const parsed = new Date(normalized);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(
        `${fieldName} must be a valid ISO datetime with an explicit timezone offset.`,
      );
    }

    return parsed;
  }

  toDateOnlyValue(date: string): Date {
    const parsed = new Date(`${this.normalizeDateOnly(date)}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("Invalid date.");
    }

    return parsed;
  }

  normalizeDateOnly(rawDate: string): string {
    const normalized = rawDate?.trim();

    if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException("date must be in YYYY-MM-DD format.");
    }

    return normalized;
  }

  private resolveDayOfWeek(date: string): ScheduleDayOfWeek {
    switch (this.toDateOnlyValue(date).getUTCDay()) {
      case 0:
        return ScheduleDayOfWeek.SUNDAY;
      case 1:
        return ScheduleDayOfWeek.MONDAY;
      case 2:
        return ScheduleDayOfWeek.TUESDAY;
      case 3:
        return ScheduleDayOfWeek.WEDNESDAY;
      case 4:
        return ScheduleDayOfWeek.THURSDAY;
      case 5:
        return ScheduleDayOfWeek.FRIDAY;
      case 6:
        return ScheduleDayOfWeek.SATURDAY;
      default:
        throw new BadRequestException("Unable to resolve weekday.");
    }
  }

  private addDays(date: string, days: number): string {
    const base = this.toDateOnlyValue(date);
    const next = new Date(base.getTime() + days * 86400000);

    return formatInTimeZone(next, "UTC", "yyyy-MM-dd");
  }
}
