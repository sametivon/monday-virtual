/**
 * @mvs/db — Prisma client + multi-tenant scoping helpers.
 *
 * - `prisma` is the raw, unscoped client (use only for auth bootstrap, tenant
 *   provisioning, and cross-tenant platform/super-admin operations).
 * - `forTenant(tenantId)` returns a client pinned to one tenant; every query on
 *   a tenant-owned model is auto-scoped. This is what request-scoped services
 *   should use.
 */

import { PrismaClient } from '@prisma/client';
import { tenantScope } from './tenant-scope';

const globalForPrisma = globalThis as unknown as { __mvsPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__mvsPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__mvsPrisma = prisma;
}

export type TenantPrisma = ReturnType<typeof forTenant>;

/** Build a tenant-pinned client. Cheap; create one per request. */
export function forTenant(tenantId: string) {
  return prisma.$extends(tenantScope(tenantId));
}

export * from './tenant-scope';
export { Prisma, PrismaClient } from '@prisma/client';
export type {
  Tenant,
  Branding,
  Role,
  User,
  Session,
  Space,
  SceneObject,
  Event,
  EventRegistration,
  ChatMessage,
  WhiteboardDoc,
  AnalyticsEvent,
  AuditLog,
  MondayOAuthToken,
} from '@prisma/client';
