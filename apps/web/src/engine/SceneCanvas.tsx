'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Grid, OrbitControls, PerformanceMonitor, SoftShadows } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import {
  ACESFilmicToneMapping,
  ExtrudeGeometry,
  QuadraticBezierCurve3,
  Shape,
  Vector3,
  type Group,
} from 'three';
import { ObjectType, type SceneObjectDTO, type WorldManifest } from '@mvs/shared';
import { useSessionStore } from '@/stores/sessionStore';
import { usePlayerStore } from '@/stores/playerStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { Amphitheater } from './Amphitheater';
import { SceneEnvironment } from './environment';
import { usePerfTier } from './perfTier';
import { Avatar } from './Avatar';
import { CameraRig } from './CameraRig';
import { onFloorClick } from './floorClick';
import { useTiledPbr } from './materials';
import { RemoteAvatar } from './RemoteAvatar';
import { Room } from './Room';
import { SceneObjectMesh } from './SceneObject';
import { seatRegistry } from './seatRegistry';
import { TheaterSeating } from './TheaterSeating';
import { useLocalMovement } from './useLocalMovement';

/**
 * M2 engine root: renders a world manifest (lighting, ground, objects via the
 * renderer registry), drives the local GLTF avatar (WASD + click-to-move +
 * emotes), follows it with the camera rig, and shows remote players from
 * presence. Network interpolation lands in M3.
 */
export function SceneCanvas({ manifest, onInteract }: { manifest: WorldManifest; onInteract: (id: string) => void }) {
  const { scene } = manifest;
  // Resolution scales with proven headroom, capped at 1.5 — the step to 2.0
  // is near-invisible in a 3D scene but costs ~78% more pixels (S1).
  const [dpr, setDpr] = useState(1.25);
  // Visual-quality tier: IBL + post-processing at high/medium, bare at low.
  const tier = usePerfTier((s) => s.tier);

  // Drop the avatar at the spawn point when ENTERING a space — keyed on spaceId,
  // not the whole scene object, so an in-editor manifest refresh (moving/scaling
  // an object) doesn't teleport the player back to spawn.
  useEffect(() => {
    const spawn = manifest.scene.spawnPoints[0];
    if (spawn) {
      usePlayerStore.getState().set({
        position: [spawn.position[0], spawn.position[1], spawn.position[2]],
        rotation: spawn.rotation,
        target: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest.spaceId]);

  const interior = scene.environment.interior;

  // Theater seats render as one instanced batch (5 draw calls for ~435
  // seats); everything else goes through the per-object dispatcher (S3).
  const { theaterSeats, otherObjects } = useMemo(() => {
    const seats: SceneObjectDTO[] = [];
    const rest: SceneObjectDTO[] = [];
    for (const o of manifest.objects) {
      if (o.type === ObjectType.CHAIR && (o.config as { style?: string }).style === 'theater') {
        seats.push(o);
      } else {
        rest.push(o);
      }
    }
    // Every chair (theater or office) is a snap target for the X shortcut.
    seatRegistry.seats = manifest.objects
      .filter((o) => o.type === ObjectType.CHAIR)
      .map((o) => ({
        x: o.transform.position[0],
        y: o.transform.position[1],
        z: o.transform.position[2],
        yaw: o.transform.rotation[1],
      }));
    return { theaterSeats: seats, otherObjects: rest };
  }, [manifest.objects]);

  return (
    <Canvas
      shadows
      // Wider lens + a higher/further start so a big hall reads as big on entry.
      camera={{ position: [0, 5, 20], fov: 62 }}
      dpr={dpr}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
    >
      <PerformanceMonitor
        onIncline={() => {
          setDpr(1.5);
          usePerfTier.getState().up();
        }}
        onDecline={() => {
          setDpr(1);
          usePerfTier.getState().down();
        }}
        flipflops={3}
        onFallback={() => {
          setDpr(1);
          usePerfTier.getState().floor();
        }}
      />
      {/* PCSS penumbra is expensive — only the earned high tier pays for it;
          medium/low use the plain shadow map. */}
      {tier === 'high' && <SoftShadows size={26} samples={12} focus={0.7} />}
      <color attach="background" args={[interior?.ceilingColor ?? scene.environment.groundColor]} />
      <ambientLight intensity={scene.lighting.ambientIntensity} color={scene.lighting.ambientColor} />
      <directionalLight
        castShadow
        position={scene.lighting.directionalPosition}
        intensity={scene.lighting.directionalIntensity}
        color={interior?.lightColor ?? '#ffffff'}
        shadow-mapSize={tier === 'high' ? [2048, 2048] : [1024, 1024]}
        shadow-bias={-0.0004}
      />
      {/* Warm-from-above, cool-from-below hemisphere fill keyed to the room's
          light color, so corners read as lit interior rather than black void.
          (HDR/IBL for designed scenes arrives later, served from our storage.) */}
      <hemisphereLight args={[interior?.lightColor ?? '#f6efe4', '#b7ab99', 0.75]} />

      {/* Anything that streams assets must suspend INSIDE the canvas, or the
          whole scene unmounts to a blank canvas while loading. */}
      <Suspense fallback={null}>
        {/* IBL: reflections + material response from a local HDRI (background
            stays the room color). Skipped entirely on the low tier. */}
        {tier !== 'low' && <SceneEnvironment skybox={scene.environment.skybox} />}
        {scene.environment.interior ? (
          // Designed interiors replace the infinite-grid void (Phase 2).
          <Room
            bounds={scene.bounds}
            interior={scene.environment.interior}
            venue={Boolean(scene.stage)}
          />
        ) : (
          <>
            <Ground color={scene.environment.groundColor} />
            <Grid
              args={[100, 100]}
              cellColor="#2c3340"
              sectionColor="#3a4252"
              infiniteGrid
              fadeDistance={60}
              position={[0, 0.01, 0]}
            />
          </>
        )}
        {scene.amphitheater && (
          <Amphitheater
            bowl={scene.amphitheater}
            carpetColor={interior?.floorColor}
            accentColor={interior?.accentColor}
          />
        )}
        {scene.stage && <StagePlatform stage={scene.stage} accent={scene.environment.interior?.accentColor} />}

        <TheaterSeating objects={theaterSeats} onInteract={onInteract} />
        {otherObjects.map((o) => (
          <SceneObjectMesh key={o.id} object={o} onInteract={onInteract} />
        ))}

        <LocalAvatar scene={scene} />
        <RemoteAvatars />
      </Suspense>

      {/* Post-processing: bloom + vignette are HIGH-tier only — the
          full-screen composer passes were the main cost on mid GPUs.
          Medium keeps IBL; low is the bare pipeline. */}
      {tier === 'high' && (
        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={1} mipmapBlur intensity={0.5} />
          <Vignette eskil={false} offset={0.12} darkness={0.55} />
        </EffectComposer>
      )}

      <CameraRig bounds={scene.bounds} ceiling={interior?.wallHeight} />
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={3}
        // Contained: the camera must never exit the room shell (the old 95m
        // limit let it punch through the roof and film the building from
        // outside). 44m still frames the whole hall from the back row.
        maxDistance={44}
        maxPolarAngle={Math.PI * 0.55}
        zoomSpeed={1.6}
      />
    </Canvas>
  );
}

/**
 * Raised presenter platform: hardwood deck with a curved front apron (venue
 * style) and a glowing lip along the curve. Clicking the deck click-to-moves
 * onto it. The walkable zone stays the rectangular `stage` config.
 */
function StagePlatform({
  stage,
  accent = '#6c5ce7',
}: {
  stage: NonNullable<WorldManifest['scene']['stage']>;
  accent?: string;
}) {
  const [cx, , cz] = stage.center;
  const wood = useTiledPbr('wood', 0.25, 0.25);

  const { geometry, lip } = useMemo(() => {
    const w = stage.size[0] / 2;
    const d = stage.size[1] / 2;
    const bulge = 2.4; // apron curves out beyond the walkable rect
    // Shape in XY; -Y is the audience-facing edge, which rotateX(-π/2)
    // maps onto world +Z. The deck covers the full walkable rect so nobody
    // stands on air at the corners; only the bulge is decorative overhang.
    const shape = new Shape();
    shape.moveTo(-w, d);
    shape.lineTo(w, d);
    shape.lineTo(w, -d);
    shape.quadraticCurveTo(0, -(d + bulge), -w, -d);
    shape.closePath();
    const geo = new ExtrudeGeometry(shape, { depth: stage.height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const curve = new QuadraticBezierCurve3(
      new Vector3(-w, stage.height + 0.02, d),
      new Vector3(0, stage.height + 0.02, d + bulge),
      new Vector3(w, stage.height + 0.02, d),
    );
    return { geometry: geo, lip: curve };
  }, [stage.size, stage.height]);

  return (
    <group position={[cx, 0, cz]}>
      <mesh
        castShadow
        receiveShadow
        geometry={geometry}
        onClick={(e) => {
          e.stopPropagation();
          usePlayerStore.getState().set({ target: [e.point.x, e.point.z] });
        }}
      >
        <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} />
      </mesh>
      {/* Front-edge hairline — one of the scene's three allowed accent
          moments, and quiet even then (DESIGN.md accent rules). */}
      <mesh>
        <tubeGeometry args={[lip, 32, 0.028, 6, false]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.3} />
      </mesh>
      <Podium x={stage.size[0] * 0.32} z={stage.size[1] * 0.18} y={stage.height} />
    </group>
  );
}

/** Speaker podium: walnut body, slanted ink reading top. Pure dressing. */
function Podium({ x, z, y }: { x: number; z: number; y: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh castShadow receiveShadow position={[0, 0.55, 0]}>
        <boxGeometry args={[0.72, 1.1, 0.5]} />
        <meshStandardMaterial color="#6b4f39" roughness={0.65} />
      </mesh>
      <mesh castShadow position={[0, 1.14, -0.02]} rotation={[-0.28, 0, 0]}>
        <boxGeometry args={[0.78, 0.05, 0.5]} />
        <meshStandardMaterial color="#2b2731" roughness={0.7} />
      </mesh>
    </group>
  );
}

function Ground({ color }: { color: string }) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onFloorClick(e.point.x, e.point.z);
      }}
    >
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function LocalAvatar({ scene }: { scene: WorldManifest['scene'] }) {
  const ref = useRef<Group>(null);
  const me = useSessionStore((s) => s.me);
  // Animation changes re-render (crossfade); position flows imperatively below.
  const animation = usePlayerStore((s) => s.animation);
  const myId = me?.user.id;
  const handRaised = usePresenceStore((s) => (myId ? Boolean(s.hands[myId]) : false));
  const reaction = usePresenceStore((s) => (myId ? s.reactions[myId] : undefined));
  useLocalMovement(scene);

  // Priority -2: after movement (-3), before the camera rig (-1) and
  // billboards (0) — nameplates read a settled avatar + camera every frame.
  useFrame(() => {
    const { position, rotation } = usePlayerStore.getState();
    if (ref.current) {
      ref.current.position.set(position[0], position[1], position[2]);
      ref.current.rotation.y = rotation;
    }
  }, -2);

  const avatarConfig = (me?.user.avatarConfig ?? {}) as {
    modelId?: string;
    color?: string;
    parts?: string[];
    customModelUrl?: string;
  };

  return (
    <group ref={ref}>
      <Avatar
        position={[0, 0, 0]}
        animation={animation}
        name={me?.user.name ?? 'You'}
        color={avatarConfig.color ?? '#6c5ce7'}
        modelId={avatarConfig.modelId ?? 'default'}
        parts={avatarConfig.parts}
        customModelUrl={avatarConfig.customModelUrl}
        handRaised={handRaised}
        reaction={reaction}
        isLocal
      />
    </group>
  );
}

function RemoteAvatars() {
  // Re-renders only on join/leave/sync; per-tick movement flows through the
  // non-reactive transform map inside each RemoteAvatar's frame loop.
  const players = usePresenceStore((s) => s.players);
  return (
    <>
      {Object.values(players).map((p) => (
        <RemoteAvatar key={p.userId} player={p} />
      ))}
    </>
  );
}
