'use client';

import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { usePlayerStore } from '@/stores/playerStore';

const FOCUS_HEIGHT = 1.4; // m — look at the avatar's chest, not its feet

// Module-level temps: no per-frame allocations.
const desired = new Vector3();
const offset = new Vector3();

/**
 * Third-person follow rig: glues the OrbitControls target to the avatar while
 * preserving whatever orbit angle/zoom the user has chosen, so drag-to-orbit
 * and scroll-to-zoom keep working while the camera tracks movement.
 */
export function CameraRig() {
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
    controls.update();
  });

  return null;
}
