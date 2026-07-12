import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlanFeature } from '@mvs/shared';
import type { RequestUser } from '../auth/current-user.decorator';
import { FEATURE_KEY } from './feature.decorator';
import { PlanService } from './plan.service';

/** Enforces @RequiresFeature(...) against the tenant's subscription plan. */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly plans: PlanService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<PlanFeature | undefined>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const user = context.switchToHttp().getRequest().user as RequestUser | undefined;
    if (!user?.tenantId) return true; // public routes never carry the decorator anyway

    if (!(await this.plans.hasFeature(user.tenantId, feature))) {
      throw new ForbiddenException(
        `This feature isn't included in your plan — upgrade in monday.com to unlock it.`,
      );
    }
    return true;
  }
}
