import { ForbiddenException, Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";

@Injectable()
export class PatientsAccessService {
  resolveActiveTenantId(actor: AuthenticatedUser): string {
    if (actor.profile !== "clinic") {
      throw new ForbiddenException(
        "Patients endpoints are available only for clinic profiles.",
      );
    }

    if (!actor.activeTenantId) {
      throw new ForbiddenException("Active tenant context is required.");
    }

    return actor.activeTenantId;
  }
}
