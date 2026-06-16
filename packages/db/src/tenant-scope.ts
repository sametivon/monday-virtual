import { Prisma } from '@prisma/client';

/**
 * Models that carry a `tenantId` and must NEVER be queried without a tenant
 * scope. The tenant-scoping extension auto-injects `tenantId` into every
 * read/write on these models and throws if it is somehow missing — this is the
 * structural backbone of multi-tenant isolation (see ARCHITECTURE §3).
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'Branding',
  'Role',
  'User',
  'Session',
  'MondayOAuthToken',
  'Space',
  'SceneObject',
  'WhiteboardDoc',
  'Event',
  'EventRegistration',
  'ChatMessage',
  'AnalyticsEvent',
  'AuditLog',
]);

/**
 * Operations whose `where` we constrain with `tenantId`.
 * NOTE: `findUnique`/`findUniqueOrThrow` are intentionally excluded — their
 * `where` only accepts unique fields, so injecting a non-unique `tenantId`
 * would throw. Service code MUST use `findFirst` for tenant-scoped lookups by
 * non-PK fields; lookups by global cuid PK are safe but should still be
 * tenant-checked after load. The lint rule + code review enforce this.
 */
const WHERE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

const CREATE_OPS = new Set(['create', 'createMany', 'upsert']);

export class TenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(`Tenant-scoped operation ${model}.${operation} ran without a tenantId scope`);
    this.name = 'TenantScopeError';
  }
}

/**
 * Returns a Prisma Client extension that pins all queries to a single tenant.
 * Use via `prisma.$extends(tenantScope(tenantId))`. The resulting client is
 * cheap to create per request.
 */
export function tenantScope(tenantId: string) {
  if (!tenantId) throw new Error('tenantScope requires a non-empty tenantId');

  return Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const a: Record<string, unknown> = { ...(args as object) };

          if (WHERE_OPS.has(operation)) {
            a.where = { ...((a.where as object) ?? {}), tenantId };
          }

          if (CREATE_OPS.has(operation)) {
            if (operation === 'createMany') {
              const data = a.data as Record<string, unknown>[] | Record<string, unknown>;
              a.data = Array.isArray(data)
                ? data.map((d) => ({ ...d, tenantId }))
                : { ...data, tenantId };
            } else if (operation === 'upsert') {
              a.where = { ...((a.where as object) ?? {}), tenantId };
              a.create = { ...((a.create as object) ?? {}), tenantId };
            } else {
              a.data = { ...((a.data as object) ?? {}), tenantId };
            }
          }

          return query(a);
        },
      },
    },
  });
}
