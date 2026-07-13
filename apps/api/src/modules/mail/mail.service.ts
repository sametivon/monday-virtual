import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Env } from '../../config/env';
import { eventIcs, reminderMail, rsvpMail, welcomeMail } from './templates';

/**
 * Transactional mail (C1) — Resend, optional-env like S3/uploads: without
 * RESEND_API_KEY + MAIL_FROM every send is a silent no-op. Sending is ALWAYS
 * fire-and-forget (`void mail.send…()`): a mail provider outage must never
 * fail or slow a login, an RSVP, or the reminder cron.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string | undefined;
  private readonly appUrl: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    const key = config.get('RESEND_API_KEY', { infer: true });
    this.from = config.get('MAIL_FROM', { infer: true });
    this.resend = key && this.from ? new Resend(key) : null;
    this.appUrl = config.get('WEB_PUBLIC_URL', { infer: true });
  }

  /** True when mail is configured — lets callers skip prep work entirely. */
  get enabled(): boolean {
    return this.resend !== null;
  }

  async sendWelcome(tenantId: string, user: { name: string; email: string }): Promise<void> {
    if (!this.enabled || !user.email) return;
    const productName = await this.productName(tenantId);
    await this.deliver(
      user.email,
      welcomeMail({ productName, userName: user.name, appUrl: this.appUrl }),
    );
  }

  async sendRsvpConfirmation(
    tenantId: string,
    user: { name: string; email: string },
    event: { id: string; title: string; startsAt: Date; endsAt: Date },
  ): Promise<void> {
    if (!this.enabled || !user.email) return;
    const productName = await this.productName(tenantId);
    const ics = eventIcs({
      uid: `${event.id}@mondayvirtual.eu`,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      url: this.appUrl,
      productName,
    });
    await this.deliver(
      user.email,
      rsvpMail({
        productName,
        userName: user.name,
        eventTitle: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        appUrl: this.appUrl,
      }),
      [{ filename: 'event.ics', content: Buffer.from(ics) }],
    );
  }

  async sendEventReminder(
    tenantId: string,
    emails: string[],
    event: { title: string; startsAt: Date },
  ): Promise<void> {
    if (!this.enabled || emails.length === 0) return;
    const productName = await this.productName(tenantId);
    const mail = reminderMail({
      productName,
      eventTitle: event.title,
      startsAt: event.startsAt,
      appUrl: this.appUrl,
    });
    // Sequential sends keep us inside Resend's free-tier rate limit; the
    // reminder cron is the only bulk-ish path and audiences are small.
    for (const email of emails) {
      await this.deliver(email, mail);
    }
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async deliver(
    to: string,
    mail: { subject: string; html: string; text: string },
    attachments?: { filename: string; content: Buffer }[],
  ): Promise<void> {
    try {
      const { error } = await this.resend!.emails.send({
        from: this.from!,
        to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments,
      });
      if (error) this.logger.warn(`mail send failed (${mail.subject}): ${error.message}`);
    } catch (err) {
      this.logger.warn(`mail send threw (${mail.subject}): ${(err as Error).message}`);
    }
  }

  private async productName(tenantId: string): Promise<string> {
    try {
      const branding = await this.prisma.raw.branding.findUnique({
        where: { tenantId },
        select: { productName: true },
      });
      return branding?.productName ?? 'MondayVirtual';
    } catch {
      return 'MondayVirtual';
    }
  }
}
