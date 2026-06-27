'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Grid, OrbitControls, PerformanceMonitor, SoftShadows } from '@react-three/drei';
import {
  ACESFilmicToneMapping,
  ExtrudeGeometry,
  QuadraticBezierCurve3,
  Shape,
  Vector3,
  type Group,
} from 'three';
import type { WorldManifest } from '@mvs/shared';
import { useSessionStore } from '@/stores/sessionStore';
import { usePlayerStore } from '@/stores/playerStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { Avatar } from './Avatar';
import { CameraRig } from './CameraRig';
import { onFloorClick } from './floorClick';
import { useTiledPbr } from './materials';
import { RemoteAvatar } from './RemoteAvatar';
import { Room } from './Room';
import { SceneObjectMesh } from './SceneObject';
import { useLocalMovement } from './useLocalMovement';

/**
 * M2 engine root: renders a world manifest (lighting, ground, objects via the
 * renderer registry), drives the local GLTF avatar (WASD + click-to-move +
 * emotes), follows it with the camera rig, and shows remote players from
 * presence. Network interpolation lands in M3.
 */
export function SceneCanvas({ manifest, onInteract }: { manifest: WorldManifest; onInteract: (id: string) => void }) {
  const { scene } = manifest;
  // Resolution scales down when the GPU can't hold framerate (M6).
  const [dpr, setDpr] = useState(1.5);

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
  return (
    <Canvas
      shadows
      camera={{ position: [0, 8, 14], fov: 50 }}
      dpr={dpr}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
    >
      <PerformanceMonitor
        onIncline={() => setDpr(2)}
        onDecline={() => setDpr(1)}
        flipflops={3}
        onFallback={() => setDpr(1)}
      />
      {/* Softer shadow penumbra than the default hard map — reads as venue
          lighting rather than a stamped-on dark blob. */}
      <SoftShadows size={26} samples={12} focus={0.7} />
      <color attach="background" args={[interior?.ceilingColor ?? scene.environment.groundColor]} />
      <ambientLight intensity={scene.lighting.ambientIntensity} color={scene.lighting.ambientColor} />
      <directionalLight
        castShadow
        position={scene.lighting.directionalPosition}
        intensity={scene.lighting.directionalIntensity}
        color={interior?.lightColor ?? '#ffffff'}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
      />
      {/* Warm-from-above, cool-from-below hemisphere fill keyed to the room's
          light color, so corners read as lit interior rather than black void.
          (HDR/IBL for designed scenes arrives later, served from our storage.) */}
      <hemisphereLight args={[interior?.lightColor ?? '#aab4cc', '#2a2620', 0.85]} />

      {/* Anything that streams assets must suspend INSIDE the canvas, or the
          whole scene unmounts to a blank canvas while loading. */}
      <Suspense fallback={null}>
        {scene.environment.interior ? (
          // Designed interiors replace the infinite-grid void (Phase 2).
          <Room bounds={scene.bounds} interior={scene.environment.interior} />
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
        {scene.stage && <StagePlatform stage={scene.stage} accent={scene.environment.interior?.accentColor} />}

        {manifest.objects.map((o) => (
          <SceneObjectMesh key={o.id} object={o} onInteract={onInteract} />
        ))}

        <LocalAvatar scene={scene} />
        <RemoteAvatars />
      </Suspense>

      <CameraRig bounds={scene.bounds} />
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={3}
        maxDistance={55}
        maxPolarAngle={Math.PI / 2.1}
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
      <mesh>
        <tubeGeometry args={[lip, 32, 0.045, 6, false]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.3} />
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

  useFrame(() => {
    const { position, rotation } = usePlayerStore.getState();
    if (ref.current) {
      ref.current.position.set(position[0], position[1], position[2]);
      ref.current.rotation.y = rotation;
    }
  });

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
