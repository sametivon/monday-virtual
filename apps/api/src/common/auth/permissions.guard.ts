import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission } from '@mvs/shared';
import { PERMISSIONS_KEY } from './permissions.decorator';
import type { RequestUser } from './current-user.decorator';

/**
 * Enforces @RequirePermissions(...) against the principal's granted permission
 * set (resolved from their Role at login and carried in the JWT).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as RequestUser | undefined;
    const granted = user?.permissions;
    const ok = required.every((p) => hasPermission(granted, p));
    if (!ok) {
      throw new ForbiddenException(`Missing required permission(s): ${required.join(', ')}`);
    }
    return true;
  }
}
