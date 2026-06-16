import { Injectable, Logger } from '@nestjs/common';
import { forTenant } from '@mvs/db';

/**
 * Analytics capture (Phase 3). Writes one AnalyticsEvent row per tracked
 * action, fire-and-forget like chat persistence — a slow or failed write must
 * never add latency to the realtime hot path. The API aggregates these rows
 * into the admin dashboard; nothing here reads them back.
 *
 * Event types (string `type` column): space_join, space_leave, chat_send,
 * present_start, reaction, hand_raise. `payload` carries small extras
 * (e.g. session duration on leave).
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  track(
    tenantId: string,
    type: string,
    opts: { userId?: string; spaceId?: string; payload?: Record<string, unknown> } = {},
  ): void {
    void forTenant(tenantId)
      .analyticsEvent.create({
        data: {
          tenantId,
          userId: opts.userId ?? null,
          spaceId: opts.spaceId ?? null,
          type,
          payload: opts.payload ?? undefined,
        },
      })
      .catch((err: Error) => this.logger.warn(`analytics ${type} failed: ${err.message}`));
  }
}
