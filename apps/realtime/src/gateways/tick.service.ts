import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Server } from 'socket.io';
import {
  PRESENCE_TTL_SECONDS,
  SERVER_AOI_MIN_PLAYERS,
  SERVER_TICK_HZ,
  room as roomKeys,
  type ClientToServerEvents,
  type PlayerTickUpdate,
  type ServerToClientEvents,
} from '@mvs/shared';
import { Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../common/redis.module';
import { cellCoord, neighborCells } from './aoi';
import { PresenceService } from './presence.service';

type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;

/**
 * Fixed server-tick rebroadcast (M3, ARCHITECTURE §8). Movement messages land
 * in an in-memory buffer (latest state wins per player); a SERVER_TICK_HZ loop
 * drains it per space room as ONE batched `players:tick` broadcast plus ONE
 * pipelined Redis flush — instead of a rebroadcast and two Redis round-trips
 * per message. Each node ticks for the players connected to it; the Socket.IO
 * Redis adapter carries the room broadcast to every node.
 */
@Injectable()
export class TickService implements OnModuleDestroy {
  private readonly logger = new Logger(TickService.name);
  private server: IoServer | null = null;
  private interval: NodeJS.Timeout | null = null;

  /** roomKey → userId → latest movement this tick (latest wins). */
  private readonly dirty = new Map<string, Map<string, PlayerTickUpdate>>();
  /** redis presence key per roomKey, captured at enqueue time. */
  private readonly redisKeys = new Map<string, string>();

  constructor(
    private readonly presence: PresenceService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Called by the gateway once the Socket.IO server exists. */
  start(server: IoServer): void {
    if (this.interval) return;
    this.server = server;
    this.interval = setInterval(() => void this.tick(), 1000 / SERVER_TICK_HZ);
    this.logger.log(`Tick loop started at ${SERVER_TICK_HZ}Hz`);
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  /** Buffer a movement update; it ships with the next tick. */
  enqueue(roomKey: string, presenceKey: string, update: PlayerTickUpdate): void {
    let room = this.dirty.get(roomKey);
    if (!room) {
      room = new Map();
      this.dirty.set(roomKey, room);
      this.redisKeys.set(roomKey, presenceKey);
    }
    room.set(update.userId, update);
  }

  /** Drop a player's pending update (disconnect mid-tick). */
  discard(roomKey: string, userId: string): void {
    this.dirty.get(roomKey)?.delete(userId);
  }

  private async tick(): Promise<void> {
    if (!this.server || this.dirty.size === 0) return;

    // Swap buffers first so new messages land in a fresh map while we flush.
    const batches = new Map(this.dirty);
    this.dirty.clear();

    const pipeline = this.redis.pipeline();
    for (const [roomKey, players] of batches) {
      const updates = [...players.values()];
      const presenceKey = this.redisKeys.get(roomKey);

      // Flush the moved players' authoritative state to Redis first, so the AOI
      // position read below (and other nodes) see this tick's positions.
      if (presenceKey) {
        this.presence.queueFlush(pipeline, presenceKey, updates);
        pipeline.expire(presenceKey, PRESENCE_TTL_SECONDS);
      }

      this.broadcast(roomKey, presenceKey, updates);
    }
    this.redisKeys.clear();

    try {
      await pipeline.exec();
    } catch (err) {
      this.logger.warn(`presence flush failed: ${(err as Error).message}`);
    }
  }

  /**
   * Ship a tick batch to a space. Two paths, both cross-node-correct (the
   * Socket.IO Redis adapter fans every room emit to subscribed sockets on every
   * node):
   *
   *  - Small spaces (< SERVER_AOI_MIN_PLAYERS local players): ONE room-wide
   *    `players:tick`. Cheapest when everyone is mutually interesting; clients
   *    still AOI-cull on render.
   *
   *  - Crowded spaces: spatial-cell interest management. Every socket subscribes
   *    to its current cell room (maintained by the gateway as players move). A
   *    mover at cell C is of interest to anyone in C's 3×3 block, so we emit its
   *    update to those 9 cell rooms. A recipient subscribes to exactly its own
   *    cell, so it receives each nearby mover exactly once — turning the
   *    O(players²) room broadcast into O(movers × 9 rooms). Because cell rooms
   *    are real Socket.IO rooms, this is correct ACROSS NODES with no manual
   *    position gathering: a recipient on node B near a mover on node A still
   *    gets the update via the adapter.
   *
   * The crowded-mode trigger uses this node's LOCAL count as the proxy for
   * "crowded". If a busy space is spread thin across many nodes, a node may see
   * few locals and pick the room-wide path — still correct, just less optimal.
   * The per-node optimum would need a global count read each tick (a Redis
   * round-trip we deliberately avoid on the hot path).
   */
  private broadcast(roomKey: string, presenceKey: string | undefined, updates: PlayerTickUpdate[]): void {
    if (!this.server) return;

    const localCount = presenceKey ? this.presence.localCountForKey(presenceKey) : 0;
    if (localCount < SERVER_AOI_MIN_PLAYERS) {
      this.server.to(roomKey).emit('players:tick', updates);
      return;
    }

    const tenantId = roomKey.slice(0, roomKey.indexOf(':'));
    const spaceId = roomKey.slice(roomKey.indexOf(':') + 1);

    // Group movers by destination cell room: each mover targets the 9 cells
    // around its own, batched so we emit once per occupied target room.
    const byRoom = new Map<string, PlayerTickUpdate[]>();
    for (const u of updates) {
      const [cx, cz] = cellCoord(u.position[0], u.position[2]);
      for (const [nx, nz] of neighborCells(cx, cz)) {
        const room = roomKeys.cell(tenantId, spaceId, nx, nz);
        const bucket = byRoom.get(room);
        if (bucket) bucket.push(u);
        else byRoom.set(room, [u]);
      }
    }
    for (const [room, slice] of byRoom) {
      this.server.to(room).emit('players:tick', slice);
    }
    this.logger.debug(`AOI ${roomKey}: ${updates.length} movers → ${byRoom.size} cell rooms`);
  }
}
