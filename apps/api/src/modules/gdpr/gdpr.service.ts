import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatScope, RoleKey, type GdprErasureResult, type GdprExport } from '@mvs/shared';
import type { Prisma } from '@mvs/db';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * GDPR data-subject tooling (Phase 3 scale-hardening): export everything stored
 * about a user (art. 15/20 access & portability) and erase a user (art. 17
 * right to be forgotten). Admin-gated (USER_MANAGE). All queries are
 * tenant-scoped so an admin can only act on subjects in their own tenant.
 *
 * Erasure is anonymize-in-place rather than hard delete: aggregate analytics
 * and attendance counts stay intact, but every piece of PII is scrubbed and the
 * user is soft-deleted (deletedAt set, login blocked). This keeps referential
 * integrity for rows that reference the user by opaque id while removing the
 * identifying content (name, email, message bodies, sessions).
 */
@Injectable()
export class GdprService {
  constructor(private readonly prisma: PrismaService) {}

  /** Assemble a full personal-data export for one subject. */
  async exportUser(tenantId: string, userId: string): Promise<GdprExport> {
    const db = this.prisma.forTenant(tenantId);
    const user = await db.user.findFirst({ where: { id: userId }, include: { role: true } });
    if (!user) throw new NotFoundException('User not found');

    const [sessions, registrations, messages, analytics] = await Promise.all([
      db.session.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      db.eventRegistration.findMany({ where: { userId }, include: { event: true } }),
      db.chatMessage.findMany({ where: { fromUserId: userId }, orderBy: { createdAt: 'asc' } }),
      db.analyticsEvent.findMany({ where: { userId }, orderBy: { ts: 'asc' } }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      subject: {
        id: user.id,
        mondayUserId: user.mondayUserId,
        name: user.name,
        email: user.email,
        company: user.company,
        jobTitle: user.jobTitle,
        roleKey: (user.role?.key ?? null) as RoleKey | null,
        avatarConfig: user.avatarConfig,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
      },
      sessions: sessions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
      })),
      eventRegistrations: registrations.map((r) => ({
        eventId: r.eventId,
        eventTitle: r.event?.title ?? '',
        registeredAt: r.registeredAt.toISOString(),
        attended: r.attended,
      })),
      chatMessages: messages.map((m) => ({
        id: m.id,
        scope: m.scope as ChatScope,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
      analyticsEvents: analytics.map((a) => ({
        type: a.type,
        spaceId: a.spaceId,
        ts: a.ts.toISOString(),
      })),
    };
  }

  /**
   * Erase a subject: scrub PII, soft-delete the user, drop sessions and DMs,
   * anonymize authored room/global messages, and detach analytics rows from the
   * identity. Refuses to erase the last tenant admin (would orphan the tenant).
   */
  async eraseUser(tenantId: string, userId: string, actorId: string): Promise<GdprErasureResult> {
    const db = this.prisma.forTenant(tenantId);
    const user = await db.user.findFirst({ where: { id: userId }, include: { role: true } });
    if (!user) throw new NotFoundException('User not found');

    if (user.role?.key === RoleKey.TENANT_ADMIN) {
      const admins = await db.user.count({ where: { roleId: user.roleId, deletedAt: null } });
      if (admins <= 1) {
        throw new BadRequestException('Cannot erase the last tenant admin — reassign the role first');
      }
    }

    const anon = `deleted-user-${user.id.slice(-6)}`;

    // One transaction so a half-erased subject is never left behind.
    const result = await this.prisma.raw.$transaction(async (tx) => {
      const sessions = await tx.session.deleteMany({ where: { tenantId, userId } });
      // Direct messages are private 1:1 content — delete outright (both directions).
      const directMessages = await tx.chatMessage.deleteMany({
        where: { tenantId, scope: ChatScope.DIRECT, OR: [{ fromUserId: userId }, { toUserId: userId }] },
      });
      // Room/global messages stay (others' threads reference them) but the body
      // is the PII — blank it and keep the timestamp/scope for thread coherence.
      const chatMessagesAnonymized = await tx.chatMessage.updateMany({
        where: { tenantId, fromUserId: userId },
        data: { body: '[deleted]', mentions: undefined },
      });
      // Analytics keep their aggregate value but lose the identity link.
      const analyticsEventsDetached = await tx.analyticsEvent.updateMany({
        where: { tenantId, userId },
        data: { userId: null },
      });
      const eventRegistrations = await tx.eventRegistration.count({ where: { tenantId, userId } });

      // Scrub the subject record and soft-delete. We also tombstone
      // mondayUserId: auth upserts by (tenantId, mondayUserId) and does NOT
      // check deletedAt, so leaving the real id would let a re-login resurrect
      // the scrubbed row and re-populate name/email from monday — defeating the
      // erasure. Tombstoning the key means a future login provisions a fresh
      // user instead, and this row stays a permanent anonymized record.
      await tx.user.update({
        where: { id: user.id },
        data: {
          mondayUserId: `erased:${user.id}`,
          name: anon,
          email: `${anon}@erased.invalid`,
          company: null,
          jobTitle: null,
          avatarConfig: {} as Prisma.InputJsonValue,
          deletedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: 'gdpr.erase',
          target: user.id,
          meta: {
            sessions: sessions.count,
            directMessages: directMessages.count,
            chatMessagesAnonymized: chatMessagesAnonymized.count,
            analyticsEventsDetached: analyticsEventsDetached.count,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        sessions: sessions.count,
        directMessages: directMessages.count,
        chatMessagesAnonymized: chatMessagesAnonymized.count,
        analyticsEventsDetached: analyticsEventsDetached.count,
        eventRegistrations,
      };
    });

    return {
      userId: user.id,
      erasedAt: new Date().toISOString(),
      removed: {
        sessions: result.sessions,
        directMessages: result.directMessages,
        chatMessagesAnonymized: result.chatMessagesAnonymized,
        eventRegistrations: result.eventRegistrations,
        analyticsEventsDetached: result.analyticsEventsDetached,
      },
    };
  }
}
