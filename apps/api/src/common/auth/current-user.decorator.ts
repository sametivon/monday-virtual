import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AppJwtPayload } from '@mvs/shared';

export interface RequestUser extends AppJwtPayload {
  tenantId: string;
}

/** Injects the authenticated principal (decoded JWT) into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as RequestUser;
  },
);
