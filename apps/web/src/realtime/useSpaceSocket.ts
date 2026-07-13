'use client';

import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  MOVEMENT_SEND_HZ,
  type ChatSendPayload,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type WhiteboardDrawOp,
} from '@mvs/shared';
import { env } from '@/lib/env';
import { toast } from '@/ui/primitives';
import { api } from '@/lib/api';
import { useChatStore } from '@/stores/chatStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { usePlayerStore } from '@/stores/playerStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useSlideStore } from '@/stores/slideStore';
import { useWhiteboardStore } from '@/stores/whiteboardStore';

type SpaceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// The active socket, for senders outside React (chat panel). One per page.
let activeSocket: SpaceSocket | null = null;

export function sendChat(payload: ChatSendPayload): void {
  activeSocket?.emit('chat:send', payload);
}

export function sendReaction(emoji: string): void {
  activeSocket?.emit('reaction:send', { emoji });
}

export function sendHandRaise(raised: boolean): void {
  activeSocket?.emit('hand:raise', { raised });
}

/** Moderator-only: lower another user's raised hand (gated server-side). */
export function sendHandLower(targetUserId: string): void {
  activeSocket?.emit('hand:lower', { targetUserId });
}

/** Presenter-only: set the active slide on a deck-bound screen (gated server-side). */
export function sendSlideGoto(objectId: string, index: number): void {
  activeSocket?.emit('slide:goto', { objectId, index });
}

/** Apply locally (optimistic) and broadcast; the server excludes the sender. */
export function sendWhiteboardOp(objectId: string, op: WhiteboardDrawOp): void {
  useWhiteboardStore.getState().apply(objectId, op);
  activeSocket?.emit('whiteboard:op', { objectId, op });
}

// Test/debug hooks (dev only): let automated browser tests drive and inspect
// features without 3D picking, like window.__media.
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as unknown as { __whiteboard?: unknown }).__whiteboard = {
    send: sendWhiteboardOp,
    state: () => useWhiteboardStore.getState().boards,
  };
  (window as unknown as { __slides?: unknown }).__slides = {
    goto: (objectId: string, index: number) => {
      useSlideStore.getState().setIndex(objectId, index); // optimistic, like the UI
      sendSlideGoto(objectId, index);
    },
    index: (objectId: string) => useSlideStore.getState().index[objectId],
  };
  // __api is exposed from lib/api (available on every page, not just in-space).
  (window as unknown as { __presence?: unknown }).__presence = () =>
    usePresenceStore.getState().players;
  (window as unknown as { __player?: unknown }).__player = () => usePlayerStore.getState();
  (window as unknown as { __editor?: unknown }).__editor = {
    setEditing: (on: boolean) => useEditorStore.getState().setEditing(on),
    select: (id: string) => useEditorStore.getState().select(id),
    move: (x: number, z: number) => useEditorStore.getState().requestMove(x, z),
    state: () => {
      const s = useEditorStore.getState();
      return { editing: s.editing, selectedId: s.selectedId };
    },
  };
}

/**
 * Connects to the realtime state plane for one space: wires presence events
 * into presenceStore and emits the local avatar's transform at
 * MOVEMENT_SEND_HZ. Auth = the in-memory access token + the spaceId, both sent
 * in the handshake; the gateway derives tenant/permissions from the token.
 */
export function useSpaceSocket(spaceId: string) {
  const { sync, upsert, applyTick, remove, clear } = usePresenceStore();

  useEffect(() => {
    const token = api.token;
    if (!token) return;

    const socket: SpaceSocket = io(`${env.realtimeUrl}/space`, {
      transports: ['websocket'],
      // avatarConfig rides the handshake so others render the right model
      // (cosmetic and client-owned, so client-supplied is fine).
      auth: { token, spaceId, avatarConfig: useSessionStore.getState().me?.user.avatarConfig ?? {} },
    });

    activeSocket = socket;

    // ── Connection lifecycle → connectionStore (drives the reconnect banner).
    const conn = useConnectionStore.getState().set;
    socket.on('connect', () => {
      const wasReconnecting = useConnectionStore.getState().status === 'reconnecting';
      conn({ status: 'connected', attempt: 0, serverRestarting: false });
      if (wasReconnecting) toast.success('Back online');
    });
    socket.on('disconnect', () => {
      conn({ status: 'reconnecting' });
      // Presence is stale the moment we drop; the server sends a full
      // presence:sync on reconnect, so clearing here prevents ghost avatars.
      usePresenceStore.getState().clear();
    });
    socket.io.on('reconnect_attempt', (attempt) => conn({ status: 'reconnecting', attempt }));
    socket.io.on('reconnect_failed', () => conn({ status: 'offline' }));
    socket.on('connect_error', () => {
      if (useConnectionStore.getState().status === 'connecting') {
        conn({ status: 'reconnecting' });
      }
    });
    // Graceful deploy drain (C4): the server says "restart", the banner says
    // "Server updating…" instead of implying a network problem.
    socket.on('server:restarting', () => conn({ serverRestarting: true }));

    // Never accept ourselves as a remote player (defense in depth — the
    // server also excludes own sockets now, but an old server or a race
    // would otherwise spawn a ghost of yourself from a second tab).
    const myId = () => useSessionStore.getState().me?.user.id;
    socket.on('presence:sync', (players) => sync(players.filter((p) => p.userId !== myId())));
    socket.on('player:joined', (p) => {
      if (p.userId !== myId()) upsert(p);
    });
    socket.on('players:tick', applyTick);
    socket.on('player:left', remove);
    socket.on('chat:message', (message) => {
      const myUserId = useSessionStore.getState().me?.user.id;
      if (myUserId) useChatStore.getState().receive(message, myUserId);
    });
    socket.on('hand:raised', ({ userId, raised }) =>
      usePresenceStore.getState().setHand(userId, raised),
    );
    socket.on('reaction:burst', ({ userId, emoji }) =>
      usePresenceStore.getState().burst(userId, emoji),
    );
    socket.on('whiteboard:op', ({ objectId, op }) =>
      useWhiteboardStore.getState().apply(objectId, op),
    );
    socket.on('slide:goto', ({ objectId, index }) =>
      useSlideStore.getState().setIndex(objectId, index),
    );

    // Emit local movement on a fixed cadence (decoupled from render rate),
    // but only when something changed since the last send (M3 dirty check).
    let last = { x: NaN, y: NaN, z: NaN, rotation: NaN, animation: '' };
    const interval = setInterval(() => {
      const { position, rotation, animation } = usePlayerStore.getState();
      const [x, y, z] = position;
      if (
        x === last.x &&
        y === last.y &&
        z === last.z &&
        rotation === last.rotation &&
        animation === last.animation
      ) {
        return;
      }
      last = { x, y, z, rotation, animation };
      socket.emit('player:move', { position, rotation, animation });
    }, 1000 / MOVEMENT_SEND_HZ);

    return () => {
      clearInterval(interval);
      if (activeSocket === socket) activeSocket = null;
      socket.disconnect();
      useConnectionStore.getState().set({ status: 'connecting', attempt: 0, serverRestarting: false });
      clear();
      useChatStore.getState().reset();
      useSlideStore.getState().reset();
    };
  }, [spaceId, sync, upsert, applyTick, remove, clear]);
}
