'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AvatarAnimation, inStageZone, type SceneConfig } from '@mvs/shared';
import { usePlayerStore } from '@/stores/playerStore';

const KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const SPEED = 4; // m/s
const RUN_MULT = 1.8;
const ARRIVE_RADIUS = 0.2; // m — close enough to a click-target to stop

/**
 * Local avatar controls (M2): WASD/arrows, Shift to run, click-to-move via
 * playerStore.target (set by the ground click handler), G to wave, X to
 * sit/stand. Writes transform + animation to playerStore each frame; the
 * networking layer samples that store at MOVEMENT_SEND_HZ.
 */
export function useLocalMovement(scene: SceneConfig) {
  const pressed = useRef<Set<string>>(new Set());
  const running = useRef(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return; // chat/admin inputs must never move the avatar
      if (e.code in KEYS) pressed.current.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') running.current = true;

      const store = usePlayerStore.getState();
      if (e.code === 'KeyG' && store.animation === AvatarAnimation.IDLE) {
        store.set({ animation: AvatarAnimation.WAVE, target: null });
      }
      if (e.code === 'KeyX') {
        store.set({
          animation:
            store.animation === AvatarAnimation.SIT ? AvatarAnimation.IDLE : AvatarAnimation.SIT,
          target: null,
        });
      }
    };
    const up = (e: KeyboardEvent) => {
      pressed.current.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') running.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((_, delta) => {
    const store = usePlayerStore.getState();

    // Direction from keys (normalized below)…
    let dx = 0;
    let dz = 0;
    for (const code of pressed.current) {
      const v = KEYS[code];
      if (v) {
        dx += v[0];
        dz += v[1];
      }
    }
    const hasKeys = dx !== 0 || dz !== 0;

    // Keyboard input always overrides a pending click-target.
    if (hasKeys && store.target) store.set({ target: null });

    let vx = 0;
    let vz = 0;
    let maxStep = Infinity;
    if (hasKeys) {
      const len = Math.hypot(dx, dz);
      vx = dx / len;
      vz = dz / len;
    } else if (store.target) {
      // …or steer toward the click-target.
      const tx = store.target[0] - store.position[0];
      const tz = store.target[1] - store.position[2];
      const dist = Math.hypot(tx, tz);
      if (dist <= ARRIVE_RADIUS) {
        store.set({ target: null, animation: AvatarAnimation.IDLE });
        return;
      }
      vx = tx / dist;
      vz = tz / dist;
      maxStep = dist; // never overshoot the target
    }

    if (vx === 0 && vz === 0) {
      // Only locomotion states decay to idle — never interrupt sit/wave.
      if (store.animation === AvatarAnimation.WALK || store.animation === AvatarAnimation.RUN) {
        store.set({ animation: AvatarAnimation.IDLE });
      }
      return;
    }

    const isRunning = running.current && hasKeys;
    const step = Math.min(SPEED * (isRunning ? RUN_MULT : 1) * delta, maxStep);
    const [x, , z] = store.position;
    const nx = clamp(x + vx * step, scene.bounds.min[0], scene.bounds.max[0]);
    const nz = clamp(z + vz * step, scene.bounds.min[2], scene.bounds.max[2]);
    // Step up onto the stage platform when inside its footprint.
    const ny =
      scene.stage && inStageZone(scene.stage, nx, nz)
        ? scene.stage.center[1] + scene.stage.height
        : 0;

    store.set({
      position: [nx, ny, nz],
      rotation: Math.atan2(vx, vz),
      animation: isRunning ? AvatarAnimation.RUN : AvatarAnimation.WALK,
    });
  });
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return Boolean(
    t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable),
  );
}
