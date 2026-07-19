import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURES_KEY } from '../decorators/require-feature.decorator';
import { PlanFeatureKey } from '../constants/plan-features.constant';
import { PlanLimitsService } from '../../modules/billing/plan-limits.service';

/**
 * Rejects a request with PLAN_FEATURE_LOCKED (403) unless the caller's active
 * organization is on a tier that unlocks every feature declared via
 * @RequireFeature(...). No-ops on routes with no feature requirement.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PlanFeatureKey[]>(FEATURES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const organizationId: string | undefined = request.headers['x-organization-id'];
    if (!organizationId) {
      throw new ForbiddenException('x-organization-id header is required for this route');
    }

    for (const feature of required) {
      const unlocked = await this.planLimits.hasFeature(organizationId, feature);
      if (!unlocked) {
        throw new ForbiddenException({
          error: 'PLAN_FEATURE_LOCKED',
          message: `Your plan does not include "${feature}". Upgrade to unlock it.`,
        });
      }
    }
    return true;
  }
}
