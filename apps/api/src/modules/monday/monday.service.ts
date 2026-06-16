import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { MondayBoardData, MondayBoardSummary } from '@mvs/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { REDIS } from '../../common/redis/redis.module';
import { MondayAuthService } from '../auth/monday-auth.service';

/**
 * Reads live Monday board data on behalf of in-world DASHBOARD/SCREEN objects.
 * Uses the tenant's encrypted OAuth token and caches results in Redis (TTL) to
 * stay within Monday's rate limits. Cross-tenant access is impossible: the
 * token is looked up under the caller's tenantId.
 */
@Injectable()
export class MondayService {
  private readonly cacheTtlSeconds = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly mondayAuth: MondayAuthService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async getBoard(tenantId: string, boardId: string): Promise<MondayBoardData> {
    const cacheKey = `monday:${tenantId}:board:${boardId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return { ...(JSON.parse(cached) as MondayBoardData), cached: true };

    const tokenRow = await this.prisma
      .forTenant(tenantId)
      .mondayOAuthToken.findFirst({ where: { tenantId } });
    if (!tokenRow) {
      throw new BadRequestException(
        'No Monday connection for this tenant. Complete OAuth to enable board data.',
      );
    }
    const accessToken = this.crypto.decrypt(tokenRow.accessToken);
    return this.fetchBoard(accessToken, boardId, cacheKey);
  }

  /**
   * Seamless variants: inside the iframe the monday sessionToken doubles as a
   * short-lived API token — no OAuth grant needed. The token must verify with
   * OUR client secret AND belong to this tenant's monday account, so a token
   * from another app or account can never read boards across tenants.
   */
  async listBoardsSeamless(tenantId: string, sessionToken: string): Promise<MondayBoardSummary[]> {
    await this.assertTokenBelongsToTenant(tenantId, sessionToken);

    const cacheKey = `monday:${tenantId}:boards`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as MondayBoardSummary[];

    const data = await this.mondayAuth
      .graphql<{ boards: { id: string; name: string }[] }>(
        `query { boards (limit: 50, order_by: used_at) { id name } }`,
        sessionToken,
      )
      .catch((err: Error) => this.translateMondayError(err));
    const boards = data.boards.map((b) => ({ id: b.id, name: b.name }));
    await this.redis.set(cacheKey, JSON.stringify(boards), 'EX', this.cacheTtlSeconds);
    return boards;
  }

  async getBoardSeamless(
    tenantId: string,
    sessionToken: string,
    boardId: string,
  ): Promise<MondayBoardData> {
    await this.assertTokenBelongsToTenant(tenantId, sessionToken);

    const cacheKey = `monday:${tenantId}:board:${boardId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return { ...(JSON.parse(cached) as MondayBoardData), cached: true };
    return this.fetchBoard(sessionToken, boardId, cacheKey);
  }

  /**
   * Turn raw monday API failures into actionable 400s. "Not authenticated"
   * with a valid-looking sessionToken almost always means the app has NO API
   * scopes configured — monday only honors sessionTokens as API tokens when
   * the app declares scopes (and is installed, not just previewed).
   */
  private translateMondayError(err: Error): never {
    if (/not authenticated/i.test(err.message)) {
      throw new BadRequestException(
        'monday rejected the API call: the app has no API scopes. In the monday Developer Center open this app → OAuth & Permissions → add boards:read, users:read and me:read, then reinstall the app on your account and reload.',
      );
    }
    throw new BadRequestException(err.message);
  }

  private async assertTokenBelongsToTenant(tenantId: string, sessionToken: string): Promise<void> {
    const identity = this.mondayAuth.verifySessionToken(sessionToken);
    const tenant = await this.prisma.raw.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.mondayAccountId !== identity.mondayAccountId) {
      throw new ForbiddenException('Session token does not belong to this workspace');
    }
  }

  private async fetchBoard(
    token: string,
    boardId: string,
    cacheKey: string,
  ): Promise<MondayBoardData> {
    const query = `query ($ids: [ID!]) {
      boards (ids: $ids) {
        id name
        columns { id title type }
        items_page (limit: 100) {
          items { id name column_values { id text value } }
        }
      }
    }`;
    const data = await this.mondayAuth
      .graphql<MondayBoardsResponse>(query, token, { ids: [boardId] })
      .catch((err: Error) => this.translateMondayError(err));
    const board = data.boards[0];
    if (!board) throw new BadRequestException(`Board ${boardId} not found`);

    const result: MondayBoardData = {
      boardId: board.id,
      name: board.name,
      columns: board.columns.map((c) => ({ id: c.id, title: c.title, type: c.type })),
      items: board.items_page.items.map((it) => ({
        id: it.id,
        name: it.name,
        // Display text only — raw `value` JSON must never reach the UI.
        values: Object.fromEntries(it.column_values.map((cv) => [cv.id, cv.text || null])),
      })),
      fetchedAt: new Date().toISOString(),
      cached: false,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', this.cacheTtlSeconds);
    return result;
  }
}

interface MondayBoardsResponse {
  boards: {
    id: string;
    name: string;
    columns: { id: string; title: string; type: string }[];
    items_page: {
      items: {
        id: string;
        name: string;
        column_values: { id: string; text: string | null; value: string | null }[];
      }[];
    };
  }[];
}
