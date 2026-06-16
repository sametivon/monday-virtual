/**
 * Scene & object configuration schemas — the "world manifest".
 *
 * A Space's `sceneConfig` plus its `SceneObject[]` fully describe a renderable
 * world. The 3D engine renders ANY scene from this data; adding a room means
 * inserting rows, not shipping code. These zod schemas are the single source
 * of truth, shared by the API (validation), the admin scene editor (forms),
 * and the web engine (typed rendering).
 */

import { z } from 'zod';
import { ObjectType, SpaceType } from '../enums';

// ── Primitives ─────────────────────────────────────────────────────────────

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3Schema>;

export const TransformSchema = z.object({
  position: Vec3Schema.default([0, 0, 0]),
  rotation: Vec3Schema.default([0, 0, 0]), // euler radians
  scale: Vec3Schema.default([1, 1, 1]),
});
export type Transform = z.infer<typeof TransformSchema>;

export const ColorSchema = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'hex color');

// ── Scene-level config ─────────────────────────────────────────────────────

export const SpawnPointSchema = z.object({
  id: z.string(),
  position: Vec3Schema,
  rotation: z.number().default(0), // yaw radians
});
export type SpawnPoint = z.infer<typeof SpawnPointSchema>;

/**
 * Enclosed, themed interior (Phase 2 visual overhaul): when present the
 * engine builds a real room — textured floor, walls with acoustic panels,
 * ceiling with warm light panels — instead of the infinite-grid void.
 */
export const InteriorConfigSchema = z.object({
  floor: z.enum(['wood', 'carpet', 'carpet-hex']).default('wood'),
  /** Tint for carpet floors; the hex pattern's base color. */
  floorColor: ColorSchema.default('#232c3f'),
  /** Hex-pattern lines, wall trim glow. */
  accentColor: ColorSchema.default('#c9a23f'),
  wallColor: ColorSchema.default('#8a795f'),
  /** Dark acoustic wall panels. */
  panelColor: ColorSchema.default('#42303a'),
  ceilingColor: ColorSchema.default('#2b2723'),
  /** Emissive ceiling light panels. */
  lightColor: ColorSchema.default('#ffe7c4'),
  /** Corner greenery. */
  plants: z.boolean().default(true),
  /** Wall height (m); bounds may be taller for camera headroom. */
  wallHeight: z.number().positive().default(7),
  /**
   * When true (default), the tenant's branding accent recolors the scene's
   * accent (trim/glow/portal/stage lip) at manifest time, so every tenant's
   * rooms carry their brand. A bespoke per-space scene can set false to keep
   * its hand-picked accent.
   */
  themeFromBranding: z.boolean().default(true),
});
export type InteriorConfig = z.infer<typeof InteriorConfigSchema>;

export const SceneEnvironmentSchema = z.object({
  /** GLTF/GLB url for the static environment shell, served from object storage. */
  modelUrl: z.string().url().optional(),
  /** HDRI / skybox preset or url. */
  skybox: z.string().default('city'),
  groundColor: ColorSchema.default('#1f2430'),
  interior: InteriorConfigSchema.optional(),
  fog: z
    .object({ color: ColorSchema, near: z.number(), far: z.number() })
    .optional(),
});

export const SceneLightingSchema = z.object({
  ambientIntensity: z.number().min(0).max(4).default(0.6),
  ambientColor: ColorSchema.default('#ffffff'),
  directionalIntensity: z.number().min(0).max(8).default(1.2),
  directionalPosition: Vec3Schema.default([5, 10, 5]),
  shadows: z.boolean().default(true),
});

/** Axis-aligned movement bounds; the engine clamps avatars inside. */
export const SceneBoundsSchema = z.object({
  min: Vec3Schema.default([-50, 0, -50]),
  max: Vec3Schema.default([50, 20, 50]),
});

/**
 * Spatial-audio falloff tuning, per scene. Volume = clamp((max - d)/(max - min)).
 * Inside a meeting sub-room the falloff is bypassed (full volume).
 */
export const SpatialAudioConfigSchema = z.object({
  minDistance: z.number().positive().default(2), // full volume within this radius
  maxDistance: z.number().positive().default(20), // silent beyond this radius
  rolloff: z.enum(['linear', 'inverse', 'exponential']).default('inverse'),
});

/**
 * A raised presenter platform (auditorium/training). Anyone standing inside
 * is "on stage": the engine lifts them by `height`, and spatial audio
 * broadcasts their voice at full volume to the whole space.
 */
export const StageZoneSchema = z.object({
  center: Vec3Schema,
  /** Footprint [width, depth] on the XZ plane. */
  size: z.tuple([z.number().positive(), z.number().positive()]),
  height: z.number().nonnegative().default(0.5),
});
export type StageZone = z.infer<typeof StageZoneSchema>;

export function inStageZone(stage: StageZone, x: number, z: number): boolean {
  return (
    Math.abs(x - stage.center[0]) <= stage.size[0] / 2 &&
    Math.abs(z - stage.center[2]) <= stage.size[1] / 2
  );
}

export const SceneConfigSchema = z.object({
  version: z.literal(1).default(1),
  environment: SceneEnvironmentSchema.default({}),
  lighting: SceneLightingSchema.default({}),
  bounds: SceneBoundsSchema.default({}),
  spawnPoints: z.array(SpawnPointSchema).min(1).default([
    { id: 'default', position: [0, 0, 0], rotation: 0 },
  ]),
  spatialAudio: SpatialAudioConfigSchema.default({}),
  stage: StageZoneSchema.optional(),
});
export type SceneConfig = z.infer<typeof SceneConfigSchema>;

// ── Object configs (discriminated by type) ─────────────────────────────────

const BaseObjectFields = {
  modelUrl: z.string().url().optional(),
  label: z.string().optional(),
};

export const ScreenConfigSchema = z.object({
  type: z.literal(ObjectType.SCREEN),
  ...BaseObjectFields,
  /** Bind to a live media share (LiveKit screen-share track) or a static media url. */
  source: z.enum(['screenshare', 'video', 'image', 'iframe']).default('screenshare'),
  mediaUrl: z.string().url().optional(),
});

export const DashboardConfigSchema = z.object({
  type: z.literal(ObjectType.DASHBOARD),
  ...BaseObjectFields,
  mondayBoardId: z.string(),
  vizType: z.enum(['table', 'kpi', 'pipeline', 'workload', 'chart']).default('table'),
  /** Map logical fields → monday column ids. */
  columnMap: z.record(z.string(), z.string()).optional(),
  refreshSeconds: z.number().int().positive().default(60),
});

export const PortalConfigSchema = z.object({
  type: z.literal(ObjectType.PORTAL),
  ...BaseObjectFields,
  targetSpaceId: z.string(),
  targetSpawnPointId: z.string().optional(),
});

export const LinkConfigSchema = z.object({
  type: z.literal(ObjectType.LINK),
  ...BaseObjectFields,
  url: z.string().url(),
  openIn: z.enum(['newTab', 'modal']).default('newTab'),
});

export const VideoConfigSchema = z.object({
  type: z.literal(ObjectType.VIDEO),
  ...BaseObjectFields,
  videoUrl: z.string().url(),
  autoplay: z.boolean().default(false),
  loop: z.boolean().default(true),
});

export const WhiteboardConfigSchema = z.object({
  type: z.literal(ObjectType.WHITEBOARD),
  ...BaseObjectFields,
  width: z.number().positive().default(4),
  height: z.number().positive().default(2.5),
});

export const SeatConfigSchema = z.object({
  type: z.literal(ObjectType.CHAIR),
  ...BaseObjectFields,
  /** Yaw the avatar faces when seated. */
  sitRotation: z.number().default(0),
  /** Visual style: plain office chair or plush auditorium seat. */
  style: z.enum(['default', 'theater']).default('default'),
  color: ColorSchema.optional(),
});

/** Meeting table → joins occupants into a full-volume LiveKit sub-room. */
export const MeetingTableConfigSchema = z.object({
  type: z.literal(ObjectType.MEETING_TABLE),
  ...BaseObjectFields,
  capacity: z.number().int().positive().default(6),
  /** Sub-room key suffix; full key is `${tenantId}:${spaceId}:table:${roomKey}`. */
  roomKey: z.string(),
});

export const DeskConfigSchema = z.object({
  type: z.literal(ObjectType.DESK),
  ...BaseObjectFields,
});

export const SpawnPointObjectConfigSchema = z.object({
  type: z.literal(ObjectType.SPAWN_POINT),
  ...BaseObjectFields,
});

export const ObjectConfigSchema = z.discriminatedUnion('type', [
  ScreenConfigSchema,
  DashboardConfigSchema,
  PortalConfigSchema,
  LinkConfigSchema,
  VideoConfigSchema,
  WhiteboardConfigSchema,
  SeatConfigSchema,
  MeetingTableConfigSchema,
  DeskConfigSchema,
  SpawnPointObjectConfigSchema,
]);
export type ObjectConfig = z.infer<typeof ObjectConfigSchema>;

export const ObjectInteractionSchema = z.object({
  /** What happens on click — engine dispatches to the right handler. */
  onClick: z
    .enum(['open', 'teleport', 'sit', 'joinTable', 'openBoard', 'openLink', 'none'])
    .default('open'),
  permissionsRequired: z.array(z.string()).default([]),
  proximityRadius: z.number().positive().optional(), // auto-trigger within radius
});
export type ObjectInteraction = z.infer<typeof ObjectInteractionSchema>;

/** A fully-resolved scene object as rendered by the engine. */
export const SceneObjectSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(ObjectType),
  transform: TransformSchema,
  config: ObjectConfigSchema,
  interaction: ObjectInteractionSchema.optional(),
});
export type SceneObjectDTO = z.infer<typeof SceneObjectSchema>;

/** The complete payload the client needs to render a space. */
export const WorldManifestSchema = z.object({
  spaceId: z.string(),
  spaceType: z.nativeEnum(SpaceType),
  name: z.string(),
  scene: SceneConfigSchema,
  objects: z.array(SceneObjectSchema),
});
export type WorldManifest = z.infer<typeof WorldManifestSchema>;
