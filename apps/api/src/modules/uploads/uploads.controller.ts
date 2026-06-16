import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import {
  hasPermission,
  Permission,
  UploadKind,
  UploadSignRequestSchema,
  type UploadSignRequest,
  type UploadSignResponse,
} from '@mvs/shared';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { UploadsService } from './uploads.service';

/** Permission required to upload each asset kind. */
const KIND_PERMISSION: Record<UploadKind, Permission> = {
  [UploadKind.LOGO]: Permission.BRANDING_EDIT,
  [UploadKind.SLIDE]: Permission.PRESENT,
};

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * Issue a presigned PUT URL for a direct-to-bucket upload. Authorization is
   * per-kind (logo → branding:edit, slide → present), checked here rather than
   * via a single route decorator because the required permission varies by kind.
   */
  @Post('sign')
  sign(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBody(UploadSignRequestSchema)) dto: UploadSignRequest,
  ): Promise<UploadSignResponse> {
    if (!hasPermission(user.permissions, KIND_PERMISSION[dto.kind])) {
      throw new ForbiddenException(`You lack permission to upload a ${dto.kind}`);
    }
    return this.uploads.sign(user.tenantId, dto);
  }
}
