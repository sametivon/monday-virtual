import { create } from 'zustand';
import { AvatarAnimation } from '@mvs/shared';

interface PlayerState {
  position: [number, number, number];
  rotation: number;
  animation: AvatarAnimation;
  /** Click-to-move destination on the ground plane (x, z), or null when idle. */
  target: [number, number] | null;
  set: (
    p: Partial<Pick<PlayerState, 'position' | 'rotation' | 'animation' | 'target'>>,
  ) => void;
}

/** The local avatar's transient transform, written by the controls each frame. */
export const usePlayerStore = create<PlayerState>((set) => ({
  position: [0, 0, 0],
  rotation: 0,
  animation: AvatarAnimation.IDLE,
  target: null,
  set: (p) => set(p),
}));
