/**
 * Subscription plans & plan-gated features (monday Marketplace monetization).
 *
 * monday handles checkout/billing/invoicing; the app MUST enforce the plan at
 * runtime itself ("monday.com does not automatically restrict access when a
 * subscription expires or changes" — developer docs). The pipeline:
 *
 *   sessionToken `dat.subscription` claim ─┐
 *   monetization webhooks ─────────────────┴→ Tenant.plan (JSON) → FeatureGuard / seat cap / UI
 *
 * Until the Marketplace listing is live there is no subscription anywhere, so
 * tenants fall back to the API's DEFAULT_PLAN env (currently COMPANY = all
 * features) — flipping that to TEAM/FREE turns enforcement on with zero code.
 */

export enum PlanKey {
  FREE = 'FREE',
  TEAM = 'TEAM',
  COMPANY = 'COMPANY',
  ENTERPRISE = 'ENTERPRISE',
}

/** Coarse, sellable capabilities (not RBAC — a user needs BOTH the permission and the plan). */
export enum PlanFeature {
  /** Events + auditorium go-live/attendance tooling. */
  EVENTS = 'EVENTS',
  /** White-label branding editing. */
  BRANDING = 'BRANDING',
  /** Analytics dashboard + heatmap. */
  ANALYTICS = 'ANALYTICS',
}

export const PLAN_FEATURES: Record<PlanKey, PlanFeature[]> = {
  [PlanKey.FREE]: [],
  [PlanKey.TEAM]: [],
  [PlanKey.COMPANY]: [PlanFeature.EVENTS, PlanFeature.BRANDING, PlanFeature.ANALYTICS],
  [PlanKey.ENTERPRISE]: [PlanFeature.EVENTS, PlanFeature.BRANDING, PlanFeature.ANALYTICS],
};

export function planHasFeature(plan: PlanKey, feature: PlanFeature): boolean {
  return PLAN_FEATURES[plan]?.includes(feature) ?? false;
}

/**
 * The subscription claim monday embeds in monetized sessionTokens and sends in
 * monetization webhooks. Field names follow the `app_subscription` GraphQL
 * type; everything optional because shapes drift across surfaces.
 */
export interface MondaySubscription {
  plan_id?: string;
  is_trial?: boolean;
  renewal_date?: string;
  billing_period?: string; // 'monthly' | 'yearly'
  days_left?: number;
  /** Seats purchased on seat-based plans; null/absent on feature-based plans. */
  max_units?: number | null;
  pricing_version?: number;
}

/** What we persist on Tenant.plan (JSON) — normalized from MondaySubscription. */
export interface TenantPlan {
  key: PlanKey;
  /** Raw monday plan id (e.g. 'company_seat_monthly'); null when defaulted. */
  planId: string | null;
  isTrial: boolean;
  renewalDate: string | null;
  billingPeriod: string | null;
  /** Seat cap; null = unlimited/feature-based. */
  maxSeats: number | null;
  /** Where this came from — 'monday' (token/webhook) or 'default' (no subscription yet). */
  source: 'monday' | 'default';
  updatedAt: string;
}

/** Plan block returned in /me for UI gating, banners, and seat displays. */
export interface TenantPlanInfo extends TenantPlan {
  features: PlanFeature[];
  seatsUsed: number;
}

/**
 * Map a monday `plan_id` (defined by us in the Developer Center) to a PlanKey.
 * Convention: name Developer Center plan ids with the tier word in them, e.g.
 * `team_monthly`, `company_seat_yearly`, `enterprise_custom` — matching is by
 * substring so billing-period variants need no code change.
 */
export function resolvePlanKey(planId: string | null | undefined): PlanKey | null {
  if (!planId) return null;
  const id = planId.toLowerCase();
  if (id.includes('enterprise')) return PlanKey.ENTERPRISE;
  if (id.includes('company')) return PlanKey.COMPANY;
  if (id.includes('team')) return PlanKey.TEAM;
  if (id.includes('free')) return PlanKey.FREE;
  return null;
}

/** Normalize a monday subscription (or its absence) into the stored TenantPlan. */
export function normalizeSubscription(
  sub: MondaySubscription | null | undefined,
  defaultPlan: PlanKey,
  now: string,
): TenantPlan {
  const key = resolvePlanKey(sub?.plan_id);
  if (!sub || !key) {
    return {
      key: defaultPlan,
      planId: sub?.plan_id ?? null,
      isTrial: sub?.is_trial ?? false,
      renewalDate: sub?.renewal_date ?? null,
      billingPeriod: sub?.billing_period ?? null,
      maxSeats: sub?.max_units ?? null,
      source: 'default',
      updatedAt: now,
    };
  }
  return {
    key,
    planId: sub.plan_id ?? null,
    isTrial: sub.is_trial ?? false,
    renewalDate: sub.renewal_date ?? null,
    billingPeriod: sub.billing_period ?? null,
    maxSeats: sub.max_units ?? null,
    source: 'monday',
    updatedAt: now,
  };
}
