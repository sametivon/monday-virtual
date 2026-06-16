import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  ChatSendPayloadSchema,
  HandLowerPayloadSchema,
  HandRaisePayloadSchema,
  PlayerMovePayloadSchema,
  PlayerStatusPayloadSchema,
  ReactionPayloadSchema,
  SlideControlPayloadSchema,
  WhiteboardOpPayloadSchema,
  hasPermission,
  OCCUPANCY_SAMPLE_INTERVAL_MS,
  Permission,
  room as roomKeys,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketAuthData,
} from '@mvs/shared';
import type { Env } from '../config/env';
import { randomUUID } from 'node:crypto';
import { authenticateSocket } from './ws-auth';
import { cellCoord } from './aoi';
import { AnalyticsService } from './analytics.service';
import { AttendanceService } from './attendance.service';
import { ChatService } from './chat.service';
import { OccupancyService } from './occupancy.service';
import { PresenceService } from './presence.service';
import { TickService } from './tick.service';
import { WhiteboardService } from './whiteboard.service';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents> & {
  data: SocketAuthData;
  /** Wall-clock join time (analytics session duration). */
  joinedAt?: number;
  /** Current AOI cell room name this socket is subscribed to (cross-node interest). */
  cellRoom?: string;
};

/**
 * The state plane. One namespace `/space`; clients are placed in a
 * tenant-scoped room `${tenantId}:${spaceId}`, so all broadcasts are naturally
 * isolated per tenant + space. Media (voice/video/screen) is NOT here — that's
 * LiveKit. This gateway carries presence, movement, chat, reactions, hands.
 *
 * Movement is NOT rebroadcast per message: it lands in the TickService buffer
 * and ships as one `players:tick` batch per space at SERVER_TICK_HZ (M3).
 */
@WebSocketGateway({ namespace: '/space' })
export class SpaceGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(SpaceGateway.name);
  private occupancyTimer: NodeJS.Timeout | null = null;

  @WebSocketServer()
  server!: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    private readonly presence: PresenceService,
    private readonly tick: TickService,
    private readonly chat: ChatService,
    private readonly whiteboard: WhiteboardService,
    private readonly analytics: AnalyticsService,
    private readonly attendance: AttendanceService,
    private readonly occupancy: OccupancyService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  afterInit(server: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.tick.start(server);
    // Occupancy heatmap: snapshot where players stand on a slow timer (NOT the
    // movement hot path) and write one compact AnalyticsEvent per occupied
    // space. Cadence is overridable via OCCUPANCY_SAMPLE_MS (tests/load runs).
    const interval =
      this.config.get('OCCUPANCY_SAMPLE_MS', { infer: true }) ?? OCCUPANCY_SAMPLE_INTERVAL_MS;
    this.occupancyTimer = setInterval(() => this.occupancy.sample(), interval);
  }

  onModuleDestroy(): void {
    if (this.occupancyTimer) clearInterval(this.occupancyTimer);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const auth = authenticateSocket(client, this.config.get('JWT_SECRET', { infer: true }));
      if (!hasPermission(auth.permissions, Permission.PRESENCE_JOIN)) {
        throw new Error('Not allowed to join presence');
      }
      (client as AppSocket).data = auth;

      const roomKey = roomKeys.space(auth.tenantId, auth.spaceId);
      await client.join(roomKey);
      await client.join(roomKeys.user(auth.tenantId, auth.userId)); // for DMs
      await client.join(roomKeys.tenant(auth.tenantId)); // for GLOBAL chat
      // Spatial AOI: join the spawn cell room. Sockets always maintain cell
      // membership; the tick loop only USES it for crowded spaces (cross-node
      // interest management). Spawn is [0,0,0] → cell (0,0).
      const [scx, scz] = cellCoord(0, 0);
      const cellRoom = roomKeys.cell(auth.tenantId, auth.spaceId, scx, scz);
      await client.join(cellRoom);
      (client as AppSocket).cellRoom = cellRoom;

      const avatarConfig =
        (client.handshake.auth as { avatarConfig?: unknown }).avatarConfig ?? {};
      const state = await this.presence.join(auth, avatarConfig, [0, 0, 0]);
      const others = (await this.presence.list(auth.tenantId, auth.spaceId)).filter(
        (p) => p.userId !== auth.userId,
      );

      client.emit('presence:sync', others);
      client.to(roomKey).emit('player:joined', state);
      this.logger.log(`${auth.name} joined ${roomKey}`);

      // Analytics: stamp join time on the socket so disconnect can report the
      // session duration (active-time + occupancy metrics).
      (client as AppSocket).joinedAt = Date.now();
      this.analytics.track(auth.tenantId, 'space_join', {
        userId: auth.userId,
        spaceId: auth.spaceId,
      });
      // Auto-mark attendance if a LIVE event is bound to this space.
      this.attendance.mark(auth.tenantId, auth.spaceId, auth.userId);
    } catch (err) {
      client.emit('error', { code: 'AUTH', message: (err as Error).message });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const auth = (client as AppSocket).data;
    if (!auth) return;
    this.tick.discard(roomKeys.space(auth.tenantId, auth.spaceId), auth.userId);
    await this.presence.leave(auth.tenantId, auth.spaceId, auth.userId);
    this.server.to(roomKeys.space(auth.tenantId, auth.spaceId)).emit('player:left', auth.userId);

    const joinedAt = (client as AppSocket).joinedAt;
    this.analytics.track(auth.tenantId, 'space_leave', {
      userId: auth.userId,
      spaceId: auth.spaceId,
      payload: joinedAt ? { durationSeconds: Math.round((Date.now() - joinedAt) / 1000) } : undefined,
    });
  }

  @SubscribeMessage('player:move')
  onMove(@ConnectedSocket() client: AppSocket, @MessageBody() body: unknown): void {
    const auth = client.data;
    const parsed = PlayerMovePayloadSchema.safeParse(body);
    if (!parsed.success) return;
    const { position, rotation, animation } = parsed.data;
    // Buffered, not broadcast — the tick loop batches it (latest wins).
    this.tick.enqueue(
      roomKeys.space(auth.tenantId, auth.spaceId),
      this.presence.key(auth.tenantId, auth.spaceId),
      { userId: auth.userId, position, rotation, animation },
    );

    // Keep the socket's AOI cell-room membership current. Crossing a cell
    // boundary (every AOI_CELL_SIZE metres) swaps rooms so cross-node interest
    // emits keep reaching it. No-op while inside the same cell — boundary
    // crossings are rare relative to the move rate, so this is cheap.
    const [cx, cz] = cellCoord(position[0], position[2]);
    const nextCell = roomKeys.cell(auth.tenantId, auth.spaceId, cx, cz);
    if (client.cellRoom !== nextCell) {
      const prev = client.cellRoom;
      client.cellRoom = nextCell;
      if (prev) void client.leave(prev);
      void client.join(nextCell);
    }
  }

  @SubscribeMessage('player:status')
  async onStatus(@ConnectedSocket() client: AppSocket, @MessageBody() body: unknown): Promise<void> {
    const auth = client.data;
    const parsed = PlayerStatusPayloadSchema.safeParse(body);
    if (!parsed.success) return;
    await this.presence.patch(auth.tenantId, auth.spaceId, auth.userId, { status: parsed.data.status });
    this.server
      .to(roomKeys.space(auth.tenantId, auth.spaceId))
      .emit('player:status', { userId: auth.userId, status: parsed.data.status });
  }

  @SubscribeMessage('chat:send')
  onChat(@ConnectedSocket() client: AppSocket, @MessageBody() body: unknown): void {
    const auth = client.data;
    if (!hasPermission(auth.permissions, Permission.CHAT_SEND)) return;
    const parsed = ChatSendPayloadSchema.safeParse(body);
    if (!parsed.success) return;
    const { scope, body: text, mentions, toUserId } = parsed.data;
    if (scope === 'DIRECT' && !toUserId) return;

    const message = {
      id: randomUUID(),
      scope,
      spaceId: scope === 'ROOM' ? auth.spaceId : null,
      fromUserId: auth.userId,
      fromName: auth.name,
      toUserId: toUserId ?? null,
      body: text,
      mentions,
      createdAt: new Date().toISOString(),
    };

    // Route by scope: DM → both user rooms; ROOM → this space; GLOBAL → tenant.
    if (scope === 'DIRECT' && toUserId) {
      this.server.to(roomKeys.user(auth.tenantId, toUserId)).emit('chat:message', message);
      client.emit('chat:message', message);
    } else if (scope === 'ROOM') {
      this.server.to(roomKeys.space(auth.tenantId, auth.spaceId)).emit('chat:message', message);
    } else {
      this.server.to(roomKeys.tenant(auth.tenantId)).emit('chat:message', message);
    }

    this.chat.persist(auth.tenantId, message); // fire-and-forget
    this.analytics.track(auth.tenantId, 'chat_send', {
      userId: auth.userId,
      spaceId: scope === 'ROOM' ? auth.spaceId : undefined,
      payload: { scope },
    });
  }

  @SubscribeMessage('reaction:send')
  onReaction(@ConnectedSocket() client: AppSocket, @MessageBody() body: unknown): void {
    const auth = client.data;
    const parsed = ReactionPayloadSchema.safeParse(body);
    if (!parsed.success) return;
    this.server
      .to(roomKeys.space(auth.tenantId, auth.spaceId))
      .emit('reaction:burst', { userId: auth.userId, emoji: parsed.data.emoji });
    this.analytics.track(auth.tenantId, 'reaction', {
      userId: auth.userId,
      spaceId: auth.spaceId,
      payload: { emoji: parsed.data.emoji },
    });
  }

  @SubscribeMessage('whiteboard:op')
  onWhiteboardOp(@ConnectedSocket() client: AppSocket, @MessageBody() body: unknown): void {
    const auth = client.data;
    if (!hasPermission(auth.permissions, Permission.WHITEBOARD_EDIT)) return;
    const parsed = WhiteboardOpPayloadSchema.safeParse(body);
    if (!parsed.success) return;
    // Exclude the sender — it applied the op optimistically when drawing.
    client
      .to(roomKeys.space(auth.tenantId, auth.spaceId))
      .emit('whiteboard:op', { ...parsed.data, fromUserId: auth.userId });
    this.whiteboard.persist(auth.tenantId, parsed.data.objectId, auth.userId, parsed.data.op);
  }

  @SubscribeMessage('hand:raise')
  async onHand(@ConnectedSocket() client: AppSocket, @MessageBody() body: unknown): Promise<void> {
    const auth = client.data;
    const parsed = HandRaisePayloadSchema.safeParse(body);
    if (!parsed.success) return;
    await this.presence.patch(auth.tenantId, auth.spaceId, auth.userId, {
      handRaised: parsed.data.raised,
    });
    this.server
      .to(roomKeys.space(auth.tenantId, auth.spaceId))
      .emit('hand:raised', { userId: auth.userId, raised: parsed.data.raised });
    if (parsed.data.raised) {
      this.analytics.track(auth.tenantId, 'hand_raise', { userId: auth.userId, spaceId: auth.spaceId });
    }
  }

  @SubscribeMessage('slide:goto')
  onSlideGoto(@ConnectedSocket() client: AppSocket, @MessageBody() body: unknown): void {
    const auth = client.data;
    if (!hasPermission(auth.permissions, Permission.PRESENT)) return;
    const parsed = SlideControlPayloadSchema.safeParse(body);
    if (!parsed.success) return;
    // Broadcast to everyone (presenter included, so a second presenter device
    // stays in sync). Late joiners read the persisted index from the object
    // config in the manifest; live changes flow here.
    this.server
      .to(roomKeys.space(auth.tenantId, auth.spaceId))
      .emit('slide:goto', parsed.data);
  }

  @SubscribeMessage('hand:lower')
  async onHandLower(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const auth = client.data;
    // Lowering someone else's hand is a moderator action; raising/lowering your
    // own goes through hand:raise. MEDIA_MODERATE = "mute others / manage room".
    if (!hasPermission(auth.permissions, Permission.MEDIA_MODERATE)) return;
    const parsed = HandLowerPayloadSchema.safeParse(body);
    if (!parsed.success) return;
    await this.presence.patch(auth.tenantId, auth.spaceId, parsed.data.targetUserId, {
      handRaised: false,
    });
    this.server
      .to(roomKeys.space(auth.tenantId, auth.spaceId))
      .emit('hand:raised', { userId: parsed.data.targetUserId, raised: false });
  }
}
