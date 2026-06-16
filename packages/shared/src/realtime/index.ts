/**
 * Socket.IO event contracts (state plane). Both the realtime gateway and the
 * web client import these typed maps so payloads can never drift. Use with
 * `Server<ClientToServerEvents, ServerToClientEvents>` on the server and
 * `Socket<ServerToClientEvents, ClientToServerEvents>` on the client.
 */

import { z } from 'zod';
import { AvatarAnimation, ChatScope, UserPresenceStatus } from '../enums';
import { Vec3Schema } from '../scene/index';

// ── Wire payloads (validated server-side with zod) ─────────────────────────

export const PlayerMovePayloadSchema = z.object({
  position: Vec3Schema,
  rotation: z.number(), // yaw radians
  animation: z.nativeEnum(AvatarAnimation),
});
export type PlayerMovePayload = z.infer<typeof PlayerMovePayloadSchema>;

export const PlayerStatusPayloadSchema = z.object({
  status: z.nativeEnum(UserPresenceStatus),
});
export type PlayerStatusPayload = z.infer<typeof PlayerStatusPayloadSchema>;

export const ChatSendPayloadSchema = z.object({
  scope: z.nativeEnum(ChatScope),
  spaceId: z.string().optional(),
  toUserId: z.string().optional(), // required when scope === DIRECT
  body: z.string().min(1).max(4000),
  mentions: z.array(z.string()).optional(),
});
export type ChatSendPayload = z.infer<typeof ChatSendPayloadSchema>;

/** Query for paginated chat history (REST, control plane). */
export const ChatHistoryQuerySchema = z.object({
  scope: z.nativeEnum(ChatScope),
  spaceId: z.string().optional(), // required for ROOM
  withUserId: z.string().optional(), // required for DIRECT
  before: z.string().datetime().optional(), // cursor: createdAt of oldest loaded
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ChatHistoryQuery = z.infer<typeof ChatHistoryQuerySchema>;

export const ReactionPayloadSchema = z.object({
  emoji: z.string().min(1).max(16),
});
export type ReactionPayload = z.infer<typeof ReactionPayloadSchema>;

export const HandRaisePayloadSchema = z.object({
  raised: z.boolean(),
});
export type HandRaisePayload = z.infer<typeof HandRaisePayloadSchema>;

/** Moderator action: force another user's raised hand down. */
export const HandLowerPayloadSchema = z.object({
  targetUserId: z.string(),
});
export type HandLowerPayload = z.infer<typeof HandLowerPayloadSchema>;

/**
 * Whiteboard drawing ops (Phase 2). Append-only and idempotent by `id`:
 * replaying the op log in order materializes the board, so there's no merge
 * conflict to resolve — erase/clear simply tombstone earlier ops. Coordinates
 * are normalized 0..1 against the board's logical surface.
 */
export const WhiteboardDrawOpSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stroke'),
    id: z.string().max(40),
    color: z.string().max(16),
    /** Brush size relative to board width (e.g. 0.003). */
    size: z.number().positive().max(0.1),
    points: z.array(z.tuple([z.number(), z.number()])).min(2).max(1500),
  }),
  z.object({
    kind: z.literal('sticky'),
    id: z.string().max(40),
    x: z.number(),
    y: z.number(),
    color: z.string().max(16),
    text: z.string().min(1).max(300),
  }),
  z.object({
    kind: z.literal('shape'),
    id: z.string().max(40),
    shape: z.enum(['rect', 'ellipse', 'line', 'arrow']),
    color: z.string().max(16),
    /** Outline width relative to board width (e.g. 0.004). */
    size: z.number().positive().max(0.1),
    /** Whether rect/ellipse are filled (ignored for line/arrow). */
    filled: z.boolean().default(false),
    /** Normalized 0..1 bounding endpoints (rect/ellipse corners; line/arrow ends). */
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
  }),
  z.object({
    kind: z.literal('text'),
    id: z.string().max(40),
    x: z.number(),
    y: z.number(),
    color: z.string().max(16),
    /** Font size relative to board width (e.g. 0.025). */
    size: z.number().positive().max(0.2),
    text: z.string().min(1).max(300),
  }),
  z.object({ kind: z.literal('erase'), id: z.string().max(40), targetId: z.string().max(40) }),
  z.object({ kind: z.literal('clear'), id: z.string().max(40) }),
]);
export type WhiteboardDrawOp = z.infer<typeof WhiteboardDrawOpSchema>;

export const WhiteboardOpPayloadSchema = z.object({
  objectId: z.string(),
  op: WhiteboardDrawOpSchema,
});
export type WhiteboardOpPayload = z.infer<typeof WhiteboardOpPayloadSchema>;

export const ObjectInteractPayloadSchema = z.object({
  objectId: z.string(),
});
export type ObjectInteractPayload = z.infer<typeof ObjectInteractPayloadSchema>;

/** Presenter advances/sets the active slide on a deck-bound screen object. */
export const SlideControlPayloadSchema = z.object({
  objectId: z.string(),
  index: z.number().int().min(0).max(500),
});
export type SlideControlPayload = z.infer<typeof SlideControlPayloadSchema>;

// ── Broadcast shapes ───────────────────────────────────────────────────────

export interface PlayerState {
  userId: string;
  name: string;
  avatarConfig: unknown;
  company?: string | null;
  jobTitle?: string | null;
  position: [number, number, number];
  rotation: number;
  animation: AvatarAnimation;
  status: UserPresenceStatus;
  handRaised?: boolean;
}

/** One player's movement inside a server-tick batch. */
export interface PlayerTickUpdate {
  userId: string;
  position: [number, number, number];
  rotation: number;
  animation: AvatarAnimation;
}

export interface ChatMessageBroadcast {
  id: string;
  scope: ChatScope;
  spaceId?: string | null;
  fromUserId: string;
  fromName: string;
  toUserId?: string | null;
  body: string;
  mentions?: string[];
  createdAt: string; // ISO
}

// ── Typed event maps ───────────────────────────────────────────────────────

export interface ClientToServerEvents {
  'player:move': (p: PlayerMovePayload) => void;
  'player:status': (p: PlayerStatusPayload) => void;
  'chat:send': (p: ChatSendPayload) => void;
  'reaction:send': (p: ReactionPayload) => void;
  'hand:raise': (p: HandRaisePayload) => void;
  'hand:lower': (p: HandLowerPayload) => void;
  'whiteboard:op': (p: WhiteboardOpPayload) => void;
  'object:interact': (p: ObjectInteractPayload) => void;
  'slide:goto': (p: SlideControlPayload) => void;
}

export interface ServerToClientEvents {
  'presence:sync': (players: PlayerState[]) => void;
  'player:joined': (player: PlayerState) => void;
  'player:left': (userId: string) => void;
  /** Batched movement for the whole space, sent at SERVER_TICK_HZ (M3). */
  'players:tick': (updates: PlayerTickUpdate[]) => void;
  'player:status': (update: { userId: string; status: UserPresenceStatus }) => void;
  'chat:message': (message: ChatMessageBroadcast) => void;
  'reaction:burst': (r: { userId: string; emoji: string }) => void;
  'hand:raised': (r: { userId: string; raised: boolean }) => void;
  'whiteboard:op': (p: WhiteboardOpPayload & { fromUserId: string }) => void;
  'whiteboard:snapshot': (p: { objectId: string; snapshot: unknown }) => void;
  'object:opened': (p: { objectId: string; data?: unknown }) => void;
  /** Broadcast active slide index for a deck-bound screen (late joiners get it via presence:sync of the object config). */
  'slide:goto': (p: SlideControlPayload) => void;
  error: (e: { code: string; message: string }) => void;
}

/** Data attached to each authenticated socket by the auth middleware. */
export interface SocketAuthData {
  userId: string;
  tenantId: string;
  spaceId: string;
  name: string;
  permissions: string[];
}

/** Socket.IO room key helpers — keeps namespacing consistent and tenant-safe. */
export const room = {
  tenant: (tenantId: string) => `${tenantId}:tenant`,
  space: (tenantId: string, spaceId: string) => `${tenantId}:${spaceId}`,
  table: (tenantId: string, spaceId: string, roomKey: string) =>
    `${tenantId}:${spaceId}:table:${roomKey}`,
  user: (tenantId: string, userId: string) => `${tenantId}:user:${userId}`,
  /** Spatial-AOI cell room: sockets join their current cell; movers emit to the
   * 3×3 block around them. Cross-node interest management (Phase-3 scale). */
  cell: (tenantId: string, spaceId: string, cx: number, cz: number) =>
    `${tenantId}:${spaceId}:cell:${cx}:${cz}`,
};

/** Movement send rate the client should not exceed (Hz) and server tick (Hz). */
export const MOVEMENT_SEND_HZ = 12;
export const SERVER_TICK_HZ = 10;

/**
 * Area-of-interest radius (m): clients skip rendering/interpolating players
 * beyond this distance. Also the radius for server-side cell-based interest
 * management (Phase-3 scale-hardening): a player's tick batch is restricted to
 * the players within their AOI, computed from a uniform spatial grid so it
 * stays O(occupied cells) rather than O(players²). Below SERVER_AOI_MIN_PLAYERS
 * the whole-space batch is cheaper than the bookkeeping, so culling is skipped.
 */
export const AOI_RADIUS = 35;

/** Side of a spatial-hash cell (m) for server-side AOI. ≥ AOI_RADIUS so a
 * player's interest set is its own cell plus the 8 neighbours (3×3 block). */
export const AOI_CELL_SIZE = 35;

/** Per-space player count below which server-side AOI culling is skipped. */
export const SERVER_AOI_MIN_PLAYERS = 30;

/** Presence hashes expire after this long without a tick flush (ghost reaping). */
export const PRESENCE_TTL_SECONDS = 300;

/** Heatmap grid resolution (cells per axis) and how often the tick loop samples
 * occupancy into the AnalyticsEvent stream (low frequency — it is a snapshot,
 * not a hot-path write). */
export const HEATMAP_GRID = 24;
export const OCCUPANCY_SAMPLE_INTERVAL_MS = 30_000;
