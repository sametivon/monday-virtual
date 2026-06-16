import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  AvatarConfigSchema,
  BrandingPaletteSchema,
  DEFAULT_ROLE_PERMISSIONS,
  RoleKey,
  type AvatarConfig,
  type MeResponse,
  type Permission,
} from '@mvs/shared';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  /** Persist the user's avatar customization (model + accent color). */
  @Patch('avatar')
  async updateAvatar(
    @CurrentUser() principal: RequestUser,
    @Body(new ZodBody(AvatarConfigSchema)) config: AvatarConfig,
  ): Promise<AvatarConfig> {
    await this.prisma
      .forTenant(principal.tenantId)
      .user.update({ where: { id: principal.sub }, data: { avatarConfig: config } });
    return config;
  }

  /** Bootstrap payload after auth: user + tenant + branding + permissions. */
  @Get()
  async me(@CurrentUser() principal: RequestUser): Promise<MeResponse> {
    const db = this.prisma.forTenant(principal.tenantId);
    const [user, tenant] = await Promise.all([
      db.user.findFirstOrThrow({ where: { id: principal.sub }, include: { role: true } }),
      db.tenant.findFirstOrThrow({ where: { id: principal.tenantId }, include: { branding: true } }),
    ]);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        company: user.company,
        jobTitle: user.jobTitle,
        status: user.status,
        roleKey: (user.role?.key ?? RoleKey.MEMBER) as RoleKey,
        avatarConfig: AvatarConfigSchema.parse(user.avatarConfig ?? {}),
      },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        branding: {
          productName: tenant.branding?.productName ?? 'Virtual Spaces',
          logoUrl: tenant.branding?.logoUrl ?? null,
          palette: BrandingPaletteSchema.parse(tenant.branding?.palette ?? {}),
          theme: (tenant.branding?.theme as Record<string, unknown> | null) ?? null,
        },
      },
      // Resolve permissions from the user's CURRENT role, not the JWT — so an
      // admin's role/permission change is reflected on the member's next /me
      // without forcing a re-login (the access JWT still carries the old set).
      permissions:
        (user.role?.permissions as Permission[] | undefined) ??
        DEFAULT_ROLE_PERMISSIONS[(user.role?.key ?? RoleKey.MEMBER) as RoleKey],
    };
  }
}
