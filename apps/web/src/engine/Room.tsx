'use client';

import { useMemo } from 'react';
import type { InteriorConfig, SceneConfig } from '@mvs/shared';
import { usePlayerStore } from '@/stores/playerStore';
import { onFloorClick } from './floorClick';
import { useHexCarpetTexture, useTiledPbr } from './materials';

/**
 * Enclosed themed interior (Phase 2 visual overhaul): textured floor, walls
 * with acoustic panels and a glowing base trim, a ceiling with warm light
 * panels, and corner greenery. Replaces the infinite-grid void whenever the
 * scene config declares `environment.interior`. Everything is data-driven —
 * colors, floor finish, and wall height come from the scene config so the
 * scene editor (and white-labeling) can restyle rooms without code.
 */
export function Room({
  bounds,
  interior,
}: {
  bounds: SceneConfig['bounds'];
  interior: InteriorConfig;
}) {
  const width = bounds.max[0] - bounds.min[0];
  const depth = bounds.max[2] - bounds.min[2];
  const cx = (bounds.max[0] + bounds.min[0]) / 2;
  const cz = (bounds.max[2] + bounds.min[2]) / 2;
  const H = interior.wallHeight;

  return (
    <group position={[cx, 0, cz]}>
      <Floor width={width} depth={depth} interior={interior} />
      <Walls width={width} depth={depth} interior={interior} />
      <Ceiling width={width} depth={depth} interior={interior} />
      {interior.plants &&
        [
          [-width / 2 + 1.4, -depth / 2 + 1.4],
          [width / 2 - 1.4, -depth / 2 + 1.4],
          [-width / 2 + 1.4, depth / 2 - 1.4],
          [width / 2 - 1.4, depth / 2 - 1.4],
        ].map(([x, z]) => <Plant key={`${x}:${z}`} position={[x!, 0, z!]} />)}
      {/* Soft warm wash from mid-height so the room never falls into pure
          black corners (the ceiling point-lights handle the central glow). */}
      <pointLight
        position={[0, H - 1.5, depth / 4]}
        intensity={12}
        color={interior.lightColor}
        distance={Math.max(width, depth) * 1.6}
        decay={2}
      />
    </group>
  );
}

function Floor({ width, depth, interior }: { width: number; depth: number; interior: InteriorConfig }) {
  // ~1 tile per 3.2m of wood, 4m of carpet keeps texel density sane.
  const wood = useTiledPbr('wood', width / 3.2, depth / 3.2);
  const carpet = useTiledPbr('carpet', width / 4, depth / 4);
  const hex = useHexCarpetTexture(interior.floorColor, interior.accentColor, width / 5.2, depth / 5.2);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onFloorClick(e.point.x, e.point.z);
      }}
    >
      <planeGeometry args={[width, depth]} />
      {interior.floor === 'wood' && (
        <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} />
      )}
      {interior.floor === 'carpet' && (
        <meshStandardMaterial
          map={carpet.map}
          normalMap={carpet.normalMap}
          roughnessMap={carpet.roughnessMap}
          color={interior.floorColor}
        />
      )}
      {interior.floor === 'carpet-hex' && (
        <meshStandardMaterial map={hex} normalMap={carpet.normalMap} roughnessMap={carpet.roughnessMap} />
      )}
    </mesh>
  );
}

function Walls({ width, depth, interior }: { width: number; depth: number; interior: InteriorConfig }) {
  const H = interior.wallHeight;
  const fabric = useTiledPbr('fabric', 6, 2);
  const walls: { pos: [number, number, number]; rot: number; len: number; panels: boolean }[] = [
    { pos: [0, H / 2, -depth / 2], rot: 0, len: width, panels: true },
    // Rear wall (spawn side): no panels — they crowd the follow camera.
    { pos: [0, H / 2, depth / 2], rot: Math.PI, len: width, panels: false },
    { pos: [-width / 2, H / 2, 0], rot: Math.PI / 2, len: depth, panels: true },
    { pos: [width / 2, H / 2, 0], rot: -Math.PI / 2, len: depth, panels: true },
  ];

  return (
    <>
      {walls.map((w, i) => (
        <group key={i} position={w.pos} rotation={[0, w.rot, 0]}>
          {/* Single-sided, facing inward (dollhouse trick): when the follow
              camera swings outside the bounds, the wall back-face culls and
              the room stays visible instead of going black. */}
          <mesh receiveShadow>
            <planeGeometry args={[w.len, H]} />
            <meshStandardMaterial
              map={fabric.map}
              normalMap={fabric.normalMap}
              roughnessMap={fabric.roughnessMap}
              color={interior.wallColor}
            />
          </mesh>
          {/* Framed wall panels: a back slab + a lighter inset, so each reads
              as mounted acoustic/art paneling rather than a flat dark void. */}
          {w.panels &&
            panelOffsets(w.len).map((x) => (
              <group key={x} position={[x, 0.4, 0.06]}>
                <mesh castShadow>
                  <boxGeometry args={[2.3, H * 0.66, 0.07]} />
                  <meshStandardMaterial color={interior.panelColor} roughness={0.92} />
                </mesh>
                {/* Inset face, slightly lighter + warmer than the frame. */}
                <mesh position={[0, 0, 0.045]}>
                  <planeGeometry args={[1.95, H * 0.66 - 0.35]} />
                  <meshStandardMaterial color={lighten(interior.panelColor, 0.16)} roughness={0.85} />
                </mesh>
                {/* Thin accent top edge on the frame. */}
                <mesh position={[0, (H * 0.66) / 2 - 0.05, 0.05]}>
                  <planeGeometry args={[2.1, 0.04]} />
                  <meshStandardMaterial
                    color={interior.accentColor}
                    emissive={interior.accentColor}
                    emissiveIntensity={0.5}
                  />
                </mesh>
              </group>
            ))}
          {/* Crown trim near the ceiling — a warm accent line around the room. */}
          <mesh position={[0, H / 2 - 0.18, 0.06]}>
            <boxGeometry args={[w.len, 0.12, 0.05]} />
            <meshStandardMaterial color={interior.accentColor} emissive={interior.accentColor} emissiveIntensity={0.45} />
          </mesh>
          {/* Glowing base trim. */}
          <mesh position={[0, -H / 2 + 0.05, 0.08]}>
            <boxGeometry args={[w.len, 0.07, 0.05]} />
            <meshStandardMaterial
              color={interior.accentColor}
              emissive={interior.accentColor}
              emissiveIntensity={1.1}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** Lighten a hex color toward white by `amt` (0..1). */
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + Math.round(255 * amt));
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round(255 * amt));
  const b = Math.min(255, (n & 0xff) + Math.round(255 * amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Panel positions along a wall: denser spacing (~every 4m), away from corners. */
function panelOffsets(length: number): number[] {
  const count = Math.max(2, Math.floor(length / 4));
  const usable = length - 3.5;
  return Array.from({ length: count }, (_, i) => -usable / 2 + (usable * i) / (count - 1));
}

function Ceiling({ width, depth, interior }: { width: number; depth: number; interior: InteriorConfig }) {
  const H = interior.wallHeight;
  const lights = useMemo(() => {
    const cols = Math.max(2, Math.round(width / 9));
    const rows = Math.max(2, Math.round(depth / 9));
    const out: [number, number][] = [];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        out.push([
          -width / 2 + ((i + 0.5) * width) / cols,
          -depth / 2 + ((j + 0.5) * depth) / rows,
        ]);
      }
    }
    return out;
  }, [width, depth]);

  // Real point lights are GPU-costly, so only the panels nearest the center
  // (where avatars congregate) actually cast light; the rest just glow via the
  // emissive panel material. Keeps the floor warmly lit without N live lights.
  const litPanels = useMemo(() => {
    const byCenter = [...lights].sort(
      (a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]),
    );
    return new Set(byCenter.slice(0, 4).map(([x, z]) => `${x}:${z}`));
  }, [lights]);

  return (
    <group position={[0, H, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={interior.ceilingColor} roughness={0.95} />
      </mesh>
      {lights.map(([x, z]) => {
        const key = `${x}:${z}`;
        return (
          <group key={key} position={[x, -0.04, z]}>
            <mesh>
              <boxGeometry args={[2.6, 0.06, 1.3]} />
              {/* Emissive (not basic) so the panel glows AND the bloom-free
                  warm cast reads even on surfaces it doesn't directly light. */}
              <meshStandardMaterial
                color={interior.lightColor}
                emissive={interior.lightColor}
                emissiveIntensity={1.4}
                toneMapped={false}
              />
            </mesh>
            {litPanels.has(key) && (
              <pointLight
                position={[0, -0.8, 0]}
                color={interior.lightColor}
                intensity={11}
                distance={H * 3}
                decay={1.7}
                castShadow={false}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Simple stylized potted plant — low-poly greenery for corners. */
function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.32, 0.42, 0.6, 10]} />
        <meshStandardMaterial color="#3a3531" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.05, 0.08, 0.9, 6]} />
        <meshStandardMaterial color="#5a4632" />
      </mesh>
      {[
        [0, 1.55, 0, 0.55],
        [0.3, 1.3, 0.15, 0.38],
        [-0.28, 1.35, -0.12, 0.36],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} castShadow position={[x!, y!, z!]} scale={[1, 0.85, 1]}>
          <sphereGeometry args={[r, 10, 8]} />
          <meshStandardMaterial color={i === 0 ? '#3f7d44' : '#4f945a'} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}
