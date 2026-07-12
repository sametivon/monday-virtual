-- Subscription plan (monday Marketplace monetization), stored as JSON
-- (TenantPlan shape from @mvs/shared). Additive + nullable: safe on live data.
ALTER TABLE "Tenant" ADD COLUMN "plan" JSONB;
