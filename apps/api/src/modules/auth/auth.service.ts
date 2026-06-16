import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AppJwtPayload,
  AuthTokens,
  DEFAULT_ROLE_PERMISSIONS,
  RoleKey,
  type Permission,
} from '@mvs/shared';
import { defaultObjectsFor, presetFor, SCENE_REV } from '@mvs/config';
import { SpaceType } from '@mvs/shared';
import type { Prisma } from '@mvs/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Env } from '../../config/env';
import type { MondayIdentity } from './monday-auth.service';

/**
 * Turns a verified Monday identity into an app session: provisions the Tenant
 * (by mondayAccountId) and User (by mondayUserId) on first sight, ensures the
 * default Role set + a starter Lobby exist, then mints JWTs.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async loginWithMondayIdentity(identity: MondayIdentity): Promise<AuthTokens> {
    const tenant = await this.ensureTenant(identity.mondayAccountId);
    await this.ensureDefaultRoles(tenant.id);
    await this.ensureStarterSpaces(tenant.id);

    const memberRole = await this.prisma
      .forTenant(tenant.id)
      .role.findFirstOrThrow({ where: { key: RoleKey.MEMBER } });

    let user = await this.prisma.forTenant(tenant.id).user.upsert({
      where: { tenantId_mondayUserId: { tenantId: tenant.id, mondayUserId: identity.mondayUserId } },
      update: { name: identity.name, email: identity.email },
      create: {
        tenantId: tenant.id,
        mondayUserId: identity.mondayUserId,
        email: identity.email,
        name: identity.name,
        roleId: memberRole.id,
        avatarConfig: { modelId: 'default', accessories: [] },
      },
      include: { role: true },
    });
    user = await this.ensureTenantHasAdmin(tenant.id, user);

    const roleKey = (user.role?.key ?? RoleKey.MEMBER) as RoleKey;
    const permissions = (user.role?.permissions as Permission[]) ?? DEFAULT_ROLE_PERMISSIONS[roleKey];

    return this.issueTokens({
      sub: user.id,
      tenantId: tenant.id,
      roleKey,
      permissions,
      name: user.name,
    });
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.jwt.verifyAsync<AppJwtPayload>(refreshToken, {
      secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
    });
    // Re-read current role/permissions so revoked privileges take effect.
    const user = await this.prisma
      .forTenant(payload.tenantId)
      .user.findFirstOrThrow({ where: { id: payload.sub }, include: { role: true } });
    const roleKey = (user.role?.key ?? RoleKey.MEMBER) as RoleKey;
    const permissions = (user.role?.permissions as Permission[]) ?? DEFAULT_ROLE_PERMISSIONS[roleKey];
    return this.issueTokens({
      sub: user.id,
      tenantId: payload.tenantId,
      roleKey,
      permissions,
      name: user.name,
    });
  }

  private async issueTokens(payload: AppJwtPayload): Promise<AuthTokens> {
    const accessTtl = this.config.get('JWT_ACCESS_TTL', { infer: true });
    const refreshTtl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_SECRET', { infer: true }),
      expiresIn: accessTtl,
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: payload.sub, tenantId: payload.tenantId, roleKey: payload.roleKey, permissions: [], name: payload.name },
      { secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }), expiresIn: refreshTtl },
    );
    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  private async ensureTenant(mondayAccountId: string) {
    const existing = await this.prisma.raw.tenant.findUnique({ where: { mondayAccountId } });
    if (existing) return existing;
    const slug = await this.uniqueSlug(`acct-${mondayAccountId}`);
    return this.prisma.raw.tenant.create({
      data: {
        slug,
        name: `Account ${mondayAccountId}`,
        mondayAccountId,
        status: 'TRIAL',
        branding: { create: { productName: 'Virtual Spaces', palette: {} } },
      },
    });
  }

  private async ensureDefaultRoles(tenantId: string) {
    const count = await this.prisma.forTenant(tenantId).role.count();
    if (count >= Object.keys(RoleKey).length) return;
    for (const key of Object.values(RoleKey)) {
      await this.prisma.raw.role.upsert({
        where: { tenantId_key: { tenantId, key } },
        update: {},
        create: { tenantId, key, name: key, permissions: DEFAULT_ROLE_PERMISSIONS[key] },
      });
    }
  }

  /**
   * Every tenant must have at least one admin; the first user to open the
   * app (normally the person who installed it) gets TENANT_ADMIN.
   */
  private async ensureTenantHasAdmin<T extends { id: string }>(tenantId: string, user: T): Promise<T> {
    const adminRole = await this.prisma
      .forTenant(tenantId)
      .role.findFirstOrThrow({ where: { key: RoleKey.TENANT_ADMIN } });
    const adminCount = await this.prisma
      .forTenant(tenantId)
      .user.count({ where: { roleId: adminRole.id } });
    if (adminCount > 0) return user;
    return (await this.prisma.raw.user.update({
      where: { id: user.id },
      data: { roleId: adminRole.id },
      include: { role: true },
    })) as unknown as T;
  }

  /** Starter worlds: Lobby + Auditorium, with their portals bound together. */
  private async ensureStarterSpaces(tenantId: string) {
    const lobby = await this.ensureSpace(tenantId, SpaceType.LOBBY, 'Lobby', 'lobby');
    const auditorium = await this.ensureSpace(
      tenantId,
      SpaceType.AUDITORIUM,
      'Auditorium',
      'auditorium',
    );
    await this.bindPortals(tenantId, lobby.id, auditorium.id);
    await this.bindPortals(tenantId, auditorium.id, lobby.id);
  }

  private async ensureSpace(tenantId: string, type: SpaceType, name: string, slug: string) {
    const sceneConfig = { ...presetFor(type), rev: SCENE_REV };
    const existing = await this.prisma.forTenant(tenantId).space.findFirst({ where: { slug } });
    let space = existing;

    if (!space) {
      space = await this.prisma.raw.space.create({
        data: { tenantId, type, name, slug, isPublished: true, sceneConfig },
      });
    } else if (((existing!.sceneConfig as { rev?: number } | null)?.rev ?? 0) < SCENE_REV) {
      // Designed presets evolved — refresh the scene. The auditorium's
      // objects are reseeded too (they carry no user-authored config);
      // lobby objects are preserved (pinned boards live in their config).
      space = await this.prisma.raw.space.update({
        where: { id: existing!.id },
        data: { sceneConfig },
      });
      if (type === SpaceType.AUDITORIUM) {
        await this.prisma.raw.sceneObject.deleteMany({
          where: { tenantId, spaceId: space.id },
        });
      }
    }

    await this.ensureSpaceObjects(tenantId, space.id, type);
    return space;
  }

  /** Populate the designed starter objects once (also backfills empty spaces). */
  private async ensureSpaceObjects(tenantId: string, spaceId: string, type: SpaceType) {
    const count = await this.prisma
      .forTenant(tenantId)
      .sceneObject.count({ where: { spaceId } });
    if (count > 0) return;
    const objects = defaultObjectsFor(type);
    if (objects.length === 0) return;
    await this.prisma.raw.sceneObject.createMany({
      data: objects.map((o) => ({
        tenantId,
        spaceId,
        type: o.type,
        transform: o.transform as Prisma.InputJsonValue,
        config: o.config as Prisma.InputJsonValue,
        interaction: (o.interaction ?? undefined) as Prisma.InputJsonValue | undefined,
      })),
    });
  }

  /** Point a space's unbound portals (empty targetSpaceId) at the target space. */
  private async bindPortals(tenantId: string, spaceId: string, targetSpaceId: string) {
    const portals = await this.prisma
      .forTenant(tenantId)
      .sceneObject.findMany({ where: { spaceId, type: 'PORTAL' } });
    for (const portal of portals) {
      const config = (portal.config ?? {}) as { targetSpaceId?: string; label?: string };
      if (config.targetSpaceId) continue;
      await this.prisma.raw.sceneObject.update({
        where: { id: portal.id },
        data: {
          config: {
            ...config,
            targetSpaceId,
            // Drop the placeholder label from older seeds.
            label: config.label?.replace(' · soon', ''),
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async uniqueSlug(base: string): Promise<string> {
    const slug = base.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const clash = await this.prisma.raw.tenant.findUnique({ where: { slug } });
    return clash ? `${slug}-${Math.floor(Date.now() % 100000)}` : slug;
  }
}
