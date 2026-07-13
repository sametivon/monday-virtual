'use client';

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Color, Mesh, MeshStandardMaterial, Vector3 } from 'three';

/**
 * GLTF prop renderer (B6): drops a CC0 model (Kenney furniture kit, served
 * from our own origin — never a runtime CDN) where a procedural primitive
 * used to be. The mesh is normalized so callers think in product terms:
 * "a chair 0.9m tall", not "whatever scale the source file happens to use".
 */
export interface ModelSpec {
  url: string;
  /** Uniform scale target: the model stands exactly this tall (meters). */
  height: number;
  /** Optional XZ-only stretch so the footprint hits this width (meters). */
  footprint?: number;
  /** Yaw offset (radians) when the source model faces the wrong way. */
  yaw?: number;
  /**
   * Material-name → hex overrides: Kenney's stock colors are toy-bright
   * (salmon cushions, neon leaves) — retint them into the scene palette.
   */
  tints?: Record<string, string>;
}

export function ModelObject({ spec }: { spec: ModelSpec }) {
  const { scene } = useGLTF(spec.url);

  // useGLTF caches one scene per URL; every placed object needs its own copy.
  // Static furniture has no skeletons, so a plain deep clone is enough.
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        // clone(true) shares materials with the cached original — clone
        // before tinting so other users of the same GLB stay stock.
        const mat = node.material;
        if (mat instanceof MeshStandardMaterial && spec.tints?.[mat.name]) {
          const tinted = mat.clone();
          tinted.color = new Color(spec.tints[mat.name]);
          node.material = tinted;
        }
      }
    });
    return clone;
  }, [scene, spec.tints]);

  // Normalize: floor at y=0, centered on XZ, scaled to the spec's height.
  // Offset lives in model units — the scaled group multiplies it back out.
  const { scale, xz, offset } = useMemo(() => {
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const s = spec.height / (size.y || 1);
    const width = Math.max(size.x, size.z) * s;
    return {
      scale: s,
      xz: spec.footprint ? spec.footprint / (width || 1) : 1,
      offset: [-center.x, -box.min.y, -center.z] as [number, number, number],
    };
  }, [model, spec.height, spec.footprint]);

  return (
    <group rotation={[0, spec.yaw ?? 0, 0]} scale={[scale * xz, scale, scale * xz]}>
      <primitive object={model} position={offset} />
    </group>
  );
}

useGLTF.preload('/models/chairDesk.glb');
useGLTF.preload('/models/desk.glb');
useGLTF.preload('/models/pottedPlant.glb');
