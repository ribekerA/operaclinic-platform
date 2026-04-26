import { ForbiddenException, Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { SCHEDULING_ADMIN_ROLES } from "./scheduling.constants";

@Injectable()
export class SchedulingAccessService {
  resolveActiveTenantId(actor: AuthenticatedUser): string {
    if (actor.profile !== "clinic") {
      throw new ForbiddenException(
        "Scheduling endpoints are available only for clinic profiles.",
      );
    }

    if (!actor.activeTenantId) {
      throw new ForbiddenException("Active tenant context is required.");
    }

    return actor.activeTenantId;
  }

  ensureAdminAccess(actor: AuthenticatedUser): void {
    const hasAdminRole = actor.roles.some((role) =>
      SCHEDULING_ADMIN_ROLES.includes(role),
    );

    if (!hasAdminRole) {
      throw new ForbiddenException(
        "Only tenant admin and clinic manager can manage schedule setup.",
      );
    }
  }
}
