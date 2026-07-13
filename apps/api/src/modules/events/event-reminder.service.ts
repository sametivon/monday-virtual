import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventStatus } from '@mvs/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../mail/mail.service';

/**
 * Event reminders (C1): every 5 minutes, find scheduled events starting within
 * the next hour that haven't been reminded yet, mail every registrant, and
 * stamp reminderSentAt so each event reminds exactly once.
 *
 * Render-free caveat: cron only fires while the service is awake — the
 * keep-alive pinger keeps this honest. Claiming the event (stamp first, then
 * send) also makes a crashed run safe: worst case a reminder is skipped, never
 * double-sent.
 */
@Injectable()
export class EventReminderService {
  private readonly logger = new Logger(EventReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Cron('*/5 * * * *')
  async sendDueReminders(): Promise<void> {
    if (!this.mail.enabled) return;

    const now = new Date();
    const horizon = new Date(now.getTime() + 60 * 60 * 1000);
    const due = await this.prisma.raw.event.findMany({
      where: {
        status: EventStatus.SCHEDULED,
        reminderSentAt: null,
        startsAt: { gt: now, lte: horizon },
      },
      include: { registrations: { include: { user: { select: { email: true } } } } },
    });

    for (const event of due) {
      // Claim before sending — a concurrent/failed run must not double-mail.
      await this.prisma.raw.event.update({
        where: { id: event.id },
        data: { reminderSentAt: now },
      });
      const emails = event.registrations
        .map((r) => r.user?.email)
        .filter((e): e is string => Boolean(e));
      if (emails.length === 0) continue;
      this.logger.log(`reminding ${emails.length} registrant(s): "${event.title}"`);
      await this.mail.sendEventReminder(event.tenantId, emails, {
        title: event.title,
        startsAt: event.startsAt,
      });
    }
  }
}
