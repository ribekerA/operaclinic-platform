import { Injectable, Logger } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

type TxClient = Prisma.TransactionClient | PrismaClient | PrismaService;

const SCHEDULING_TRANSACTION_MAX_WAIT_MS = 10_000;
const SCHEDULING_TRANSACTION_TIMEOUT_MS = 15_000;

@Injectable()
export class SchedulingConcurrencyService {
  private readonly logger = new Logger(SchedulingConcurrencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runExclusiveForProfessional<T>(
    tenantId: string,
    professionalId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.runExclusiveForProfessionals(
      tenantId,
      [professionalId],
      operation,
    );
  }

  async runExclusiveForProfessionals<T>(
    tenantId: string,
    professionalIds: string[],
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const lockTargets = [...new Set(professionalIds.map((id) => id.trim()).filter(Boolean))].sort(
      (left, right) => left.localeCompare(right),
    );

    if (!lockTargets.length) {
      throw new Error("professionalIds must contain at least one value.");
    }

    return this.executeWithRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          for (const lockTarget of lockTargets) {
            await this.acquireProfessionalLock(tx, tenantId, lockTarget);
          }

          return operation(tx);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: SCHEDULING_TRANSACTION_MAX_WAIT_MS,
          timeout: SCHEDULING_TRANSACTION_TIMEOUT_MS,
        },
      ),
    );
  }

  async acquireProfessionalLock(
    dbClient: TxClient,
    tenantId: string,
    professionalId: string,
  ): Promise<void> {
    const lockKey = this.hashLockKey(`${tenantId}:${professionalId}`);

    await dbClient.$executeRaw`
      SELECT pg_advisory_xact_lock(${lockKey});
    `;
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (!this.isRetryable(error) || attempt === maxAttempts) {
          throw error;
        }

        this.logger.warn(
          `Retrying scheduling transaction attempt=${attempt} reason=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    throw lastError;
  }

  private isRetryable(error: unknown): boolean {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return true;
    }

    if (!(error instanceof Error)) {
      return false;
    }

    return /could not serialize access|deadlock detected/i.test(error.message);
  }

  private hashLockKey(value: string): bigint {
    let hash = 1469598103934665603n;

    for (let index = 0; index < value.length; index += 1) {
      hash ^= BigInt(value.charCodeAt(index));
      hash *= 1099511628211n;
      hash &= 0xffffffffffffffffn;
    }

    return BigInt.asIntN(64, hash);
  }
}
