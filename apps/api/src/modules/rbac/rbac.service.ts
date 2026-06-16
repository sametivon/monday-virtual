import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_ROLE_PERMISSIONS,
  Permission,
  RoleKey,
  type MemberDTO,
  type RoleDTO,
} from '@mvs/shared';
import type { Prisma } from '@mvs/db';
import { PrismaService } from '../../common/prisma/prisma.service';

const VALID_PERMISSIONS = new Set<string>(Object.values(Permission));

/**
 * RBAC administration: list tenant members + roles, reassign a member's role,
 * and customize a role's permission set. Permission changes take effect on the
 * affected users' next request — auth re-reads role permissions on verify and
 * token refresh (see auth.service), so no session invalidation is needed.
 */
@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async listMembers(tenantId: string): Promise<MemberDTO[]> {
    const users = await this.prisma
      .forTenant(tenantId)
      .user.findMany({ where: { deletedAt: null }, include: { role: true }, orderBy: { name: 'asc' } });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roleKey: (u.role?.key ?? RoleKey.MEMBER) as RoleKey,
      roleId: u.roleId ?? null,
      status: u.status,
      lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
    }));
  }

  async listRoles(tenantId: string): Promise<RoleDTO[]> {
    const roles = await this.prisma.forTenant(tenantId).role.findMany({ orderBy: { key: 'asc' } });
    return roles.map((r) => ({
      id: r.id,
      key: r.key as RoleKey,
      name: r.name,
      permissions: (r.permissions as string[]) ?? [],
    }));
  }

  /** Reassign a member to a role (by key → the tenant's role row). */
  async assignRole(tenantId: string, userId: string, roleKey: RoleKey): Promise<MemberDTO> {
    const role = await this.prisma
      .forTenant(tenantId)
      .role.findFirst({ where: { key: roleKey } });
    if (!role) throw new NotFoundException(`Role ${roleKey} not found for tenant`);

    const user = await this.prisma.forTenant(tenantId).user.findFirst({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Guard the last admin: never let a tenant strip its final TENANT_ADMIN.
    if (user.roleId && roleKey !== RoleKey.TENANT_ADMIN) {
      await this.assertNotLastAdmin(tenantId, userId);
    }

    const updated = await this.prisma.raw.user.update({
      where: { id: user.id },
      data: { roleId: role.id },
      include: { role: true },
    });
    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      roleKey: (updated.role?.key ?? RoleKey.MEMBER) as RoleKey,
      roleId: updated.roleId ?? null,
      status: updated.status,
      lastSeenAt: updated.lastSeenAt ? updated.lastSeenAt.toISOString() : null,
    };
  }

  /** Replace a role's permission set (validated against the catalog). */
  async updateRolePermissions(
    tenantId: string,
    roleId: string,
    permissions: string[],
  ): Promise<RoleDTO> {
    const role = await this.prisma.forTenant(tenantId).role.findFirst({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    const unknown = permissions.filter((p) => !VALID_PERMISSIONS.has(p));
    if (unknown.length) throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}`);

    // The admin role must keep the keys needed to undo a mistake, or a tenant
    // could lock itself out of RBAC entirely.
    if (role.key === RoleKey.TENANT_ADMIN) {
      for (const required of [Permission.ROLE_MANAGE, Permission.USER_MANAGE]) {
        if (!permissions.includes(required)) {
          throw new BadRequestException(`TENANT_ADMIN cannot drop ${required}`);
        }
      }
    }

    const deduped = Array.from(new Set(permissions));
    const updated = await this.prisma.raw.role.update({
      where: { id: role.id },
      data: { permissions: deduped as Prisma.InputJsonValue },
    });
    return {
      id: updated.id,
      key: updated.key as RoleKey,
      name: updated.name,
      permissions: (updated.permissions as string[]) ?? [],
    };
  }

  /** Reset a role's permissions to the built-in defaults for its key. */
  async resetRole(tenantId: string, roleId: string): Promise<RoleDTO> {
    const role = await this.prisma.forTenant(tenantId).role.findFirst({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    return this.updateRolePermissions(tenantId, roleId, DEFAULT_ROLE_PERMISSIONS[role.key as RoleKey]);
  }

  /** Throw if `userId` is the only TENANT_ADMIN — protects against lockout. */
  private async assertNotLastAdmin(tenantId: string, userId: string): Promise<void> {
    const adminRole = await this.prisma
      .forTenant(tenantId)
      .role.findFirst({ where: { key: RoleKey.TENANT_ADMIN } });
    if (!adminRole) return;
    const admins = await this.prisma
      .forTenant(tenantId)
      .user.count({ where: { roleId: adminRole.id, deletedAt: null } });
    const isAdmin = await this.prisma
      .forTenant(tenantId)
      .user.findFirst({ where: { id: userId, roleId: adminRole.id } });
    if (isAdmin && admins <= 1) {
      throw new BadRequestException('Cannot remove the last tenant admin');
    }
  }
}
