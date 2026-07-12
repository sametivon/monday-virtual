import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  normalizeSubscription,
  PLAN_FEATURES,
  PlanKey,
  planHasFeature,
  type MondaySubscription,
  type PlanFeature,
  type TenantPlan,
  type TenantPlanInfo,
} from '@mvs/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../../config/env';

/**
 * Subscription-plan plumbing (monday Marketplace monetization). monday bills;
 * WE enforce — the sessionToken's subscription claim (at login) and the
 * monetization webhooks both funnel into Tenant.plan, and everything else
 * (feature guard, seat cap, /me) reads from there.
 *
 * Pre-marketplace there is no subscription anywhere, so tenants resolve to the
 * DEFAULT_PLAN env (COMPANY today = all features on). Flipping DEFAULT_PLAN
 * once the listing is live turns enforcement on without code changes.
 */
@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  defaultPlanKey(): PlanKey {
    return this.config.get('DEFAULT_PLAN', { infer: true }) as PlanKey;
  }

  /** Normalize + persist the subscription on the tenant (no-op when unchanged). */
  async syncFromSubscription(tenantId: string, sub: MondaySubscription | null): Promise<TenantPlan> {
    const next = normalizeSubscription(sub, this.defaultPlanKey(), new Date().toISOString());
    const tenant = await this.prisma.raw.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const current = tenant.plan as TenantPlan | null;
    // Only write when something material changed — login runs this every time.
    if (
      current &&
      current.key === next.key &&
      current.planId === next.planId &&
      current.isTrial === next.isTrial &&
      current.renewalDate === next.renewalDate &&
      current.maxSeats === next.maxSeats
    ) {
      return current;
    }
    await this.prisma.raw.tenant.update({ where: { id: tenantId }, data: { plan: next as object } });
    this.logger.log(`tenant ${tenantId} plan → ${next.key} (${next.source}${next.isTrial ? ', trial' : ''})`);
    return next;
  }

  /** Webhook path: subscription events arrive keyed by monday account id. */
  async syncByAccountId(mondayAccountId: string, sub: MondaySubscription | null): Promise<void> {
    const tenant = await this.prisma.raw.tenant.findUnique({ where: { mondayAccountId } });
    if (!tenant) {
      // Subscription can precede first login (admin buys before opening the app).
      this.logger.warn(`subscription webhook for unknown account ${mondayAccountId} — ignored`);
      return;
    }
    await this.syncFromSubscription(tenant.id, sub);
  }

  /** The tenant's effective plan (stored, or the env default when never synced). */
  async getPlan(tenantId: string): Promise<TenantPlan> {
    const tenant = await this.prisma.raw.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const stored = tenant.plan as TenantPlan | null;
    return stored ?? normalizeSubscription(null, this.defaultPlanKey(), new Date().toISOString());
  }

  /** Plan + derived info for /me (features list, seats used). */
  async getPlanInfo(tenantId: string): Promise<TenantPlanInfo> {
    const [plan, seatsUsed] = await Promise.all([
      this.getPlan(tenantId),
      this.prisma.forTenant(tenantId).user.count({ where: { deletedAt: null } }),
    ]);
    return { ...plan, features: PLAN_FEATURES[plan.key] ?? [], seatsUsed };
  }

  async hasFeature(tenantId: string, feature: PlanFeature): Promise<boolean> {
    const plan = await this.getPlan(tenantId);
    return planHasFeature(plan.key, feature);
  }

  /**
   * Seat cap for NEW users only — existing members always keep access (fair,
   * predictable; the admin frees or buys seats to onboard more people).
   */
  async assertSeatAvailable(tenantId: string): Promise<void> {
    const plan = await this.getPlan(tenantId);
    if (plan.maxSeats == null) return; // unlimited / feature-based plan
    const used = await this.prisma.forTenant(tenantId).user.count({ where: { deletedAt: null } });
    if (used >= plan.maxSeats) {
      throw new ForbiddenException(
        `All ${plan.maxSeats} seats on your plan are in use — ask your admin to add seats in monday.com.`,
      );
    }
  }
}
