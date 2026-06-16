import { Body, Controller, Post } from '@nestjs/common';
import {
  MediaTokenRequestSchema,
  Permission,
  type MediaTokenRequest,
  type MediaTokenResponse,
} from '@mvs/shared';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @RequirePermissions(Permission.MEDIA_PUBLISH)
  @Post('token')
  token(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBody(MediaTokenRequestSchema)) dto: MediaTokenRequest,
  ): Promise<MediaTokenResponse> {
    return this.media.issueToken(user, dto);
  }
}
