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
      {!venue && <LoungeDressing depth={depth} />}
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
        intensity={7}
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
        // roughness multiplies the map: floor stays satin-matte so ceiling
        // fixtures never mirror as glare hotspots (S2).
        <meshStandardMaterial
          map={wood.map}
          normalMap={wood.normalMap}
          roughnessMap={wood.roughnessMap}
          roughness={0.9}
        />
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
          {/* Wall paneling (S2): venues get vertical wood-slat groups; other
              rooms get quiet framed art slabs. No emissive edges anywhere —
              the accent color is not architecture. */}
          {w.panels &&
            panelOffsets(w.len).map((x) => (
              <group key={x} position={[x, 0.4, 0.06]}>
                {venue ? (
                  // Acoustic slat group: five vertical fins over the wall.
                  [-0.9, -0.45, 0, 0.45, 0.9].map((sx) => (
                    <mesh key={sx} castShadow position={[sx, 0, 0]}>
                      <boxGeometry args={[0.16, H * 0.72, 0.09]} />
                      <meshStandardMaterial color={interior.panelColor} roughness={0.85} />
                    </mesh>
                  ))
                ) : (
                  <>
                    <mesh castShadow>
                      <boxGeometry args={[2.3, H * 0.52, 0.06]} />
                      <meshStandardMaterial color={interior.panelColor} roughness={0.9} />
                    </mesh>
                    <mesh position={[0, 0, 0.035]}>
                      <planeGeometry args={[2.0, H * 0.52 - 0.3]} />
                      <meshStandardMaterial color={lighten(interior.panelColor, 0.14)} roughness={0.85} />
                    </mesh>
                  </>
                )}
              </group>
            ))}
          {/* Baseboard — a real-world material break, not a glow strip. */}
          <mesh position={[0, -H / 2 + 0.08, 0.05]}>
            <boxGeometry args={[w.len, 0.16, 0.04]} />
            <meshStandardMaterial color={lighten(interior.wallColor, -0.18)} roughness={0.9} />
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
          // Recessed fixture (S2): dark housing + soft warm lens. Tone-mapped
          // and capped at 0.6 so a light source reads as a designed fixture,
          // never a blown-out white slab. toneMapped:false is reserved for
          // content surfaces (live video / slides) — DESIGN.md rule.
          <group key={key} position={[x, -0.06, z]}>
            <mesh>
              <boxGeometry args={[2.7, 0.1, 1.4]} />
              <meshStandardMaterial color="#2b2731" roughness={0.6} metalness={0.2} />
            </mesh>
            <mesh position={[0, -0.051, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[2.45, 1.15]} />
              <meshStandardMaterial
                color={interior.lightColor}
                emissive={interior.lightColor}
                emissiveIntensity={0.6}
                roughness={1}
              />
            </mesh>
            {litPanels.has(key) && (
              <pointLight
                position={[0, -0.8, 0]}
                color={interior.lightColor}
                intensity={10}
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
 * Lobby dressing (S4): the zones that turn "a box with tables" into a floor
 * plan — lounge cluster, coffee corner, zone rugs, daylight windows on the
 * rear wall. Pure client-side visuals: every tenant gets it instantly, no
 * scene reseed, no collision/logic involvement. Positions are keyed to the
 * lobby preset's object layout (tables at ±9, desks west, portal east).
 */
function LoungeDressing({ depth }: { depth: number }) {
  const rear = depth / 2;
  return (
    <group>
      {/* Zone rugs — anchor each huddle table; clicks fall through to walk. */}
      {[-9, 9].map((x) => (
        <mesh
          key={x}
          receiveShadow
          position={[x, 0.012, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onFloorClick(e.point.x, e.point.z);
          }}
        >
          <cylinderGeometry args={[3.4, 3.4, 0.02, 40]} />
          <meshStandardMaterial color="#e3dccc" roughness={0.95} />
        </mesh>
      ))}

      {/* Lounge cluster: two sofas across a coffee table, rug-anchored. */}
      <group position={[5, 0, 11.5]}>
        <mesh
          receiveShadow
          position={[0, 0.012, 0.2]}
          onClick={(e) => {
            e.stopPropagation();
            onFloorClick(e.point.x, e.point.z);
          }}
        >
          <boxGeometry args={[6.6, 0.02, 4.6]} />
          <meshStandardMaterial color="#e3dccc" roughness={0.95} />
        </mesh>
        <Dressing url="/models/loungeSofa.glb" height={0.85} pos={[-2.2, 0, 0]} yaw={Math.PI / 2} tints={SOFA_TINTS} />
        <Dressing url="/models/loungeSofa.glb" height={0.85} pos={[2.2, 0, 0]} yaw={-Math.PI / 2} tints={SOFA_TINTS} />
        <Dressing url="/models/tableCoffee.glb" height={0.42} pos={[0, 0, 0]} tints={{ wood: '#6b4f39' }} />
        <Dressing url="/models/loungeSofaOttoman.glb" height={0.42} pos={[0, 0, 1.9]} tints={SOFA_TINTS} />
        <Dressing url="/models/lampRoundFloor.glb" height={1.55} pos={[-2.4, 0, 2.1]} tints={{ metal: '#4a4550' }} />
      </group>

      {/* Coffee corner against the rear wall, west side. */}
      <group position={[-19, 0, rear - 1.4]} rotation={[0, Math.PI, 0]}>
        <Dressing url="/models/kitchenCabinet.glb" height={1.0} pos={[0.7, 0, 0]} tints={CABINET_TINTS} />
        <Dressing url="/models/kitchenCabinet.glb" height={1.0} pos={[-0.7, 0, 0]} tints={CABINET_TINTS} />
        <Dressing url="/models/kitchenCoffeeMachine.glb" height={0.42} pos={[0.7, 1.0, 0]} tints={MACHINE_TINTS} />
        <Dressing url="/models/books.glb" height={0.28} pos={[-0.7, 1.0, 0]} tints={{ plant: '#4f945a' }} />
      </group>

      {/* Daylight windows on the rear wall (the one wall without paneling). */}
      {[-16, -5.5, 5.5, 16].map((x) => (
        <group key={x} position={[x, 2.9, rear - 0.07]} rotation={[0, Math.PI, 0]}>
          <mesh castShadow>
            <boxGeometry args={[3.3, 3.5, 0.09]} />
            <meshStandardMaterial color="#8a7b66" roughness={0.7} />
          </mesh>
          {/* Soft daylight lens — tone-mapped, capped (DESIGN.md fixture rule). */}
          <mesh position={[0, 0, 0.055]}>
            <planeGeometry args={[2.95, 3.15]} />
            <meshStandardMaterial color="#fff5e6" emissive="#fff3e0" emissiveIntensity={0.55} roughness={1} />
          </mesh>
          {[-0.5, 0.5].map((mx) => (
            <mesh key={mx} position={[mx, 0, 0.062]}>
              <boxGeometry args={[0.06, 3.15, 0.02]} />
              <meshStandardMaterial color="#8a7b66" roughness={0.7} />
            </mesh>
          ))}
          <mesh position={[0, 0, 0.062]}>
            <boxGeometry args={[2.95, 0.06, 0.02]} />
            <meshStandardMaterial color="#8a7b66" roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const SOFA_TINTS = { carpet: '#b7ad9c', wood: '#6b4f39' };
const CABINET_TINTS = { metal: '#9a95a1', wood: '#a9805c', woodDark: '#6b4f39' };
const MACHINE_TINTS = { metalMedium: '#4a4550', metal: '#9a95a1' };

/** One dressed GLB: own Suspense so a streaming sofa never blanks the scene. */
function Dressing({
  url,
  height,
  pos,
  yaw = 0,
  tints,
}: {
  url: string;
  height: number;
  pos: [number, number, number];
  yaw?: number;
  tints?: Record<string, string>;
}) {
  return (
    <group position={pos}>
      <Suspense fallback={null}>
        <ModelObject spec={{ url, height, yaw, tints }} />
      </Suspense>
    </group>
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
