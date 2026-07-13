'use client';

import { Suspense, useMemo } from 'react';
import type { InteriorConfig, SceneConfig } from '@mvs/shared';
import { usePlayerStore } from '@/stores/playerStore';
import { onFloorClick } from './floorClick';
import { ModelObject } from './objects/ModelObject';
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
  venue = false,
}: {
  bounds: SceneConfig['bounds'];
  interior: InteriorConfig;
  /** Stage spaces (auditorium/training) get the venue treatment: wood-plank
   *  walls, vertical LED light rods flanking the stage, coffered ceiling. */
  venue?: boolean;
}) {
  const width = bounds.max[0] - bounds.min[0];
  const depth = bounds.max[2] - bounds.min[2];
  const cx = (bounds.max[0] + bounds.min[0]) / 2;
  const cz = (bounds.max[2] + bounds.min[2]) / 2;
  const H = interior.wallHeight;

  return (
    <group position={[cx, 0, cz]}>
      <Floor width={width} depth={depth} interior={interior} />
      <Walls width={width} depth={depth} interior={interior} venue={venue} />
      <Ceiling width={width} depth={depth} interior={interior} venue={venue} />
      {venue && <LightRods width={width} depth={depth} H={H} />}
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

function Walls({
  width,
  depth,
  interior,
  venue = false,
}: {
  width: number;
  depth: number;
  interior: InteriorConfig;
  venue?: boolean;
}) {
  const H = interior.wallHeight;
  const fabric = useTiledPbr('fabric', 6, 2);
  // Venue walls read as warm wood planking (eXp-style) instead of fabric.
  const woodWall = useTiledPbr('wood', Math.max(width, depth) / 3.2, H / 3.2);
  const wallTex = venue ? woodWall : fabric;
  const wallTint = venue ? lighten(interior.wallColor, 0.1) : interior.wallColor;
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
              map={wallTex.map}
              normalMap={wallTex.normalMap}
              roughnessMap={wallTex.roughnessMap}
              color={wallTint}
            />
          </mesh>
          {/* Framed wall panels: a back slab + a lighter inset, so each reads
              as mounted acoustic/art paneling rather than a flat dark void. */}
          {w.panels &&
            panelOffsets(w.len).map((x, pi) => (
              // Venue panels tilt alternately for a faceted acoustic-wall look.
              <group key={x} position={[x, 0.4, 0.06]} rotation={[0, 0, venue ? (pi % 2 ? 0.05 : -0.05) : 0]}>
                <mesh castShadow>
                  <boxGeometry args={[2.3, H * (venue ? 0.78 : 0.66), 0.07]} />
                  <meshStandardMaterial color={interior.panelColor} roughness={0.92} />
                </mesh>
                {/* Inset face, slightly lighter + warmer than the frame. */}
                <mesh position={[0, 0, 0.045]}>
                  <planeGeometry args={[1.95, H * (venue ? 0.78 : 0.66) - 0.35]} />
                  <meshStandardMaterial color={lighten(interior.panelColor, 0.16)} roughness={0.85} />
                </mesh>
                {/* Thin accent top edge on the frame. */}
                <mesh position={[0, (H * (venue ? 0.78 : 0.66)) / 2 - 0.05, 0.05]}>
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

/** Lighten (positive amt) or darken (negative amt) a hex color, clamped. */
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + Math.round(255 * amt)));
  const r = c((n >> 16) & 0xff);
  const g = c((n >> 8) & 0xff);
  const b = c(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Panel positions along a wall: denser spacing (~every 4m), away from corners. */
function panelOffsets(length: number): number[] {
  const count = Math.max(2, Math.floor(length / 4));
  const usable = length - 3.5;
  return Array.from({ length: count }, (_, i) => -usable / 2 + (usable * i) / (count - 1));
}

function Ceiling({
  width,
  depth,
  interior,
  venue = false,
}: {
  width: number;
  depth: number;
  interior: InteriorConfig;
  venue?: boolean;
}) {
  const H = interior.wallHeight;
  // Coffered beam grid (venue): dark beams every ~9m in both directions.
  const beams = useMemo(() => {
    if (!venue) return { xs: [] as number[], zs: [] as number[] };
    const nx = Math.max(2, Math.round(width / 9));
    const nz = Math.max(2, Math.round(depth / 9));
    return {
      xs: Array.from({ length: nx - 1 }, (_, i) => -width / 2 + (width * (i + 1)) / nx),
      zs: Array.from({ length: nz - 1 }, (_, i) => -depth / 2 + (depth * (i + 1)) / nz),
    };
  }, [venue, width, depth]);
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
      {/* Coffered beams (venue only) — hang just below the ceiling plane. */}
      {beams.xs.map((x) => (
        <mesh key={`bx${x}`} position={[x, -0.35, 0]}>
          <boxGeometry args={[0.4, 0.7, depth]} />
          <meshStandardMaterial color={lighten(interior.ceilingColor, -0.06)} roughness={0.9} />
        </mesh>
      ))}
      {beams.zs.map((z) => (
        <mesh key={`bz${z}`} position={[0, -0.35, z]}>
          <boxGeometry args={[width, 0.7, 0.4]} />
          <meshStandardMaterial color={lighten(interior.ceilingColor, -0.06)} roughness={0.9} />
        </mesh>
      ))}
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

/**
 * Vertical LED light rods flanking the stage end of the hall (eXp-style):
 * clusters of thin, bright emissive sticks at varied heights and slight lean.
 * Purely emissive — no live lights, so the GPU cost is a few boxes.
 */
function LightRods({ width, depth, H }: { width: number; depth: number; H: number }) {
  // Deterministic layout (no Math.random — keeps renders/screenshots stable).
  const rods: { x: number; z: number; h: number; lean: number }[] = [];
  const heights = [0.82, 0.6, 0.72, 0.5, 0.66];
  const leans = [-0.05, 0.03, -0.02, 0.05, 0.0];
  for (let side = 0; side < 2; side++) {
    const sx = side === 0 ? -1 : 1;
    for (let i = 0; i < 5; i++) {
      rods.push({
        x: sx * (width * 0.34 + i * 1.1),
        z: -depth / 2 + 2.2 + (i % 3) * 1.4,
        h: H * heights[i]!,
        lean: sx * leans[i]!,
      });
    }
  }
  return (
    <>
      {rods.map((r, i) => (
        <mesh key={i} position={[r.x, r.h / 2, r.z]} rotation={[0, 0, r.lean]}>
          <boxGeometry args={[0.14, r.h, 0.14]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#f4f0ff"
            emissiveIntensity={2.1}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}

/** Corner greenery: Kenney potted plant GLB, primitive fallback while it streams. */
function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Suspense fallback={<ProceduralPlant />}>
        <ModelObject
          spec={{
            url: '/models/pottedPlant.glb',
            height: 1.5,
            tints: { plant: '#4f945a' },
          }}
        />
      </Suspense>
    </group>
  );
}

function ProceduralPlant() {
  return (
    <group>
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
