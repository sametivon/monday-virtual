'use client';

import { Suspense, useEffect, useRef, useState, type ComponentType } from 'react';
import { Billboard, Text, useTexture } from '@react-three/drei';
import { CanvasTexture, SRGBColorSpace, VideoTexture } from 'three';
import type { Track } from 'livekit-client';
import { ObjectType, type SceneObjectDTO } from '@mvs/shared';
import { statusBreakdown, useBoardData } from '@/monday/useBoardData';
import { useScreenShareTile } from '@/media/useScreenShare';
import { useSlideStore } from '@/stores/slideStore';
import { materialize, useWhiteboardStore } from '@/stores/whiteboardStore';
import { drawBoard } from '@/whiteboard/draw';

/**
 * Object renderer registry (M2): one component per ObjectType, all primitive-
 * based placeholders with consistent proportions. Designed scenes swap these
 * for GLTF models via `config.modelUrl` later without touching the registry's
 * contract: every renderer receives the full object and renders at the local
 * origin — the dispatcher applies the transform.
 */
export interface ObjectRendererProps {
  object: SceneObjectDTO;
}

function ObjectLabel({ text, y }: { text?: string; y: number }) {
  if (!text) return null;
  // Width the pill to the text (rough monospace estimate); height fixed.
  const fontSize = 0.22;
  const w = Math.max(1, text.length * fontSize * 0.6 + 0.5);
  const h = 0.5;
  return (
    <Billboard position={[0, y, 0]}>
      {/* Dark rounded pill backing so labels read as intentional UI chips
          rather than text floating in the air. */}
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#11151c" transparent opacity={0.72} depthWrite={false} />
      </mesh>
      <Text
        position={[0, 0, 0.01]}
        fontSize={fontSize}
        color="#eef2f6"
        anchorX="center"
        anchorY="middle"
      >
        {text}
      </Text>
      {/* Thin accent underline for a finished chip look. */}
      <mesh position={[0, -h / 2 + 0.03, 0.01]}>
        <planeGeometry args={[w * 0.82, 0.025]} />
        <meshBasicMaterial color="#d9a441" transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </Billboard>
  );
}

function label(object: SceneObjectDTO): string | undefined {
  return (object.config as { label?: string }).label;
}

/**
 * Live video texture from a LiveKit track. The video element never enters the
 * DOM — three.js samples it directly (which is why the room must not use
 * adaptiveStream; see mediaController).
 */
function useTrackTexture(track: Track | null): VideoTexture | null {
  const [texture, setTexture] = useState<VideoTexture | null>(null);

  useEffect(() => {
    if (!track) {
      setTexture(null);
      return;
    }
    const video = track.attach() as HTMLVideoElement; // creates + autoplays
    video.muted = true;
    const tex = new VideoTexture(video);
    tex.colorSpace = SRGBColorSpace;
    setTexture(tex);
    return () => {
      track.detach(video);
      tex.dispose();
      setTexture(null);
    };
  }, [track]);

  return texture;
}

/** A slide image as an unlit screen material (suspends while the image loads). */
function SlideMaterial({ url }: { url: string }) {
  const tex = useTexture(url);
  tex.colorSpace = SRGBColorSpace;
  return <meshBasicMaterial key={url} map={tex} toneMapped={false} />;
}

/**
 * Wall screen on a stand. When someone presents (screen share in the
 * space-wide room — or in a table sub-room for huddle screens), the live
 * share renders onto the panel as a video texture (Phase 2).
 */
function ScreenRenderer({ object }: ObjectRendererProps) {
  const config = object.config as {
    source?: string;
    slides?: string[];
    slideIndex?: number;
  };
  const tile = useScreenShareTile();
  const live = config.source === 'screenshare' ? tile : null;
  const texture = useTrackTexture(live?.track ?? null);

  // Live screen-share wins; otherwise show the current deck slide (synced
  // index from the socket, defaulting to the persisted starting index).
  const slides = config.slides ?? [];
  const liveIndex = useSlideStore((s) => s.index[object.id]);
  const slideIndex = liveIndex ?? config.slideIndex ?? 0;
  const slideUrl = !texture && slides.length > 0 ? slides[Math.min(slideIndex, slides.length - 1)] : undefined;

  return (
    <group>
      <mesh castShadow position={[0, 2.1, 0]}>
        <boxGeometry args={[4.2, 2.4, 0.14]} />
        <meshStandardMaterial color="#2d3436" />
      </mesh>
      <mesh position={[0, 2.1, 0.08]}>
        <planeGeometry args={[3.9, 2.1]} />
        {texture ? (
          <meshBasicMaterial key="live" map={texture} toneMapped={false} />
        ) : slideUrl ? (
          <Suspense fallback={<meshStandardMaterial key="slideload" color="#0b0d12" />}>
            <SlideMaterial url={slideUrl} />
          </Suspense>
        ) : (
          <meshStandardMaterial key="off" color="#0b0d12" emissive="#1e272e" emissiveIntensity={0.6} />
        )}
      </mesh>
      {slideUrl && (
        <Text position={[0, 0.82, 0.1]} fontSize={0.13} color="#b2bec3" anchorX="center" anchorY="middle">
          {`Slide ${slideIndex + 1} / ${slides.length}`}
        </Text>
      )}
      {texture && live && (
        <Text
          position={[0, 0.82, 0.1]}
          fontSize={0.16}
          color="#ff6b6b"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000000"
        >
          {`● LIVE · ${live.local ? 'You' : live.participantName}`}
        </Text>
      )}
      {/* Accent light bar under the screen (venue LED-wall look). */}
      <mesh position={[0, 0.86, 0.06]}>
        <boxGeometry args={[4.0, 0.05, 0.04]} />
        <meshStandardMaterial color="#d9a441" emissive="#d9a441" emissiveIntensity={0.9} />
      </mesh>
      {[-1.6, 1.6].map((x) => (
        <mesh key={x} castShadow position={[x, 0.85, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 1.7, 8]} />
          <meshStandardMaterial color="#636e72" />
        </mesh>
      ))}
      <ObjectLabel text={label(object)} y={3.6} />
    </group>
  );
}

/**
 * Live Monday-board panel (Phase 2): inside the monday iframe the face shows
 * the bound board's name, item count, and top status KPIs, refreshed on the
 * object's cadence; outside the iframe (no sessionToken) it stays static.
 * Click still opens the full DashboardModal.
 */
function DashboardRenderer({ object }: ObjectRendererProps) {
  const config = object.config as { mondayBoardId?: string; refreshSeconds?: number };
  // Seeded placeholder ids count as "unpinned" → fall back to the first board.
  const boardId = config.mondayBoardId === 'demo-board-1' ? undefined : config.mondayBoardId;
  const data = useBoardData(boardId, config.refreshSeconds ?? 60);
  const rows = data ? statusBreakdown(data).slice(0, 3) : [];

  return (
    <group>
      <mesh castShadow position={[0, 1.8, 0]}>
        <boxGeometry args={[2.8, 1.7, 0.12]} />
        <meshStandardMaterial color="#1a2433" />
      </mesh>
      <mesh position={[0, 1.8, 0.07]}>
        <planeGeometry args={[2.6, 1.5]} />
        <meshStandardMaterial
          color={data ? '#071b30' : '#0a3d62'}
          emissive="#0984e3"
          emissiveIntensity={data ? 0.15 : 0.45}
        />
      </mesh>
      {data && (
        <group position={[0, 0, 0.08]}>
          <Text
            position={[0, 2.34, 0]}
            fontSize={0.16}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            maxWidth={2.3}
          >
            {data.name}
          </Text>
          <Text position={[0, 2.12, 0]} fontSize={0.11} color="#74b9ff" anchorX="center" anchorY="middle">
            {`${data.items.length} items`}
          </Text>
          {rows.map(([status, count], i) => (
            <Text
              key={status}
              position={[0, 1.86 - i * 0.26, 0]}
              fontSize={0.14}
              color="#dfe6e9"
              anchorX="center"
              anchorY="middle"
              maxWidth={2.3}
            >
              {`${count} · ${status}`}
            </Text>
          ))}
        </group>
      )}
      <mesh castShadow position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.06, 0.1, 1, 8]} />
        <meshStandardMaterial color="#636e72" />
      </mesh>
      <ObjectLabel text={label(object)} y={2.95} />
    </group>
  );
}

/**
 * Live canvas texture from the whiteboard op log — the in-world board always
 * mirrors what the modal draws (shared drawBoard + materialize).
 */
function useWhiteboardTexture(objectId: string): CanvasTexture | null {
  const version = useWhiteboardStore((s) => s.boards[objectId]?.version ?? 0);
  const ensureLoaded = useWhiteboardStore((s) => s.ensureLoaded);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [texture, setTexture] = useState<CanvasTexture | null>(null);

  useEffect(() => ensureLoaded(objectId), [ensureLoaded, objectId]);

  useEffect(() => {
    if (!canvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 640;
      canvasRef.current = canvas;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ops = useWhiteboardStore.getState().boards[objectId]?.ops ?? [];
    drawBoard(ctx, materialize(ops), canvas.width, canvas.height);
    setTexture((prev) => {
      if (prev) {
        prev.needsUpdate = true;
        return prev;
      }
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      return tex;
    });
  }, [objectId, version]);

  useEffect(() => () => texture?.dispose(), [texture]);

  return texture;
}

/** Collaborative whiteboard — click opens the drawing modal (Phase 2). */
function WhiteboardRenderer({ object }: ObjectRendererProps) {
  const { width = 4, height = 2.5 } = object.config as { width?: number; height?: number };
  const texture = useWhiteboardTexture(object.id);
  return (
    <group>
      <mesh castShadow position={[0, height / 2 + 0.6, 0]}>
        <boxGeometry args={[width, height, 0.1]} />
        <meshStandardMaterial color="#d8dde6" />
      </mesh>
      <mesh position={[0, height / 2 + 0.6, 0.06]}>
        <planeGeometry args={[width - 0.15, height - 0.15]} />
        {texture ? (
          <meshBasicMaterial key="board" map={texture} toneMapped={false} />
        ) : (
          <meshStandardMaterial key="blank" color="#f5f6f8" />
        )}
      </mesh>
      {[-width / 2 + 0.2, width / 2 - 0.2].map((x) => (
        <mesh key={x} castShadow position={[x, 0.3, 0]}>
          <cylinderGeometry args={[0.04, 0.06, 0.6, 8]} />
          <meshStandardMaterial color="#636e72" />
        </mesh>
      ))}
      <ObjectLabel text={label(object)} y={height + 1.1} />
    </group>
  );
}

/** Round meeting table — joins occupants into a full-volume sub-room (M4). */
function MeetingTableRenderer({ object }: ObjectRendererProps) {
  const accent = (object.config as { color?: string }).color ?? '#d9a441';
  return (
    <group>
      {/* Wood top with a thin accent rim — cohesive with the warm interior
          (was a clashing flat purple). */}
      <mesh castShadow receiveShadow position={[0, 0.74, 0]}>
        <cylinderGeometry args={[1.5, 1.5, 0.09, 40]} />
        <meshStandardMaterial color="#7a5a3a" roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.785, 0]}>
        <torusGeometry args={[1.5, 0.035, 8, 48]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.25} />
      </mesh>
      {/* Pedestal column. */}
      <mesh castShadow position={[0, 0.37, 0]}>
        <cylinderGeometry args={[0.13, 0.2, 0.74, 16]} />
        <meshStandardMaterial color="#2d3436" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Wide foot so the table reads grounded, not floating. */}
      <mesh castShadow receiveShadow position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.78, 0.92, 0.06, 32]} />
        <meshStandardMaterial color="#23282b" roughness={0.7} metalness={0.3} />
      </mesh>
      <ObjectLabel text={label(object)} y={1.7} />
    </group>
  );
}

/** Sittable chair (click → sit, handled by the dispatcher). */
function ChairRenderer({ object }: ObjectRendererProps) {
  const config = object.config as { style?: string; color?: string };
  if (config.style === 'theater') return <TheaterSeat color={config.color ?? '#5e2333'} />;
  return (
    <group>
      <mesh castShadow position={[0, 0.45, 0]}>
        <boxGeometry args={[0.5, 0.09, 0.5]} />
        <meshStandardMaterial color="#5b6470" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 0.78, -0.22]}>
        <boxGeometry args={[0.5, 0.6, 0.07]} />
        <meshStandardMaterial color="#5b6470" roughness={0.85} />
      </mesh>
      {[
        [-0.2, -0.2],
        [-0.2, 0.2],
        [0.2, -0.2],
        [0.2, 0.2],
      ].map(([x, z]) => (
        <mesh key={`${x}:${z}`} castShadow position={[x!, 0.21, z!]}>
          <cylinderGeometry args={[0.025, 0.025, 0.42, 6]} />
          <meshStandardMaterial color="#636e72" />
        </mesh>
      ))}
    </group>
  );
}

/** Plush auditorium seat: pedestal, padded seat/back, armrests. */
function TheaterSeat({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[0.5, 0.36, 0.5]} />
        <meshStandardMaterial color="#2b2026" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.44, 0.02]}>
        <boxGeometry args={[0.6, 0.14, 0.55]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, 0.86, -0.26]} rotation={[-0.12, 0, 0]}>
        <boxGeometry args={[0.6, 0.78, 0.16]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {[-0.34, 0.34].map((x) => (
        <mesh key={x} castShadow position={[x, 0.58, 0]}>
          <boxGeometry args={[0.08, 0.1, 0.5]} />
          <meshStandardMaterial color="#2b2026" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** Work desk with a monitor. */
function DeskRenderer({ object }: ObjectRendererProps) {
  return (
    <group>
      <mesh castShadow position={[0, 0.73, 0]}>
        <boxGeometry args={[1.6, 0.06, 0.8]} />
        <meshStandardMaterial color="#636e72" />
      </mesh>
      {[
        [-0.72, -0.32],
        [-0.72, 0.32],
        [0.72, -0.32],
        [0.72, 0.32],
      ].map(([x, z]) => (
        <mesh key={`${x}:${z}`} castShadow position={[x!, 0.35, z!]}>
          <boxGeometry args={[0.06, 0.7, 0.06]} />
          <meshStandardMaterial color="#2d3436" />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.05, -0.2]}>
        <boxGeometry args={[0.65, 0.4, 0.05]} />
        <meshStandardMaterial color="#0b0d12" emissive="#1e272e" emissiveIntensity={0.5} />
      </mesh>
      <ObjectLabel text={label(object)} y={1.6} />
    </group>
  );
}

/** Teleport portal to another space. */
function PortalRenderer({ object }: ObjectRendererProps) {
  return (
    <group>
      <mesh castShadow position={[0, 1.4, 0]}>
        <torusGeometry args={[1.1, 0.09, 12, 40]} />
        <meshStandardMaterial color="#00b894" emissive="#00b894" emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <circleGeometry args={[1.0, 32]} />
        <meshStandardMaterial color="#00b894" transparent opacity={0.18} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 0.04, 24]} />
        <meshStandardMaterial color="#0e3b32" />
      </mesh>
      <ObjectLabel text={label(object)} y={2.85} />
    </group>
  );
}

/** Clickable external link sign. */
function LinkRenderer({ object }: ObjectRendererProps) {
  return (
    <group>
      <mesh castShadow position={[0, 1.5, 0]}>
        <boxGeometry args={[1.3, 0.75, 0.08]} />
        <meshStandardMaterial color="#fab1a0" emissive="#fab1a0" emissiveIntensity={0.25} />
      </mesh>
      <mesh castShadow position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 1.1, 8]} />
        <meshStandardMaterial color="#636e72" />
      </mesh>
      <ObjectLabel text={label(object)} y={2.2} />
    </group>
  );
}

/** Video panel (playback lands with the media plane, M4). */
function VideoRenderer({ object }: ObjectRendererProps) {
  return (
    <group>
      <mesh castShadow position={[0, 1.9, 0]}>
        <boxGeometry args={[3.2, 1.9, 0.12]} />
        <meshStandardMaterial color="#2d3436" />
      </mesh>
      <mesh position={[0, 1.9, 0.07]}>
        <planeGeometry args={[3, 1.7]} />
        <meshStandardMaterial color="#1a0d0a" emissive="#e17055" emissiveIntensity={0.3} />
      </mesh>
      <mesh castShadow position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.06, 0.1, 1, 8]} />
        <meshStandardMaterial color="#636e72" />
      </mesh>
      <ObjectLabel text={label(object)} y={3.1} />
    </group>
  );
}

/** Spawn points are data, not visuals. */
function SpawnPointRenderer(_props: ObjectRendererProps) {
  return null;
}

export const OBJECT_RENDERERS: Record<ObjectType, ComponentType<ObjectRendererProps>> = {
  [ObjectType.SCREEN]: ScreenRenderer,
  [ObjectType.DASHBOARD]: DashboardRenderer,
  [ObjectType.WHITEBOARD]: WhiteboardRenderer,
  [ObjectType.MEETING_TABLE]: MeetingTableRenderer,
  [ObjectType.CHAIR]: ChairRenderer,
  [ObjectType.DESK]: DeskRenderer,
  [ObjectType.PORTAL]: PortalRenderer,
  [ObjectType.LINK]: LinkRenderer,
  [ObjectType.VIDEO]: VideoRenderer,
  [ObjectType.SPAWN_POINT]: SpawnPointRenderer,
};
