'use client';

import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { WorldManifest } from '@mvs/shared';
import { usePlayerStore } from '@/stores/playerStore';

const FOCUS_HEIGHT = 1.4; // m — look at the avatar's chest, not its feet
const WALL_MARGIN = 0.6; // m — keep the camera this far inside each surface

// Module-level temps: no per-frame allocations.
const desired = new Vector3();
const offset = new Vector3();

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Third-person follow rig: glues the OrbitControls target to the avatar while
 * preserving whatever orbit angle/zoom the user has chosen, so drag-to-orbit
 * and scroll-to-zoom keep working while the camera tracks movement.
 *
 * The camera is also clamped to stay inside the room bounds — the walls are
 * single-sided (dollhouse trick), so without this, zooming out near a wall
 * pulls the camera outside the room and the view falls apart.
 */
export function CameraRig({
  bounds,
  ceiling,
}: {
  bounds: WorldManifest['scene']['bounds'];
  /** Interior wall height — the camera must stay under it. Above the (back-
   *  face-culled, invisible) ceiling plane, light fixtures appear to float
   *  over the floor — the long-mysterious "slab at spawn". */
  ceiling?: number;
}) {
  useFrame((state, delta) => {
    const controls = state.controls as unknown as {
      target: Vector3;
      update: () => void;
    } | null;
    if (!controls?.target) return;

    const [x, y, z] = usePlayerStore.getState().position;
    desired.set(x, y + FOCUS_HEIGHT, z);

    // Remember the user's current orbit offset, move the focus point, then
    // re-apply the offset — framerate-independent exponential smoothing.
    offset.copy(state.camera.position).sub(controls.target);
    controls.target.lerp(desired, 1 - Math.pow(0.0001, delta));
    state.camera.position.copy(controls.target).add(offset);

    // Keep the camera inside the room box (OrbitControls.update() re-derives
    // the orbit from this clamped position, so the zoom just stops at the wall).
    const [minX, , minZ] = bounds.min;
    const [maxX, maxY, maxZ] = bounds.max;
    const topY = ceiling ? Math.min(maxY, ceiling) - WALL_MARGIN : maxY - WALL_MARGIN;
    state.camera.position.set(
      clamp(state.camera.position.x, minX + WALL_MARGIN, maxX - WALL_MARGIN),
      clamp(state.camera.position.y, 0.5, topY),
      clamp(state.camera.position.z, minZ + WALL_MARGIN, maxZ - WALL_MARGIN),
    );
    controls.update();
  });

  return null;
}
