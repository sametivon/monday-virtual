'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AvatarAnimation, bowlHeight, inStageZone, type SceneConfig } from '@mvs/shared';
import { usePlayerStore } from '@/stores/playerStore';
import { seatRegistry } from './seatRegistry';

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

const TURN_ALPHA_BASE = 0.0001; // yaw smoothing half-life (framerate-independent)

/**
 * Local avatar controls (M2): WASD/arrows, Shift to run, click-to-move via
 * playerStore.target (set by the ground click handler), G to wave, X to
 * sit/stand. Writes transform + animation to playerStore each frame; the
 * networking layer samples that store at MOVEMENT_SEND_HZ.
 *
 * Movement is CAMERA-RELATIVE (W walks away from the camera, like
 * Gather/eXp) and the avatar turns smoothly toward its heading instead of
 * snapping. Runs at useFrame priority -3 so the camera rig (-1) and
 * billboards (0) read a settled position.
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
        if (store.animation === AvatarAnimation.SIT) {
          store.set({ animation: AvatarAnimation.IDLE, target: null });
        } else {
          // Snap onto the nearest chair within reach — X in a seat row used
          // to sit you in mid-air between two seats.
          const [px, , pz] = store.position;
          let best: (typeof seatRegistry.seats)[number] | null = null;
          let bestD = 1.3 * 1.3;
          for (const seat of seatRegistry.seats) {
            const d = (seat.x - px) ** 2 + (seat.z - pz) ** 2;
            if (d < bestD) {
              bestD = d;
              best = seat;
            }
          }
          store.set({
            ...(best ? { position: [best.x, best.y, best.z] as [number, number, number], rotation: best.yaw } : {}),
            animation: AvatarAnimation.SIT,
            target: null,
          });
        }
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

  useFrame((state, delta) => {
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
    let hasKeys = dx !== 0 || dz !== 0;

    // Camera-relative input: rotate the key vector by the camera's yaw so W
    // always walks AWAY from the camera, whatever orbit the user chose.
    if (hasKeys) {
      const camYaw = Math.atan2(
        store.position[0] - state.camera.position.x,
        store.position[2] - state.camera.position.z,
      );
      const cos = Math.cos(camYaw);
      const sin = Math.sin(camYaw);
      // out = (−dz)·forward(θ) + dx·right(θ), with forward(θ)=(sinθ,cosθ)
      // and right(θ)=forward(θ−π/2). At the default behind-avatar view
      // (θ=π) this reproduces the old world mapping exactly: W→(0,−1), D→(1,0).
      const rx = -dz * sin - dx * cos;
      const rz = -dz * cos + dx * sin;
      dx = rx;
      dz = rz;
      hasKeys = dx !== 0 || dz !== 0;
    }

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
    // Floor height: the stage platform inside its footprint, otherwise the
    // raked amphitheater terraces (so you walk up/down the steps), else ground.
    const ny =
      scene.stage && inStageZone(scene.stage, nx, nz)
        ? scene.stage.center[1] + scene.stage.height
        : scene.amphitheater
          ? bowlHeight(scene.amphitheater, nx, nz)
          : 0;

    // Turn smoothly toward the heading (snapping reads twitchy). Movement
    // itself stays crisp — only the yaw eases.
    const targetYaw = Math.atan2(vx, vz);
    const alpha = 1 - Math.pow(TURN_ALPHA_BASE, delta);
    const rotation = store.rotation + shortestArc(targetYaw - store.rotation) * alpha;

    store.set({
      position: [nx, ny, nz],
      rotation,
      animation: isRunning ? AvatarAnimation.RUN : AvatarAnimation.WALK,
    });
  }, -3);
}

/** Wrap an angle delta to [-π, π] so yaw lerps take the short way around. */
function shortestArc(delta: number): number {
  return ((delta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
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
