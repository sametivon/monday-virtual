import { Injectable, Logger } from '@nestjs/common';
import { forTenant } from '@mvs/db';

/**
 * Event attendance capture (Phase 3). When a user joins a space, if there's a
 * LIVE event bound to that space, mark them attended (registering walk-ins on
 * the fly). Fire-and-forget like analytics/chat persistence — never blocks the
 * join hot path. Mirrors EventsService.markAttendance on the API side; lives
 * here so the realtime process can write it directly without a cross-service
 * call on every connection.
 */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  mark(tenantId: string, spaceId: string, userId: string): void {
    void (async () => {
      const db = forTenant(tenantId);
      const live = await db.event.findFirst({
        where: { spaceId, status: 'LIVE' },
        select: { id: true },
      });
      if (!live) return;
      await db.eventRegistration.upsert({
        where: { eventId_userId: { eventId: live.id, userId } },
        update: { attended: true },
        create: { tenantId, eventId: live.id, userId, attended: true },
      });
    })().catch((err: Error) => this.logger.warn(`attendance mark failed: ${err.message}`));
  }
}
