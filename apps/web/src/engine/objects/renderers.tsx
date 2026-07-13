'use client';

import { Suspense, useEffect, useRef, useState, type ComponentType } from 'react';
import { Billboard, Text, useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  CanvasTexture,
  DoubleSide,
  MathUtils,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  VideoTexture,
  type Group,
  type MeshBasicMaterial,
} from 'three';
import type { Track } from 'livekit-client';
import { ObjectType, type SceneObjectDTO } from '@mvs/shared';
import { SCENE } from '@/engine/palette';
import { ModelObject, type ModelSpec } from './ModelObject';
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
  return <LabelPill text={text} y={y} />;
}

const LABEL_FADE_START = 13;
const LABEL_FADE_END = 18;
const LABEL_TMP = new Vector3();

/**
 * Light paper pill in the app's ink-on-paper language (B4). depthTest stays ON
 * so labels no longer punch through walls, and the chip fades out past ~13m —
 * far rooms stop stacking floating chips over everything.
 */
function LabelPill({ text, y }: { text: string; y: number }) {
  const group = useRef<Group>(null);
  const bg = useRef<MeshBasicMaterial>(null);
  const edge = useRef<MeshBasicMaterial>(null);
  const label = useRef<{ fillOpacity: number }>(null);
  // Width the pill to the text (rough monospace estimate); height fixed.
  const fontSize = 0.22;
  const w = Math.max(1, text.length * fontSize * 0.6 + 0.5);
  const h = 0.5;

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const d = camera.position.distanceTo(g.getWorldPosition(LABEL_TMP));
    const t = MathUtils.clamp((LABEL_FADE_END - d) / (LABEL_FADE_END - LABEL_FADE_START), 0, 1);
    g.visible = t > 0.02;
    if (bg.current) bg.current.opacity = 0.92 * t;
    if (edge.current) edge.current.opacity = 0.55 * t;
    // fillOpacity is material-level in troika — animatable without a re-sync.
    if (label.current) label.current.fillOpacity = t;
  });

  return (
    <Billboard position={[0, y, 0]}>
      <group ref={group}>
        <mesh>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial ref={bg} color={SCENE.paper} transparent opacity={0.92} depthWrite={false} />
        </mesh>
        <Text
          ref={label as never}
          position={[0, 0, 0.01]}
          fontSize={fontSize}
          color={SCENE.ink}
          anchorX="center"
          anchorY="middle"
        >
          {text}
        </Text>
        {/* Hairline brand underline — the chip's one quiet accent. */}
        <mesh position={[0, -h / 2 + 0.03, 0.01]}>
          <planeGeometry args={[w * 0.82, 0.02]} />
          <meshBasicMaterial ref={edge} color={SCENE.violet} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      </group>
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

// A concave (cinema-style) screen: a subdivided plane bent forward at the edges
// so it wraps toward the audience. Standard plane UVs are preserved, so the
// video/slide texture maps without mirroring; the unlit material ignores the
// tweaked normals. Curvature is proportional to width, so it scales uniformly.
const SCREEN_CURVE = 0.34; // forward bulge of the edges, in base units
function bentScreen(w: number, h: number, depth: number): PlaneGeometry {
  const geo = new PlaneGeometry(w, h, 48, 1);
  const pos = geo.attributes.position;
  const half = w / 2;
  for (let i = 0; i < pos.count; i++) {
    const tx = pos.getX(i) / half; // -1 (left) .. 1 (right)
    pos.setZ(i, depth * tx * tx); // edges come toward the viewer
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
const SCREEN_BACK_GEO = bentScreen(4.2, 2.4, SCREEN_CURVE);
const SCREEN_VIDEO_GEO = bentScreen(3.9, 2.1, SCREEN_CURVE);

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
      {/* Concave bezel + video surface (cinema-style wrap toward the audience).
          Anchored low (bottom ≈ floor) so it scales UP, not up-and-away — a big
          screen stays viewable instead of climbing out of the camera frame. */}
      <mesh castShadow position={[0, 1.5, 0]} geometry={SCREEN_BACK_GEO}>
        <meshStandardMaterial color={SCENE.metalDark} metalness={0.25} roughness={0.6} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 1.5, 0.06]} geometry={SCREEN_VIDEO_GEO}>
        {texture ? (
          <meshBasicMaterial key="live" map={texture} toneMapped={false} side={DoubleSide} />
        ) : slideUrl ? (
          <Suspense fallback={<meshStandardMaterial key="slideload" color={SCENE.screen} side={DoubleSide} />}>
            <SlideMaterial url={slideUrl} />
          </Suspense>
        ) : (
          <meshStandardMaterial key="off" color={SCENE.screen} emissive={SCENE.screenGlow} emissiveIntensity={0.6} side={DoubleSide} />
        )}
      </mesh>
      {slideUrl && (
        <Text position={[0, 0.22, 0.1]} fontSize={0.13} color={SCENE.textDimOnScreen} anchorX="center" anchorY="middle">
          {`Slide ${slideIndex + 1} / ${slides.length}`}
        </Text>
      )}
      {texture && live && (
        <Text
          position={[0, 0.22, 0.1]}
          fontSize={0.16}
          color={SCENE.danger}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000000"
        >
          {`● LIVE · ${live.local ? 'You' : live.participantName}`}
        </Text>
      )}
      {/* Accent light bar along the screen base (venue LED-wall look). */}
      <mesh position={[0, 0.26, 0.06]}>
        <boxGeometry args={[4.0, 0.05, 0.04]} />
        <meshStandardMaterial color={SCENE.amber} emissive={SCENE.amber} emissiveIntensity={0.9} />
      </mesh>
      <ObjectLabel text={label(object)} y={2.9} />
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
        <meshStandardMaterial color={SCENE.metalDark} />
      </mesh>
      <mesh position={[0, 1.8, 0.07]}>
        <planeGeometry args={[2.6, 1.5]} />
        <meshStandardMaterial
          color={data ? SCENE.violetScreen : SCENE.violetScreenDim}
          emissive={SCENE.violet}
          emissiveIntensity={data ? 0.15 : 0.45}
        />
      </mesh>
      {data && (
        <group position={[0, 0, 0.08]}>
          <Text
            position={[0, 2.34, 0]}
            fontSize={0.16}
            color={SCENE.paper}
            anchorX="center"
            anchorY="middle"
            maxWidth={2.3}
          >
            {data.name}
          </Text>
          <Text position={[0, 2.12, 0]} fontSize={0.11} color={SCENE.violetSoft} anchorX="center" anchorY="middle">
            {`${data.items.length} items`}
          </Text>
          {rows.map(([status, count], i) => (
            <Text
              key={status}
              position={[0, 1.86 - i * 0.26, 0]}
              fontSize={0.14}
              color={SCENE.textOnScreen}
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
        <meshStandardMaterial color={SCENE.metal} />
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
        <meshStandardMaterial color={SCENE.paperDim} />
      </mesh>
      <mesh position={[0, height / 2 + 0.6, 0.06]}>
        <planeGeometry args={[width - 0.15, height - 0.15]} />
        {texture ? (
          <meshBasicMaterial key="board" map={texture} toneMapped={false} />
        ) : (
          <meshStandardMaterial key="blank" color={SCENE.paper} />
        )}
      </mesh>
      {[-width / 2 + 0.2, width / 2 - 0.2].map((x) => (
        <mesh key={x} castShadow position={[x, 0.3, 0]}>
          <cylinderGeometry args={[0.04, 0.06, 0.6, 8]} />
          <meshStandardMaterial color={SCENE.metal} />
        </mesh>
      ))}
      <ObjectLabel text={label(object)} y={height + 1.1} />
    </group>
  );
}

/** Round meeting table — joins occupants into a full-volume sub-room (M4). */
function MeetingTableRenderer({ object }: ObjectRendererProps) {
  const accent = (object.config as { color?: string }).color ?? SCENE.amber;
  return (
    <group>
      {/* Wood top with a thin accent rim — cohesive with the warm interior
          (was a clashing flat purple). */}
      <mesh castShadow receiveShadow position={[0, 0.74, 0]}>
        <cylinderGeometry args={[1.5, 1.5, 0.09, 40]} />
        <meshStandardMaterial color={SCENE.wood} roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.785, 0]}>
        <torusGeometry args={[1.5, 0.035, 8, 48]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.25} />
      </mesh>
      {/* Pedestal column. */}
      <mesh castShadow position={[0, 0.37, 0]}>
        <cylinderGeometry args={[0.13, 0.2, 0.74, 16]} />
        <meshStandardMaterial color={SCENE.inkSoft} roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Wide foot so the table reads grounded, not floating. */}
      <mesh castShadow receiveShadow position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.78, 0.92, 0.06, 32]} />
        <meshStandardMaterial color={SCENE.metalDark} roughness={0.7} metalness={0.3} />
      </mesh>
      <ObjectLabel text={label(object)} y={1.7} />
    </group>
  );
}

/**
 * Registry order for prop bodies (B6): an explicit `config.modelUrl` wins,
 * then the per-type default GLB, then the procedural primitives — which also
 * serve as the Suspense fallback so props never pop in from nothing.
 */
const DEFAULT_MODELS: { chair: ModelSpec; desk: ModelSpec } = {
  chair: {
    url: '/models/chairDesk.glb',
    height: 0.92,
    tints: { carpet: SCENE.slate, metalMedium: SCENE.metal },
  },
  desk: {
    url: '/models/desk.glb',
    height: 0.78,
    footprint: 1.7,
    tints: { wood: '#a9805c', metal: '#9a95a1' },
  },
};

function propSpec(object: SceneObjectDTO, fallback: ModelSpec): ModelSpec {
  const url = (object.config as { modelUrl?: string }).modelUrl;
  return url ? { ...fallback, url } : fallback;
}

/** Sittable chair (click → sit, handled by the dispatcher). */
function ChairRenderer({ object }: ObjectRendererProps) {
  const config = object.config as { style?: string; color?: string };
  if (config.style === 'theater') return <TheaterSeat color={config.color ?? SCENE.theaterWine} />;
  return (
    <Suspense fallback={<ProceduralChair />}>
      <ModelObject spec={propSpec(object, DEFAULT_MODELS.chair)} />
    </Suspense>
  );
}

/** Primitive chair — fallback body while the GLB streams (and if none is set). */
function ProceduralChair() {
  return (
    <group>
      <mesh castShadow position={[0, 0.45, 0]}>
        <boxGeometry args={[0.5, 0.09, 0.5]} />
        <meshStandardMaterial color={SCENE.slate} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 0.78, -0.22]}>
        <boxGeometry args={[0.5, 0.6, 0.07]} />
        <meshStandardMaterial color={SCENE.slate} roughness={0.85} />
      </mesh>
      {[
        [-0.2, -0.2],
        [-0.2, 0.2],
        [0.2, -0.2],
        [0.2, 0.2],
      ].map(([x, z]) => (
        <mesh key={`${x}:${z}`} castShadow position={[x!, 0.21, z!]}>
          <cylinderGeometry args={[0.025, 0.025, 0.42, 6]} />
          <meshStandardMaterial color={SCENE.metal} />
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
        <meshStandardMaterial color={SCENE.inkSoft} roughness={0.9} />
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
          <meshStandardMaterial color={SCENE.inkSoft} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** Work desk. */
function DeskRenderer({ object }: ObjectRendererProps) {
  return (
    <group>
      <Suspense fallback={<ProceduralDesk />}>
        <ModelObject spec={propSpec(object, DEFAULT_MODELS.desk)} />
      </Suspense>
      <ObjectLabel text={label(object)} y={1.6} />
    </group>
  );
}

/** Primitive desk with a monitor — fallback body while the GLB streams. */
function ProceduralDesk() {
  return (
    <group>
      <mesh castShadow position={[0, 0.73, 0]}>
        <boxGeometry args={[1.6, 0.06, 0.8]} />
        <meshStandardMaterial color={SCENE.metal} />
      </mesh>
      {[
        [-0.72, -0.32],
        [-0.72, 0.32],
        [0.72, -0.32],
        [0.72, 0.32],
      ].map(([x, z]) => (
        <mesh key={`${x}:${z}`} castShadow position={[x!, 0.35, z!]}>
          <boxGeometry args={[0.06, 0.7, 0.06]} />
          <meshStandardMaterial color={SCENE.inkSoft} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.05, -0.2]}>
        <boxGeometry args={[0.65, 0.4, 0.05]} />
        <meshStandardMaterial color={SCENE.screen} emissive={SCENE.screenGlow} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

/** Teleport portal to another space. */
function PortalRenderer({ object }: ObjectRendererProps) {
  return (
    <group>
      <mesh castShadow position={[0, 1.4, 0]}>
        <torusGeometry args={[1.1, 0.09, 12, 40]} />
        <meshStandardMaterial color={SCENE.portalGlow} emissive={SCENE.portalGlow} emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <circleGeometry args={[1.0, 32]} />
        <meshStandardMaterial color={SCENE.portalGlow} transparent opacity={0.18} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 0.04, 24]} />
        <meshStandardMaterial color={SCENE.portalBase} />
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
        <meshStandardMaterial color={SCENE.signPaper} emissive={SCENE.signPaper} emissiveIntensity={0.25} />
      </mesh>
      <mesh castShadow position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 1.1, 8]} />
        <meshStandardMaterial color={SCENE.metal} />
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
        <meshStandardMaterial color={SCENE.inkSoft} />
      </mesh>
      <mesh position={[0, 1.9, 0.07]}>
        <planeGeometry args={[3, 1.7]} />
        <meshStandardMaterial color={SCENE.violetScreen} emissive={SCENE.amber} emissiveIntensity={0.3} />
      </mesh>
      <mesh castShadow position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.06, 0.1, 1, 8]} />
        <meshStandardMaterial color={SCENE.metal} />
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
