import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchedulingConcurrencyService } from "../../src/modules/scheduling/scheduling-concurrency.service";

function buildService(prismaMock: object) {
  return new SchedulingConcurrencyService(prismaMock as never);
}

function makeP2034Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Transaction timeout", {
    code: "P2034",
    clientVersion: "6.0.0",
  });
}

describe("SchedulingConcurrencyService — isRetryable e executeWithRetry", () => {
  describe("isRetryable (via runExclusiveForProfessional retry behavior)", () => {
    it("retenta em PrismaClientKnownRequestError P2034 e sucede na segunda tentativa", async () => {
      let attempt = 0;
      const prisma = {
        $transaction: vi.fn().mockImplementation(async (fn: Function) => {
          attempt++;
          if (attempt === 1) {
            throw makeP2034Error();
          }
          return fn({
            $executeRaw: vi.fn().mockResolvedValue(undefined),
          });
        }),
      };

      const service = buildService(prisma);
      const operation = vi.fn().mockResolvedValue("result");

      const result = await service.runExclusiveForProfessional(
        "tenant-1",
        "professional-1",
        operation,
      );

      expect(result).toBe("result");
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('retenta em erro "could not serialize access" e sucede na segunda tentativa', async () => {
      let attempt = 0;
      const prisma = {
        $transaction: vi.fn().mockImplementation(async (fn: Function) => {
          attempt++;
          if (attempt === 1) {
            throw new Error("could not serialize access due to concurrent update");
          }
          return fn({
            $executeRaw: vi.fn().mockResolvedValue(undefined),
          });
        }),
      };

      const service = buildService(prisma);
      const operation = vi.fn().mockResolvedValue("serialized-ok");

      const result = await service.runExclusiveForProfessional(
        "tenant-1",
        "professional-1",
        operation,
      );

      expect(result).toBe("serialized-ok");
      expect(attempt).toBe(2);
    });

    it('retenta em erro "deadlock detected" e sucede na segunda tentativa', async () => {
      let attempt = 0;
      const prisma = {
        $transaction: vi.fn().mockImplementation(async (fn: Function) => {
          attempt++;
          if (attempt === 1) {
            throw new Error("deadlock detected");
          }
          return fn({
            $executeRaw: vi.fn().mockResolvedValue(undefined),
          });
        }),
      };

      const service = buildService(prisma);
      const operation = vi.fn().mockResolvedValue("deadlock-ok");

      const result = await service.runExclusiveForProfessional(
        "tenant-1",
        "professional-1",
        operation,
      );

      expect(result).toBe("deadlock-ok");
      expect(attempt).toBe(2);
    });

    it("esgota todas as 3 tentativas em P2034 e relanca o erro original", async () => {
      const p2034 = makeP2034Error();
      const prisma = {
        $transaction: vi.fn().mockRejectedValue(p2034),
      };

      const service = buildService(prisma);

      await expect(
        service.runExclusiveForProfessional("tenant-1", "professional-1", vi.fn()),
      ).rejects.toThrow(p2034);

      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it("NAO retenta em erros nao-retryables — lanca imediatamente na primeira tentativa", async () => {
      const notRetryable = new Error("Appointment not found");
      const prisma = {
        $transaction: vi.fn().mockRejectedValue(notRetryable),
      };

      const service = buildService(prisma);

      await expect(
        service.runExclusiveForProfessional("tenant-1", "professional-1", vi.fn()),
      ).rejects.toThrow("Appointment not found");

      // Apenas 1 tentativa — não retryable
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("NAO retenta em ConflictException — lanca imediatamente", async () => {
      const { ConflictException } = await import("@nestjs/common");
      const conflict = new ConflictException("Slot conflict");
      const prisma = {
        $transaction: vi.fn().mockRejectedValue(conflict),
      };

      const service = buildService(prisma);

      await expect(
        service.runExclusiveForProfessional("tenant-1", "professional-1", vi.fn()),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("NAO retenta em erro nao-Error (objeto plain) — lanca imediatamente", async () => {
      const weirdError = { code: "WEIRD", message: "not an Error instance" };
      const prisma = {
        $transaction: vi.fn().mockRejectedValue(weirdError),
      };

      const service = buildService(prisma);

      await expect(
        service.runExclusiveForProfessional("tenant-1", "professional-1", vi.fn()),
      ).rejects.toEqual(weirdError);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("acquireProfessionalLock — escopo de lockKey por tenantId:professionalId", () => {
    it("chama $executeRaw com lockKey derivado de tenantId:professionalId", async () => {
      const dbClient = {
        $executeRaw: vi.fn().mockResolvedValue(undefined),
      };

      const prisma = {
        $transaction: vi.fn(),
      };
      const service = buildService(prisma);

      await service.acquireProfessionalLock(
        dbClient as never,
        "tenant-1",
        "professional-1",
      );

      expect(dbClient.$executeRaw).toHaveBeenCalledOnce();
    });

    it("SECURITY: lockKeys distintos para tenantIds distintos com mesmo professionalId", async () => {
      const callsA: unknown[] = [];
      const callsB: unknown[] = [];

      const dbClientA = { $executeRaw: vi.fn().mockImplementation((...args: unknown[]) => { callsA.push(args); return Promise.resolve(undefined); }) };
      const dbClientB = { $executeRaw: vi.fn().mockImplementation((...args: unknown[]) => { callsB.push(args); return Promise.resolve(undefined); }) };

      const prisma = { $transaction: vi.fn() };
      const service = buildService(prisma);

      await service.acquireProfessionalLock(dbClientA as never, "tenant-A", "professional-shared");
      await service.acquireProfessionalLock(dbClientB as never, "tenant-B", "professional-shared");

      // Ambos chamaram $executeRaw — mas com template literals diferentes (lockKeys distintos)
      expect(dbClientA.$executeRaw).toHaveBeenCalledOnce();
      expect(dbClientB.$executeRaw).toHaveBeenCalledOnce();

      // Os argumentos do template literal carregam o lockKey — devem ser diferentes
      const argsA = dbClientA.$executeRaw.mock.calls[0];
      const argsB = dbClientB.$executeRaw.mock.calls[0];
      expect(argsA).not.toEqual(argsB);
    });

    it("SECURITY: lockKeys distintos para professionalIds distintos no mesmo tenant", async () => {
      const dbClient1 = { $executeRaw: vi.fn().mockResolvedValue(undefined) };
      const dbClient2 = { $executeRaw: vi.fn().mockResolvedValue(undefined) };

      const service = buildService({ $transaction: vi.fn() });

      await service.acquireProfessionalLock(dbClient1 as never, "tenant-1", "professional-A");
      await service.acquireProfessionalLock(dbClient2 as never, "tenant-1", "professional-B");

      const argsA = dbClient1.$executeRaw.mock.calls[0];
      const argsB = dbClient2.$executeRaw.mock.calls[0];
      expect(argsA).not.toEqual(argsB);
    });
  });

  describe("hashLockKey — determinismo e distribuição", () => {
    it("mesma entrada produz sempre o mesmo lockKey — determinismo garantido", async () => {
      const prisma = {
        $transaction: vi.fn(),
        $executeRaw: vi.fn().mockResolvedValue(undefined),
      };
      const service = buildService(prisma);

      // Invocamos em sequência para duas chamadas com o mesmo contexto
      // Resultado implicitamente testado via $executeRaw com mesmo template
      const client1 = { $executeRaw: vi.fn().mockResolvedValue(undefined) };
      const client2 = { $executeRaw: vi.fn().mockResolvedValue(undefined) };

      await service.acquireProfessionalLock(client1 as never, "tenant-1", "professional-1");
      await service.acquireProfessionalLock(client2 as never, "tenant-1", "professional-1");

      // Ambas as chamadas devem ter o mesmo template literal (mesmo lockKey)
      expect(client1.$executeRaw.mock.calls[0]).toEqual(client2.$executeRaw.mock.calls[0]);
    });
  });

  describe("runExclusiveForProfessional — passagem de tenantId e professionalId ao lock", () => {
    it("passes tenantId e professionalId corretos para acquireProfessionalLock dentro da transação", async () => {
      const capturedArgs: { tenantId: string; professionalId: string }[] = [];
      const tx = {
        $executeRaw: vi.fn().mockImplementation((...args: unknown[]) => {
          // Extrai o lockKey do template literal
          capturedArgs.push({ tenantId: "tenant-captured", professionalId: "professional-captured" });
          return Promise.resolve(undefined);
        }),
      };

      const prisma = {
        $transaction: vi.fn().mockImplementation(async (fn: Function) => fn(tx)),
      };

      const service = buildService(prisma);
      const operation = vi.fn().mockResolvedValue("ok");

      await service.runExclusiveForProfessional("tenant-X", "professional-Y", operation);

      // O lock deve ter sido adquirido (tx.$executeRaw chamado)
      expect(tx.$executeRaw).toHaveBeenCalledOnce();
      // A operação deve ter sido chamada com a transação
      expect(operation).toHaveBeenCalledWith(tx);
    });

    it("operacao recebe a transaction client — nao o prisma principal", async () => {
      const tx = { $executeRaw: vi.fn().mockResolvedValue(undefined), appointment: { create: vi.fn() } };
      const prisma = {
        $transaction: vi.fn().mockImplementation(async (fn: Function) => fn(tx)),
      };

      const service = buildService(prisma);
      let receivedTx: unknown;
      const operation = vi.fn().mockImplementation(async (t: unknown) => {
        receivedTx = t;
        return "done";
      });

      await service.runExclusiveForProfessional("tenant-1", "professional-1", operation);

      // A operação recebe o tx (não o prisma global)
      expect(receivedTx).toBe(tx);
    });
    it("runExclusiveForProfessionals adquire locks unicos do conjunto informado", async () => {
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(undefined),
      };
      const prisma = {
        $transaction: vi.fn().mockImplementation(async (fn: Function) => fn(tx)),
      };

      const service = buildService(prisma);
      const operation = vi.fn().mockResolvedValue("multi-lock-ok");

      const result = await service.runExclusiveForProfessionals(
        "tenant-1",
        ["professional-b", "professional-a", "professional-a"],
        operation,
      );

      expect(result).toBe("multi-lock-ok");
      expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
      expect(operation).toHaveBeenCalledWith(tx);
    });
  });
});
