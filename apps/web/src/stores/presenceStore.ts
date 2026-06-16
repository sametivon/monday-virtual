import { create } from 'zustand';
import type { AvatarAnimation, PlayerState, PlayerTickUpdate } from '@mvs/shared';

/**
 * Interpolation state per remote player. Lives OUTSIDE React state on purpose:
 * tick batches arrive at SERVER_TICK_HZ and must never re-render — remote
 * avatars read this map in useFrame and lerp current → target every frame.
 */
export interface RemoteTransform {
  current: { x: number; y: number; z: number; yaw: number };
  target: { x: number; y: number; z: number; yaw: number };
  animation: AvatarAnimation;
}

export const remoteTransforms = new Map<string, RemoteTransform>();

function initTransform(p: PlayerState): void {
  const t = {
    x: p.position[0],
    y: p.position[1],
    z: p.position[2],
    yaw: p.rotation,
  };
  remoteTransforms.set(p.userId, { current: { ...t }, target: { ...t }, animation: p.animation });
}

/** A reaction burst; `ts` keys the animation so repeats of the same emoji replay. */
export interface ReactionBurst {
  emoji: string;
  ts: number;
}

interface PresenceState {
  /** Reactive roster — changes only on join/leave/sync (drives the avatar list + HUD). */
  players: Record<string, PlayerState>;
  /** Raised hands by userId — includes the local user (server echoes back). */
  hands: Record<string, boolean>;
  /** Latest reaction burst by userId — includes the local user. */
  reactions: Record<string, ReactionBurst>;
  sync: (players: PlayerState[]) => void;
  upsert: (player: PlayerState) => void;
  applyTick: (updates: PlayerTickUpdate[]) => void;
  setHand: (userId: string, raised: boolean) => void;
  burst: (userId: string, emoji: string) => void;
  remove: (userId: string) => void;
  clear: () => void;
}

/** Remote players in the current space. The local avatar lives in playerStore. */
export const usePresenceStore = create<PresenceState>((set) => ({
  players: {},
  hands: {},
  reactions: {},
  sync: (players) => {
    remoteTransforms.clear();
    players.forEach(initTransform);
    set({
      players: Object.fromEntries(players.map((p) => [p.userId, p])),
      hands: Object.fromEntries(players.filter((p) => p.handRaised).map((p) => [p.userId, true])),
    });
  },
  upsert: (player) => {
    initTransform(player);
    set((s) => ({ players: { ...s.players, [player.userId]: player } }));
  },
  // Hot path: mutate interpolation targets only — no React state, no re-render.
  applyTick: (updates) => {
    for (const u of updates) {
      const t = remoteTransforms.get(u.userId);
      if (!t) continue;
      t.target.x = u.position[0];
      t.target.y = u.position[1];
      t.target.z = u.position[2];
      t.target.yaw = u.rotation;
      t.animation = u.animation;
    }
  },
  setHand: (userId, raised) =>
    set((s) => {
      const hands = { ...s.hands };
      if (raised) hands[userId] = true;
      else delete hands[userId];
      return { hands };
    }),
  burst: (userId, emoji) =>
    set((s) => ({ reactions: { ...s.reactions, [userId]: { emoji, ts: Date.now() } } })),
  remove: (userId) => {
    remoteTransforms.delete(userId);
    set((s) => {
      const players = { ...s.players };
      const hands = { ...s.hands };
      const reactions = { ...s.reactions };
      delete players[userId];
      delete hands[userId];
      delete reactions[userId];
      return { players, hands, reactions };
    });
  },
  clear: () => {
    remoteTransforms.clear();
    set({ players: {}, hands: {}, reactions: {} });
  },
}));
