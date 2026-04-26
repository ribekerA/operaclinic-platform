import { Prisma } from "@prisma/client";

const OCCUPANCY_CONSTRAINT_NAMES = [
  "ex_appointments_professional_occupancy",
  "ex_slot_holds_professional_occupancy",
] as const;

function normalizeTargets(target: unknown): string[] {
  if (Array.isArray(target)) {
    return target
      .map((item) => String(item))
      .filter((item) => item.length > 0);
  }

  if (typeof target === "string" && target.length > 0) {
    return [target];
  }

  return [];
}

function isConstraintMatch(value: string, expected: string): boolean {
  return value === expected || value.includes(expected);
}

export function isPrismaUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function prismaErrorTargetsContain(
  error: Prisma.PrismaClientKnownRequestError,
  expected: string,
): boolean {
  return normalizeTargets(error.meta?.target).some((target) =>
    isConstraintMatch(target, expected),
  );
}

export function isSchedulingOccupancyConflictError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2004"
  ) {
    if (
      OCCUPANCY_CONSTRAINT_NAMES.some((constraintName) =>
        prismaErrorTargetsContain(error, constraintName),
      )
    ) {
      return true;
    }
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return OCCUPANCY_CONSTRAINT_NAMES.some((constraintName) =>
    new RegExp(`(?:23P01|exclusion constraint|${constraintName})`, "i").test(
      error.message,
    ),
  );
}
