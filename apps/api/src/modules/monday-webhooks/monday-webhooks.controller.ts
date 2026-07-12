import { Body, Controller, Headers, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import type { MondaySubscription } from '@mvs/shared';
import { Public } from '../../common/auth/public.decorator';
import { PlanService } from '../../common/plan/plan.service';
import type { Env } from '../../config/env';

/**
 * monday monetization webhooks (Developer Center → Webhooks → subscription
 * events). monday POSTs on create/change/renew/cancel with an Authorization
 * JWT signed by our app's signing secret — that signature is the auth; the
 * endpoint is otherwise public (monday's servers hold no app JWT).
 *
 * Point the Developer Center webhook URL at:  POST /api/webhooks/monday
 */
interface MondayWebhookBody {
  type?: string;
  data?: {
    account_id?: number | string;
    subscription?: MondaySubscription | null;
  };
}

@Controller('webhooks/monday')
export class MondayWebhooksController {
  private readonly logger = new Logger(MondayWebhooksController.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly plans: PlanService,
  ) {}

  @Public()
  @Post()
  async handle(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: MondayWebhookBody,
  ): Promise<{ ok: true }> {
    const secret = this.config.get('MONDAY_SIGNING_SECRET', { infer: true });
    if (!secret) throw new UnauthorizedException('Webhook signing secret not configured');
    if (!authorization) throw new UnauthorizedException('Missing webhook signature');
    try {
      jwt.verify(authorization.replace(/^Bearer\s+/i, ''), secret);
    } catch {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const type = body.type ?? 'unknown';
    const accountId = body.data?.account_id;
    if (accountId == null) {
      this.logger.warn(`webhook ${type} without account_id — ignored`);
      return { ok: true };
    }

    // Cancellations without a subscription payload drop the tenant back to the
    // default plan; everything else syncs whatever monday sent.
    const sub = type.includes('cancelled') ? (body.data?.subscription ?? null) : body.data?.subscription ?? null;
    this.logger.log(`webhook ${type} for account ${accountId}`);
    await this.plans.syncByAccountId(String(accountId), sub);
    return { ok: true };
  }
}
