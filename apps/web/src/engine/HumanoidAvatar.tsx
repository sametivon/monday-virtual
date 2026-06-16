'use client';

import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  Mesh,
  type AnimationAction,
  type AnimationClip,
  type Group,
} from 'three';
import { GLTFLoader, SkeletonUtils } from 'three-stdlib';
import { AvatarAnimation } from '@mvs/shared';
import { usePlayerStore } from '@/stores/playerStore';

/**
 * Renderer for a Ready Player Me (or any Mixamo-rigged) humanoid glTF supplied
 * by URL (`avatarConfig.customModelUrl`). Unlike the KayKit characters, an RPM
 * avatar is a bare rigged mesh with NO embedded clips, so the animation library
 * lives in a separate own-origin GLB (`ANIMATIONS_URL`). RPM's animation pack is
 * authored against the very rig RPM exports, so the clips bind straight onto the
 * avatar's skeleton through a mixer — no runtime retargeting required.
 *
 * Asset (served own-origin, never a runtime CDN — same rule as the KayKit GLBs):
 *   apps/web/public/avatars/rpm-animations.glb
 * See docs/READY_PLAYER_ME.md for how to produce it. Until that file exists the
 * avatar simply renders in a static T/A-pose (loadAnimations swallows the 404),
 * so shipping the asset is what turns animation on — nothing else breaks.
 */
export const ANIMATIONS_URL = '/avatars/rpm-animations.glb';

/**
 * Map our animation states onto substrings we expect in the clip names. The
 * match is normalized + substring-based so the same code works whether the pack
 * names a clip `idle`, `M_Standing_Idle_001`, or `Armature|mixamo.com|Idle`.
 */
const CLIP_HINTS: Record<AvatarAnimation, string[]> = {
  [AvatarAnimation.IDLE]: ['idle', 'breathing', 'stand'],
  [AvatarAnimation.WALK]: ['walk'],
  [AvatarAnimation.RUN]: ['run', 'jog'],
  [AvatarAnimation.WAVE]: ['wave', 'waving'],
  [AvatarAnimation.SIT]: ['sit', 'seated', 'sitting'],
};

const ONE_SHOT = new Set<AvatarAnimation>([AvatarAnimation.WAVE]);
const FADE_SECONDS = 0.2;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/**
 * Resolve each state to the best-matching clip in the library. States with no
 * match fall back to idle (then the first clip), so a sparse pack degrades to
 * "always idle" rather than a frozen pose.
 */
function resolveClips(clips: AnimationClip[]): Partial<Record<AvatarAnimation, AnimationClip>> {
  if (clips.length === 0) return {};
  const pick = (hints: string[]) => {
    for (const hint of hints) {
      const hit = clips.find((c) => norm(c.name).includes(hint));
      if (hit) return hit;
    }
    return undefined;
  };
  const idle = pick(CLIP_HINTS[AvatarAnimation.IDLE]) ?? clips[0];
  return {
    [AvatarAnimation.IDLE]: idle,
    [AvatarAnimation.WALK]: pick(CLIP_HINTS[AvatarAnimation.WALK]) ?? idle,
    [AvatarAnimation.RUN]: pick(CLIP_HINTS[AvatarAnimation.RUN]) ?? pick(CLIP_HINTS[AvatarAnimation.WALK]) ?? idle,
    [AvatarAnimation.WAVE]: pick(CLIP_HINTS[AvatarAnimation.WAVE]) ?? idle,
    [AvatarAnimation.SIT]: pick(CLIP_HINTS[AvatarAnimation.SIT]) ?? idle,
  };
}

// Module-level cache: the animation library is one shared GLB, so fetch its
// clips once and reuse across every avatar (and remounts). `null` = tried and
// missing/failed (e.g. asset not dropped yet) so we don't refetch on every mount.
let animClipsCache: AnimationClip[] | null | undefined;
let animClipsPromise: Promise<AnimationClip[]> | undefined;

function loadAnimations(): Promise<AnimationClip[]> {
  if (animClipsCache !== undefined) return Promise.resolve(animClipsCache ?? []);
  if (!animClipsPromise) {
    animClipsPromise = new Promise<AnimationClip[]>((resolve) => {
      new GLTFLoader().load(
        ANIMATIONS_URL,
        (gltf) => {
          animClipsCache = gltf.animations ?? [];
          resolve(animClipsCache);
        },
        undefined,
        () => {
          // Missing/forbidden asset: cache the miss and degrade to no animation.
          animClipsCache = null;
          resolve([]);
        },
      );
    });
  }
  return animClipsPromise;
}

/** Subscribe a component to the shared animation clips (non-suspending). */
export function useSharedAnimationClips(): AnimationClip[] {
  const [clips, setClips] = useState<AnimationClip[]>(animClipsCache ?? []);
  useEffect(() => {
    let alive = true;
    void loadAnimations().then((c) => {
      if (alive) setClips(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return clips;
}

export function HumanoidAvatar(props: { url: string; animation?: AvatarAnimation; isLocal?: boolean }) {
  // A bad/removed external URL must not blank the scene: catch the model loader
  // error per-avatar and render nothing rather than propagating to the canvas.
  return (
    <HumanoidErrorBoundary>
      <HumanoidBody {...props} />
    </HumanoidErrorBoundary>
  );
}

function HumanoidBody({
  url,
  animation = AvatarAnimation.IDLE,
  isLocal = false,
}: {
  url: string;
  animation?: AvatarAnimation;
  isLocal?: boolean;
}) {
  const group = useRef<Group>(null);
  const { scene } = useGLTF(url);
  const clips = useSharedAnimationClips();

  // useGLTF caches one scene per URL; clone so each avatar owns its skeleton.
  const model = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    clone.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true;
        node.receiveShadow = false;
        node.frustumCulled = false; // RPM head/eyes have tight bounds that pop out at range
      }
    });
    return clone;
  }, [scene]);

  // Own mixer bound to the cloned model — useAnimations keys actions by clip
  // name, which collides when many avatars share these clips; a private mixer
  // per avatar is cleaner and lets each play its own state independently.
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  const byState = useMemo(() => resolveClips(clips), [clips]);

  useEffect(() => {
    if (clips.length === 0) return; // no library yet → static pose
    const clip = byState[animation];
    if (!clip) return;
    const action: AnimationAction = mixer.clipAction(clip);
    if (ONE_SHOT.has(animation)) {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(LoopRepeat, Infinity);
    }
    action.reset().fadeIn(FADE_SECONDS).play();
    return () => {
      action.fadeOut(FADE_SECONDS);
    };
  }, [mixer, byState, animation, clips.length]);

  // Local one-shots (wave) return to idle so the state machine + network agree.
  useEffect(() => {
    if (!isLocal) return;
    const onFinished = () => {
      const store = usePlayerStore.getState();
      if (ONE_SHOT.has(store.animation)) store.set({ animation: AvatarAnimation.IDLE });
    };
    mixer.addEventListener('finished', onFinished);
    return () => mixer.removeEventListener('finished', onFinished);
  }, [mixer, isLocal]);

  // Advance the mixer every frame.
  useFrame((_, delta) => mixer.update(delta));

  // Dev marker so browser tests can assert the humanoid path is active (and
  // whether the animation library loaded) without reaching into the scene graph.
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    (window as unknown as { __humanoid?: unknown }).__humanoid = {
      mounted: true,
      url,
      clipCount: clips.length,
    };
  }

  return (
    <group ref={group}>
      <primitive object={model} />
    </group>
  );
}

class HumanoidErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Intentionally NOT preloading ANIMATIONS_URL here — loadAnimations() fetches it
// lazily and tolerates a 404, so KayKit-only sessions never hit a missing asset.
