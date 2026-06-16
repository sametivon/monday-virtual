import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@mvs/shared';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Require one or more permissions on a route (all must be held). */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
