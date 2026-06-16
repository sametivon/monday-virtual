import { Injectable, Logger } from '@nestjs/common';
import { forTenant } from '@mvs/db';
import type { ChatMessageBroadcast } from '@mvs/shared';

/**
 * Chat persistence (M5). Messages broadcast immediately and persist
 * fire-and-forget — a slow DB write must never add latency to the hot path,
 * and a failed write loses one history row, not the live message.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  persist(tenantId: string, message: ChatMessageBroadcast): void {
    void forTenant(tenantId)
      .chatMessage.create({
        data: {
          id: message.id,
          tenantId,
          scope: message.scope,
          spaceId: message.spaceId ?? null,
          fromUserId: message.fromUserId,
          toUserId: message.toUserId ?? null,
          body: message.body,
          mentions: message.mentions ?? [],
        },
      })
      .catch((err: Error) => this.logger.warn(`chat persist failed: ${err.message}`));
  }
}
