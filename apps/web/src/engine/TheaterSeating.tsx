'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { AvatarAnimation, type SceneObjectDTO } from '@mvs/shared';
import { useEditorStore } from '@/stores/editorStore';
import { usePlayerStore } from '@/stores/playerStore';

/**
 * Instanced theater seating (S3): the auditorium's ~435 seats render as FIVE
 * InstancedMesh draw calls instead of ~2000 individual meshes. Each seat is
 * still a real SceneObject in the manifest — click-to-sit resolves the
 * instanceId back to its object and runs the exact interaction the regular
 * dispatcher would (sit pose + onInteract), so no logic changes hands.
 *
 * Edit-mode clicks still select the object (no per-seat gizmo — seats are
 * bulk-reseeded from the preset, not hand-arranged).
 */

interface PartSpec {
  size: [number, number, number];
  pos: [number, number, number];
  tiltX: number;
  paint: 'ink' | 'seat' | 'walnut';
  cast: boolean;
}

/** Keynote seat: ink pedestal, graphite cushion/back, walnut side panels. */
const PARTS: PartSpec[] = [
  { size: [0.5, 0.36, 0.5], pos: [0, 0.18, 0], tiltX: 0, paint: 'ink', cast: false },
  { size: [0.6, 0.14, 0.55], pos: [0, 0.44, 0.02], tiltX: 0, paint: 'seat', cast: false },
  { size: [0.6, 0.78, 0.16], pos: [0, 0.86, -0.26], tiltX: -0.12, paint: 'seat', cast: true },
  { size: [0.05, 0.5, 0.55], pos: [-0.325, 0.55, 0], tiltX: 0, paint: 'walnut', cast: false },
  { size: [0.05, 0.5, 0.55], pos: [0.325, 0.55, 0], tiltX: 0, paint: 'walnut', cast: false },
];

const PAINT_COLORS = { ink: '#2b2731', walnut: '#6b4f39' } as const;
const DEFAULT_SEAT = '#3d3844';

export function TheaterSeating({
  objects,
  onInteract,
}: {
  objects: SceneObjectDTO[];
  onInteract: (id: string) => void;
}) {
  const refs = useRef<(InstancedMesh | null)[]>([]);

  // One matrix per seat per part, composed seat-world × part-local.
  const matrices = useMemo(() => {
    const seatM = new Matrix4();
    const partM = new Matrix4();
    const one = new Vector3(1, 1, 1);
    const q = new Quaternion();
    return PARTS.map((part) => {
      partM.compose(
        new Vector3(...part.pos),
        new Quaternion().setFromEuler(new Euler(part.tiltX, 0, 0)),
        one,
      );
      return objects.map((o) => {
        const { position, rotation, scale } = o.transform;
        seatM.compose(
          new Vector3(...position),
          q.setFromEuler(new Euler(0, rotation[1], 0)),
          new Vector3(...scale),
        );
        return seatM.clone().multiply(partM);
      });
    });
  }, [objects]);

  useLayoutEffect(() => {
    PARTS.forEach((part, pi) => {
      const mesh = refs.current[pi];
      if (!mesh) return;
      const color = new Color();
      objects.forEach((o, i) => {
        mesh.setMatrixAt(i, matrices[pi]![i]!);
        if (part.paint === 'seat') {
          color.set((o.config as { color?: string }).color ?? DEFAULT_SEAT);
          mesh.setColorAt(i, color);
        }
      });
      mesh.count = objects.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [objects, matrices]);

  const click = (instanceId: number | undefined) => {
    if (instanceId === undefined) return;
    const object = objects[instanceId];
    if (!object) return;
    if (useEditorStore.getState().editing) {
      useEditorStore.getState().select(object.id);
      return;
    }
    const { position, rotation } = object.transform;
    const sitRotation = (object.config as { sitRotation?: number }).sitRotation ?? rotation[1];
    usePlayerStore.getState().set({
      position: [position[0], position[1], position[2]],
      rotation: sitRotation,
      animation: AvatarAnimation.SIT,
      target: null,
    });
    onInteract(object.id);
  };

  if (objects.length === 0) return null;

  return (
    <group>
      {PARTS.map((part, pi) => (
        <instancedMesh
          key={pi}
          ref={(m) => {
            refs.current[pi] = m;
          }}
          args={[undefined, undefined, objects.length]}
          castShadow={part.cast}
          receiveShadow={false}
          onClick={(e) => {
            e.stopPropagation();
            click(e.instanceId);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'default';
          }}
        >
          <boxGeometry args={part.size} />
          {part.paint === 'seat' ? (
            <meshStandardMaterial roughness={0.95} />
          ) : (
            <meshStandardMaterial color={PAINT_COLORS[part.paint]} roughness={part.paint === 'walnut' ? 0.65 : 0.75} />
          )}
        </instancedMesh>
      ))}
    </group>
  );
}
