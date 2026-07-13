'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { AOI_RADIUS, AvatarAnimation, type PlayerState } from '@mvs/shared';
import { remoteTransforms, usePresenceStore } from '@/stores/presenceStore';
import { usePlayerStore } from '@/stores/playerStore';
import { Avatar } from './Avatar';

const SNAP_DISTANCE = 6; // m — beyond this it's a teleport, not a glide
const AOI_RADIUS_SQ = AOI_RADIUS * AOI_RADIUS;
const NAME_LOD_SQ = 20 * 20; // m² — nameplates unreadable beyond this anyway (M6)

/**
 * A remote player, interpolated every frame from its tick target (M3):
 * exponential position smoothing, shortest-arc yaw, snap on teleports, and
 * AOI culling — players beyond AOI_RADIUS are hidden and skip all work.
 */
export function RemoteAvatar({ player }: { player: PlayerState }) {
  const ref = useRef<Group>(null);
  const [animation, setAnimation] = useState<AvatarAnimation>(player.animation);
  const [showName, setShowName] = useState(true);
  const [inAoi, setInAoi] = useState(true);
  // Rare events — fine to re-render on change.
  const handRaised = usePresenceStore((s) => Boolean(s.hands[player.userId]));
  const reaction = usePresenceStore((s) => s.reactions[player.userId]);

  useFrame((_, delta) => {
    const group = ref.current;
    const t = remoteTransforms.get(player.userId);
    if (!group || !t) return;

    // AOI: outside the radius, hide and stop simulating entirely.
    const me = usePlayerStore.getState().position;
    const ddx = t.target.x - me[0];
    const ddz = t.target.z - me[2];
    const distSq = ddx * ddx + ddz * ddz;
    const outside = distSq > AOI_RADIUS_SQ;
    if (group.visible === outside) group.visible = !outside;
    // Html overlays don't inherit three.js visibility — gate them in React.
    if (inAoi === outside) setInAoi(!outside);
    if (outside) return;

    // Nameplate LOD (state only flips at the boundary — re-renders are rare).
    const nameVisible = distSq < NAME_LOD_SQ;
    if (nameVisible !== showName) setShowName(nameVisible);

    const { current, target } = t;
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    const dz = target.z - current.z;

    if (dx * dx + dy * dy + dz * dz > SNAP_DISTANCE * SNAP_DISTANCE) {
      current.x = target.x;
      current.y = target.y;
      current.z = target.z;
      current.yaw = target.yaw;
    } else {
      // Framerate-independent smoothing tuned to glide across one tick gap.
      const alpha = 1 - Math.pow(0.0005, delta);
      current.x += dx * alpha;
      current.y += dy * alpha;
      current.z += dz * alpha;
      current.yaw += shortestArc(target.yaw - current.yaw) * alpha;
    }

    group.position.set(current.x, current.y, current.z);
    group.rotation.y = current.yaw;

    if (t.animation !== animation) setAnimation(t.animation);
  }, -2);

  const config = (player.avatarConfig ?? {}) as {
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
        name={player.name}
        color={config.color ?? '#6c5ce7'}
        modelId={config.modelId ?? 'default'}
        parts={config.parts}
        customModelUrl={config.customModelUrl}
        showName={showName}
        showOverlays={inAoi}
        handRaised={handRaised}
        reaction={reaction}
      />
    </group>
  );
}

/** Wrap an angle delta to [-π, π] so yaw lerps take the short way around. */
function shortestArc(delta: number): number {
  return ((delta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}
