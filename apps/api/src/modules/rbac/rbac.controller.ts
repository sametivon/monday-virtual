import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  AssignRoleRequestSchema,
  Permission,
  UpdateRolePermissionsRequestSchema,
  type AssignRoleRequest,
  type MemberDTO,
  type RoleDTO,
  type UpdateRolePermissionsRequest,
} from '@mvs/shared';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { RbacService } from './rbac.service';

/**
 * RBAC admin endpoints. Listing + role assignment need USER_MANAGE; editing a
 * role's permission set needs ROLE_MANAGE (a stricter capability).
 */
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @RequirePermissions(Permission.USER_MANAGE)
  @Get('members')
  members(@CurrentUser() user: RequestUser): Promise<MemberDTO[]> {
    return this.rbac.listMembers(user.tenantId);
  }

  @RequirePermissions(Permission.USER_MANAGE)
  @Get('roles')
  roles(@CurrentUser() user: RequestUser): Promise<RoleDTO[]> {
    return this.rbac.listRoles(user.tenantId);
  }

  @RequirePermissions(Permission.USER_MANAGE)
  @Post('assign')
  assign(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBody(AssignRoleRequestSchema)) body: AssignRoleRequest,
  ): Promise<MemberDTO> {
    return this.rbac.assignRole(user.tenantId, body.userId, body.roleKey);
  }

  @RequirePermissions(Permission.ROLE_MANAGE)
  @Patch('roles/:roleId')
  updateRole(
    @CurrentUser() user: RequestUser,
    @Param('roleId') roleId: string,
    @Body(new ZodBody(UpdateRolePermissionsRequestSchema)) body: UpdateRolePermissionsRequest,
  ): Promise<RoleDTO> {
    return this.rbac.updateRolePermissions(user.tenantId, roleId, body.permissions);
  }

  @RequirePermissions(Permission.ROLE_MANAGE)
  @Post('roles/:roleId/reset')
  resetRole(@CurrentUser() user: RequestUser, @Param('roleId') roleId: string): Promise<RoleDTO> {
    return this.rbac.resetRole(user.tenantId, roleId);
  }
}
