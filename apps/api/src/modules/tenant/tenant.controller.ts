import { Body, Controller, Patch } from '@nestjs/common';
import {
  BrandingPaletteSchema,
  BrandingUpdateSchema,
  Permission,
  PlanFeature,
  type BrandingDTO,
  type BrandingUpdate,
} from '@mvs/shared';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { RequiresFeature } from '../../common/plan/feature.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('tenant')
export class TenantController {
  constructor(private readonly prisma: PrismaService) {}

  /** White-label: update the tenant's product name / logo / palette. */
  @RequiresFeature(PlanFeature.BRANDING)
  @RequirePermissions(Permission.BRANDING_EDIT)
  @Patch('branding')
  async updateBranding(
    @CurrentUser() principal: RequestUser,
    @Body(new ZodBody(BrandingUpdateSchema)) update: BrandingUpdate,
  ): Promise<BrandingDTO> {
    const existing = await this.prisma
      .forTenant(principal.tenantId)
      .branding.findFirst({ where: { tenantId: principal.tenantId } });

    const palette = BrandingPaletteSchema.parse({
      ...((existing?.palette as object) ?? {}),
      ...(update.palette ?? {}),
    });
    const data = {
      productName: update.productName ?? existing?.productName ?? 'Virtual Spaces',
      logoUrl: update.logoUrl === undefined ? existing?.logoUrl ?? null : update.logoUrl,
      palette,
    };

    const saved = await this.prisma.raw.branding.upsert({
      where: { tenantId: principal.tenantId },
      update: data,
      create: { tenantId: principal.tenantId, ...data },
    });

    return {
      productName: saved.productName,
      logoUrl: saved.logoUrl,
      palette,
      theme: (saved.theme as Record<string, unknown> | null) ?? null,
    };
  }
}
