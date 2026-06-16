import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { ChainableCommander } from 'ioredis';
import type { PlayerState, PlayerTickUpdate, SocketAuthData } from '@mvs/shared';
import { AvatarAnimation, PRESENCE_TTL_SECONDS, UserPresenceStatus } from '@mvs/shared';
import { REDIS } from '../common/redis.module';

/**
 * Presence lives in Redis (not Postgres) so it survives pod failover and is
 * shared across realtime pods. Key: `presence:{tenantId}:{spaceId}` → hash of
 * userId → JSON PlayerState, with a TTL refreshed by the tick loop so hashes
 * from crashed nodes expire instead of ghosting forever.
 *
 * Players connected to THIS node are also cached in memory, so the tick flush
 * can write full states without read-modify-write round-trips (M3).
 */
@Injectable()
export class PresenceService {
  /** `${presenceKey}:${userId}` → authoritative state for local sockets. */
  private readonly local = new Map<string, PlayerState>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  key(tenantId: string, spaceId: string): string {
    return `presence:${tenantId}:${spaceId}`;
  }

  async join(
    auth: SocketAuthData,
    avatarConfig: unknown,
    spawn: [number, number, number],
  ): Promise<PlayerState> {
    const state: PlayerState = {
      userId: auth.userId,
      name: auth.name,
      avatarConfig,
      position: spawn,
      rotation: 0,
      animation: AvatarAnimation.IDLE,
      status: UserPresenceStatus.ONLINE,
      handRaised: false,
    };
    const key = this.key(auth.tenantId, auth.spaceId);
    this.local.set(`${key}:${auth.userId}`, state);
    await this.redis
      .pipeline()
      .hset(key, auth.userId, JSON.stringify(state))
      .expire(key, PRESENCE_TTL_SECONDS)
      .exec();
    return state;
  }

  async leave(tenantId: string, spaceId: string, userId: string): Promise<void> {
    const key = this.key(tenantId, spaceId);
    this.local.delete(`${key}:${userId}`);
    await this.redis.hdel(key, userId);
  }

  async list(tenantId: string, spaceId: string): Promise<PlayerState[]> {
    const all = await this.redis.hgetall(this.key(tenantId, spaceId));
    return Object.values(all).map((v) => JSON.parse(v) as PlayerState);
  }

  /**
   * Merge tick updates into the local cache and queue the hash writes on the
   * caller's pipeline — one Redis round-trip per tick, not per message.
   */
  queueFlush(pipeline: ChainableCommander, presenceKey: string, updates: PlayerTickUpdate[]): void {
    const fields: Record<string, string> = {};
    for (const u of updates) {
      const cacheKey = `${presenceKey}:${u.userId}`;
      const state = this.local.get(cacheKey);
      if (!state) continue; // disconnected between enqueue and flush
      state.position = u.position;
      state.rotation = u.rotation;
      state.animation = u.animation;
      fields[u.userId] = JSON.stringify(state);
    }
    if (Object.keys(fields).length > 0) pipeline.hset(presenceKey, fields);
  }

  /**
   * Current XZ positions of all players connected to THIS node, grouped by
   * space. Used by occupancy sampling for the analytics heatmap — reads the
   * in-memory cache only (no Redis round-trip), so it is cheap to call on a
   * slow timer. Keys are `presence:{tenantId}:{spaceId}`; cuids carry no colons
   * so the split is unambiguous.
   */
  localPositionsBySpace(): Map<{ tenantId: string; spaceId: string }, [number, number][]> {
    const out = new Map<string, { tenantId: string; spaceId: string; points: [number, number][] }>();
    for (const [cacheKey, state] of this.local) {
      // cacheKey = `presence:{tenantId}:{spaceId}:{userId}` → presenceKey is all but the last segment.
      const lastColon = cacheKey.lastIndexOf(':');
      const presenceKey = cacheKey.slice(0, lastColon);
      const parts = presenceKey.split(':'); // ['presence', tenantId, spaceId]
      if (parts.length !== 3) continue;
      const [, tenantId, spaceId] = parts;
      let bucket = out.get(presenceKey);
      if (!bucket) {
        bucket = { tenantId, spaceId, points: [] };
        out.set(presenceKey, bucket);
      }
      bucket.points.push([state.position[0], state.position[2]]);
    }
    const result = new Map<{ tenantId: string; spaceId: string }, [number, number][]>();
    for (const { tenantId, spaceId, points } of out.values()) {
      result.set({ tenantId, spaceId }, points);
    }
    return result;
  }

  /**
   * Number of players connected to THIS node in one space. The tick loop uses
   * it as the cheap (in-memory, no Redis) proxy for "is this space crowded
   * enough to switch from a room-wide broadcast to spatial-cell interest
   * management".
   */
  localCountForKey(presenceKey: string): number {
    const prefix = `${presenceKey}:`;
    let count = 0;
    for (const cacheKey of this.local.keys()) {
      if (cacheKey.startsWith(prefix)) count++;
    }
    return count;
  }

  /** Low-frequency state changes (status, hand raise) — applied immediately. */
  async patch(
    tenantId: string,
    spaceId: string,
    userId: string,
    partial: Partial<PlayerState>,
  ): Promise<void> {
    const key = this.key(tenantId, spaceId);
    const cached = this.local.get(`${key}:${userId}`);
    if (cached) {
      Object.assign(cached, partial);
      await this.redis.hset(key, userId, JSON.stringify(cached));
      return;
    }
    // Not local to this node (e.g. patch routed oddly): read-merge-write.
    const raw = await this.redis.hget(key, userId);
    if (!raw) return;
    const next = { ...(JSON.parse(raw) as PlayerState), ...partial };
    await this.redis.hset(key, userId, JSON.stringify(next));
  }
}
