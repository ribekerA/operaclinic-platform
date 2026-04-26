import { ForbiddenException, Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { CLINIC_STRUCTURE_ADMIN_ROLES } from "./clinic-structure.constants";

@Injectable()
export class ClinicStructureAccessService {
  resolveActiveTenantId(actor: AuthenticatedUser): string {
    if (actor.profile !== "clinic") {
      throw new ForbiddenException(
        "Clinic structure endpoints are available only for clinic profiles.",
      );
    }

    if (!actor.activeTenantId) {
      throw new ForbiddenException("Active tenant context is required.");
    }

    return actor.activeTenantId;
  }

  ensureAdminAccess(actor: AuthenticatedUser): void {
    const hasAdminRole = actor.roles.some((role) =>
      CLINIC_STRUCTURE_ADMIN_ROLES.includes(role),
    );

    if (!hasAdminRole) {
      throw new ForbiddenException(
        "Only clinic admin and clinic manager can change clinic structure.",
      );
    }
  }

  canWrite(actor: AuthenticatedUser): boolean {
    return actor.roles.some((role) =>
      CLINIC_STRUCTURE_ADMIN_ROLES.includes(role),
    );
  }
}
