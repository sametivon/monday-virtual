import { BadRequestException, Injectable } from '@nestjs/common';
import { ChatScope, type ChatHistoryQuery, type ChatMessageBroadcast } from '@mvs/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Chat history (M5): paginated reads of persisted messages, newest-first
 * cursor on createdAt, returned oldest-first for direct rendering. Sender
 * names are joined from the User table (messages store only ids).
 */
@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async history(
    tenantId: string,
    userId: string,
    query: ChatHistoryQuery,
  ): Promise<ChatMessageBroadcast[]> {
    const where = this.scopeFilter(userId, query);
    const db = this.prisma.forTenant(tenantId);

    const rows = await db.chatMessage.findMany({
      where: {
        ...where,
        ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    const senderIds = [...new Set(rows.map((r) => r.fromUserId))];
    const senders = await db.user.findMany({
      where: { id: { in: senderIds } },
      select: { id: true, name: true },
    });
    const names = new Map(senders.map((s) => [s.id, s.name]));

    return rows.reverse().map((r) => ({
      id: r.id,
      scope: r.scope as ChatScope,
      spaceId: r.spaceId,
      fromUserId: r.fromUserId,
      fromName: names.get(r.fromUserId) ?? 'Unknown',
      toUserId: r.toUserId,
      body: r.body,
      mentions: (r.mentions as string[] | null) ?? undefined,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private scopeFilter(userId: string, query: ChatHistoryQuery) {
    switch (query.scope) {
      case ChatScope.GLOBAL:
        return { scope: ChatScope.GLOBAL };
      case ChatScope.ROOM:
        if (!query.spaceId) throw new BadRequestException('spaceId required for ROOM history');
        return { scope: ChatScope.ROOM, spaceId: query.spaceId };
      case ChatScope.DIRECT: {
        if (!query.withUserId)
          throw new BadRequestException('withUserId required for DIRECT history');
        return {
          scope: ChatScope.DIRECT,
          OR: [
            { fromUserId: userId, toUserId: query.withUserId },
            { fromUserId: query.withUserId, toUserId: userId },
          ],
        };
      }
    }
  }
}
