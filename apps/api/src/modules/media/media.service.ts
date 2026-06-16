import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import { room as roomKeys, type MediaTokenResponse } from '@mvs/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Env } from '../../config/env';
import type { RequestUser } from '../../common/auth/current-user.decorator';

/**
 * Mints LiveKit access tokens. The client never holds the LiveKit secret — it
 * asks for a token scoped to one room (the whole space, or a meeting-table
 * sub-room), TTL-limited, with publish rights gated by permission.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  async issueToken(
    user: RequestUser,
    input: { spaceId: string; roomKey?: string; publish: boolean },
  ): Promise<MediaTokenResponse> {
    const apiKey = this.config.get('LIVEKIT_API_KEY', { infer: true });
    const apiSecret = this.config.get('LIVEKIT_API_SECRET', { infer: true });
    const url = this.config.get('LIVEKIT_URL', { infer: true });
    if (!apiKey || !apiSecret || !url) {
      throw new ServiceUnavailableException('LiveKit is not configured');
    }

    // Authorize: the space must exist and be visible to this tenant.
    const space = await this.prisma
      .forTenant(user.tenantId)
      .space.findFirst({ where: { id: input.spaceId } });
    if (!space) throw new NotFoundException('Space not found');

    const roomName = input.roomKey
      ? roomKeys.table(user.tenantId, input.spaceId, input.roomKey)
      : roomKeys.space(user.tenantId, input.spaceId);

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.sub,
      name: user.name,
      ttl: '1h',
    });
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: input.publish,
      canSubscribe: true,
      canPublishData: true,
    });

    return { token: await at.toJwt(), url, room: roomName };
  }
}
