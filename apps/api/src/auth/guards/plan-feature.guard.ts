import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PlanEntitlementsService } from "../../common/plan-entitlements/plan-entitlements.service";
import type { PlanFeatureKey } from "../../common/plan-entitlements/plan-entitlements.service";
import { PLAN_FEATURE_KEY } from "../decorators/require-plan-feature.decorator";
import { AuthenticatedRequest } from "../interfaces/authenticated-request.interface";

@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly planEntitlements: PlanEntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<PlanFeatureKey | undefined>(
      PLAN_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new UnauthorizedException("Authenticated user context is missing.");
    }

    if (!request.user.activeTenantId) {
      throw new ForbiddenException("Active tenant context is required.");
    }

    await this.planEntitlements.assertFeatureEnabled(
      request.user.activeTenantId,
      requiredFeature,
      request.user,
    );

    return true;
  }
}
