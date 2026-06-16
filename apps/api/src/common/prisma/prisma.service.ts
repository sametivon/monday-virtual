import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient, forTenant, prisma } from '@mvs/db';

/**
 * Wraps the shared Prisma client for Nest's lifecycle. Exposes:
 *  - `raw`           — unscoped client (auth bootstrap, tenant provisioning,
 *                      super-admin/platform ops only)
 *  - `forTenant(id)` — tenant-pinned client; ALL request-scoped reads/writes
 *                      to tenant-owned tables must go through this.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly raw: PrismaClient = prisma;

  forTenant(tenantId: string) {
    return forTenant(tenantId);
  }

  async onModuleInit(): Promise<void> {
    await this.raw.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.raw.$disconnect();
  }
}
