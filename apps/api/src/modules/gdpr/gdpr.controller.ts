import { BadRequestException, Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { CsvResponse } from '../../common/http/csv-response';
import {
  GdprEraseRequestSchema,
  Permission,
  type GdprErasureResult,
  type GdprEraseRequest,
  type GdprExport,
} from '@mvs/shared';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { GdprService } from './gdpr.service';

/**
 * GDPR data-subject endpoints (USER_MANAGE). Export a user's data (access /
 * portability) and erase a user (right to be forgotten). Both are tenant-scoped
 * to the admin's own tenant.
 */
@Controller('gdpr')
export class GdprController {
  constructor(private readonly gdpr: GdprService) {}

  /** Personal-data export as JSON (inline). */
  @RequirePermissions(Permission.USER_MANAGE)
  @Get('users/:id/export')
  export(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<GdprExport> {
    return this.gdpr.exportUser(user.tenantId, id);
  }

  /** Same export as a downloadable JSON file. */
  @RequirePermissions(Permission.USER_MANAGE)
  @Get('users/:id/export.json')
  async exportDownload(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Res() res: CsvResponse,
  ): Promise<void> {
    const data = await this.gdpr.exportUser(user.tenantId, id);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="gdpr-export-${id}.json"`);
    res.send(JSON.stringify(data, null, 2));
  }

  /**
   * Erase a user. The body must echo the target id in `confirm` — a deliberate
   * guard so the irreversible scrub can't fire from a stray request.
   */
  @RequirePermissions(Permission.USER_MANAGE)
  @Post('users/:id/erase')
  erase(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodBody(GdprEraseRequestSchema)) body: GdprEraseRequest,
  ): Promise<GdprErasureResult> {
    if (body.confirm !== id) {
      throw new BadRequestException('Confirmation does not match the target user id');
    }
    return this.gdpr.eraseUser(user.tenantId, id, user.sub);
  }
}
