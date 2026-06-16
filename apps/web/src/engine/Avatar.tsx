'use client';

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Billboard, Html, Text, useAnimations, useGLTF } from '@react-three/drei';
import { LoopOnce, Mesh, type Group } from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { AvatarAnimation } from '@mvs/shared';
import { applyAvatarLook } from '@/engine/avatarLook';
import { HumanoidAvatar } from '@/engine/HumanoidAvatar';
import { usePlayerStore } from '@/stores/playerStore';

/**
 * GLTF avatar with a crossfading animation state machine (M2). The model is a
 * CC0 KayKit character served from our own origin (never a runtime CDN), with
 * its clip library mapped onto the shared AvatarAnimation states. `modelId`
 * from the user's avatarConfig picks the character file (avatar picker later).
 */
export const AVATAR_MODELS: Record<string, { file: string; label: string }> = {
  default: { file: '/avatars/Knight.glb', label: 'Knight' },
  knight: { file: '/avatars/Knight.glb', label: 'Knight' },
  mage: { file: '/avatars/Mage.glb', label: 'Mage' },
  rogue: { file: '/avatars/Rogue.glb', label: 'Rogue' },
  barbarian: { file: '/avatars/Barbarian.glb', label: 'Barbarian' },
  rogue_hooded: { file: '/avatars/Rogue_Hooded.glb', label: 'Hooded Rogue' },
};

const CLIPS: Record<AvatarAnimation, string> = {
  [AvatarAnimation.IDLE]: 'Idle',
  [AvatarAnimation.WALK]: 'Walking_A',
  [AvatarAnimation.RUN]: 'Running_A',
  // The pack has no dedicated wave; Cheer reads as a greeting emote.
  [AvatarAnimation.WAVE]: 'Cheer',
  [AvatarAnimation.SIT]: 'Sit_Chair_Idle',
};

/** States that play once and then return to idle (vs. looping locomotion). */
const ONE_SHOT = new Set<AvatarAnimation>([AvatarAnimation.WAVE]);

const FADE_SECONDS = 0.2;

export function Avatar({
  position,
  rotation = 0,
  animation = AvatarAnimation.IDLE,
  color = '#6c5ce7',
  name,
  isLocal = false,
  modelId = 'default',
  parts,
  customModelUrl,
  showName = true,
  showOverlays = true,
  handRaised = false,
  reaction,
}: {
  position: [number, number, number];
  rotation?: number;
  animation?: AvatarAnimation;
  color?: string;
  name: string;
  isLocal?: boolean;
  modelId?: string;
  /** Equipped gear node names from avatarConfig; undefined = default loadout. */
  parts?: string[];
  /**
   * Ready-Player-Me / external glTF url. When set, the body is the humanoid
   * mesh from this URL (animated by the shared clip library) instead of a
   * KayKit character; `modelId`/`parts` are ignored for that body.
   */
  customModelUrl?: string;
  /** Nameplate LOD: text meshes are the priciest part of an avatar (M6). */
  showName?: boolean;
  /**
   * Gate for the DOM overlays (hand/reaction). Wider range than the nameplate
   * — a presenter's hand must read from the back row — and REQUIRED for AOI:
   * drei Html ignores ancestors' three.js visibility, so a culled avatar
   * would otherwise leave floating emoji.
   */
  showOverlays?: boolean;
  /** ✋ badge above the nameplate (auditorium raise-hand). */
  handRaised?: boolean;
  /** Latest reaction burst; a new `ts` replays the float-up animation. */
  reaction?: { emoji: string; ts: number };
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {customModelUrl ? (
        // Suspense per avatar: a slow/failed external URL must not blank the
        // whole scene. Until it resolves there's simply no body (nameplate and
        // overlays below still render so the player isn't invisible in lists).
        <Suspense fallback={null}>
          <HumanoidAvatar url={customModelUrl} animation={animation} isLocal={isLocal} />
        </Suspense>
      ) : (
        <KayKitBody modelId={modelId} parts={parts} color={color} animation={animation} isLocal={isLocal} />
      )}
      {showName && (
        // Above the helmet, drawn on top of geometry (depthTest off) with a
        // backing pill — readable against any armor or background.
        <Billboard position={[0, 2.55, 0]}>
          <mesh renderOrder={998}>
            <planeGeometry args={[Math.max(0.9, name.length * 0.17 + 0.3), 0.46]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.55} depthTest={false} />
          </mesh>
          <Text
            fontSize={0.28}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000000"
            renderOrder={999}
            material-depthTest={false}
          >
            {name}
          </Text>
          {isLocal && (
            <mesh position={[0, -0.34, 0]} renderOrder={999}>
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color={color} depthTest={false} />
            </mesh>
          )}
        </Billboard>
      )}
      {/* DOM overlays for emoji (SDF text can't render color glyphs). */}
      {showOverlays && handRaised && (
        <Html center position={[0, 3.05, 0]} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
          <div className="mvs-hand">✋</div>
        </Html>
      )}
      {showOverlays && reaction && <ReactionFloat key={reaction.ts} emoji={reaction.emoji} />}
    </group>
  );
}

/**
 * The KayKit character body: loads the modular GLB for `modelId`, applies gear
 * visibility + cape tint, and runs the crossfading clip state machine. Split out
 * of `Avatar` so the external-glTF (RPM) path can swap the body without touching
 * the shared nameplate/overlay shell.
 */
function KayKitBody({
  modelId,
  parts,
  color,
  animation,
  isLocal,
}: {
  modelId: string;
  parts?: string[];
  color: string;
  animation: AvatarAnimation;
  isLocal: boolean;
}) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF((AVATAR_MODELS[modelId] ?? AVATAR_MODELS.default!).file);

  // useGLTF caches one scene per URL; every avatar needs its own skeleton.
  const model = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    clone.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true;
        node.receiveShadow = false;
      }
    });
    return clone;
  }, [scene]);

  // Gear visibility + cape tint, re-applied in place (recloning the model
  // would sever the animation mixer's property bindings). partsKey stands in
  // for the array so a fresh-but-equal array doesn't reapply.
  const partsKey = parts?.join('|');
  useLayoutEffect(() => {
    applyAvatarLook(model, modelId, partsKey?.split('|').filter(Boolean), color);
  }, [model, modelId, partsKey, color]);

  const { actions, mixer } = useAnimations(animations, group);

  // Crossfade to the clip for the current state; fading the previous action
  // out on cleanup gives smooth blends without tracking it manually.
  useEffect(() => {
    const action = actions[CLIPS[animation]];
    if (!action) return;
    if (ONE_SHOT.has(animation)) {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.reset().fadeIn(FADE_SECONDS).play();
    return () => {
      action.fadeOut(FADE_SECONDS);
    };
  }, [actions, animation]);

  // When the local one-shot finishes, drop back to idle so both the state
  // machine and the network (which mirrors playerStore) reflect reality.
  useEffect(() => {
    if (!isLocal) return;
    const onFinished = () => {
      const store = usePlayerStore.getState();
      if (ONE_SHOT.has(store.animation)) store.set({ animation: AvatarAnimation.IDLE });
    };
    mixer.addEventListener('finished', onFinished);
    return () => mixer.removeEventListener('finished', onFinished);
  }, [mixer, isLocal]);

  return (
    <group ref={group}>
      <primitive object={model} />
    </group>
  );
}

/** One float-up-and-fade emoji burst; remounts (new key) replay it. */
function ReactionFloat({ emoji }: { emoji: string }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 2200);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <Html center position={[0, 2.7, 0]} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
      <div className="mvs-reaction">{emoji}</div>
    </Html>
  );
}

useGLTF.preload(AVATAR_MODELS.default!.file);
