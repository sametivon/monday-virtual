import { SetMetadata } from '@nestjs/common';
import type { PlanFeature } from '@mvs/shared';

export const FEATURE_KEY = 'requiresFeature';

/**
 * Gate a handler on the tenant's SUBSCRIPTION PLAN (billing), on top of RBAC:
 * a user needs both the permission (role) and the feature (plan). Reads the
 * plan fresh from the DB so webhook/downgrade changes enforce immediately —
 * these are low-frequency admin endpoints, one indexed lookup is fine.
 */
export const RequiresFeature = (feature: PlanFeature) => SetMetadata(FEATURE_KEY, feature);
