/**
 * @mvs/config — default scene presets and branding/config helpers.
 *
 * Scenes are data. A new tenant or a new room is provisioned by cloning one of
 * these presets and persisting it as a Space.sceneConfig. The admin scene
 * editor (Phase 2) edits the same shape. Presets are validated against the
 * shared zod schemas so they can never drift from the engine's expectations.
 */

import {
  BrandingPalette,
  BrandingPaletteSchema,
  ObjectType,
  SceneConfig,
  SceneConfigSchema,
  SceneObjectSchema,
  SpaceType,
  type ObjectConfig,
  type ObjectInteraction,
  type Transform,
} from '@mvs/shared';
import { z } from 'zod';

export const DEFAULT_PALETTE: BrandingPalette = BrandingPaletteSchema.parse({});

/**
 * Bump when the designed presets change in a way existing tenants should
 * receive. The API stores this alongside each space's sceneConfig and
 * refreshes stale ones at login (the scene editor will replace this with
 * explicit versioning).
 */
export const SCENE_REV = 13;

/** Per-space-type default scene config. All validated at module load. */
export const SCENE_PRESETS: Record<SpaceType, SceneConfig> = {
  [SpaceType.LOBBY]: SceneConfigSchema.parse({
    environment: {
      skybox: 'city',
      groundColor: '#241f1a',
      interior: {
        floor: 'wood',
        wallColor: '#9c8a72',
        panelColor: '#46333b',
        ceilingColor: '#332d27',
        accentColor: '#d9a441',
        lightColor: '#ffe7c4',
        wallHeight: 6,
      },
    },
    lighting: {
      ambientIntensity: 0.75,
      ambientColor: '#fff1dc',
      directionalIntensity: 1.1,
    },
    bounds: { min: [-24, 0, -20], max: [24, 12, 16] },
    spawnPoints: [{ id: 'entrance', position: [0, 0, 8], rotation: Math.PI }],
    spatialAudio: { minDistance: 2, maxDistance: 18, rolloff: 'inverse' },
  }),
  [SpaceType.AUDITORIUM]: SceneConfigSchema.parse({
    environment: {
      skybox: 'studio',
      groundColor: '#1c2233',
      interior: {
        floor: 'carpet-hex',
        floorColor: '#222b40',
        accentColor: '#c9a23f',
        wallColor: '#8a7456',
        panelColor: '#4a2c33',
        ceilingColor: '#262019',
        lightColor: '#ffe2b8',
        wallHeight: 42,
      },
    },
    lighting: { ambientIntensity: 1.0, ambientColor: '#f3ecff', directionalIntensity: 1.3 },
    // Tall + deep (grand) but not ultra-wide, so the ~46m screen fills ~70% of
    // the front wall and dominates; a 42m ceiling gives the soaring conference-
    // hall feel with real space above the screen.
    bounds: { min: [-32, 0, -50], max: [32, 48, 30] },
    spawnPoints: [{ id: 'back', position: [0, 0, 18], rotation: Math.PI }],
    // Auditorium uses near-uniform audience audio; widen falloff.
    spatialAudio: { minDistance: 4, maxDistance: 80, rolloff: 'linear' },
    // Anyone on the stage is heard at full volume by the whole space.
    stage: { center: [0, 0, -40], size: [28, 10], height: 1.0 },
  }),
  [SpaceType.MEETING]: SceneConfigSchema.parse({
    environment: { skybox: 'apartment', groundColor: '#202a35' },
    bounds: { min: [-12, 0, -12], max: [12, 6, 12] },
    spawnPoints: [{ id: 'door', position: [0, 0, 5], rotation: Math.PI }],
    spatialAudio: { minDistance: 6, maxDistance: 14, rolloff: 'inverse' },
  }),
  [SpaceType.WORKSPACE]: SceneConfigSchema.parse({
    environment: { skybox: 'city', groundColor: '#1d2230' },
    bounds: { min: [-35, 0, -35], max: [35, 10, 35] },
    spawnPoints: [{ id: 'entrance', position: [0, 0, 12], rotation: Math.PI }],
    spatialAudio: { minDistance: 2, maxDistance: 12, rolloff: 'inverse' },
  }),
  [SpaceType.TRAINING]: SceneConfigSchema.parse({
    environment: { skybox: 'studio', groundColor: '#191c24' },
    bounds: { min: [-20, 0, -25], max: [20, 12, 15] },
    spawnPoints: [{ id: 'back', position: [0, 0, 10], rotation: Math.PI }],
    spatialAudio: { minDistance: 3, maxDistance: 25, rolloff: 'linear' },
  }),
  [SpaceType.EXPO]: SceneConfigSchema.parse({
    environment: { skybox: 'warehouse', groundColor: '#171a21' },
    bounds: { min: [-50, 0, -50], max: [50, 15, 50] },
    spawnPoints: [{ id: 'gate', position: [0, 0, 20], rotation: Math.PI }],
    spatialAudio: { minDistance: 2, maxDistance: 10, rolloff: 'exponential' },
  }),
  [SpaceType.LOUNGE]: SceneConfigSchema.parse({
    environment: { skybox: 'sunset', groundColor: '#23202a' },
    bounds: { min: [-18, 0, -18], max: [18, 8, 18] },
    spawnPoints: [{ id: 'bar', position: [0, 0, 6], rotation: Math.PI }],
    spatialAudio: { minDistance: 2, maxDistance: 8, rolloff: 'inverse' },
  }),
};

/** Clone a preset for persistence (deep copy so callers can mutate safely). */
export function presetFor(type: SpaceType): SceneConfig {
  return structuredClone(SCENE_PRESETS[type]);
}

// ── Default scene objects (the designed starter worlds) ─────────────────────

/** A scene object ready for insertion (no id — the DB assigns one). */
export interface DefaultSceneObject {
  type: ObjectType;
  transform: Transform;
  config: ObjectConfig;
  interaction?: ObjectInteraction;
}

const DefaultSceneObjectSchema = SceneObjectSchema.omit({ id: true });

function obj(input: DefaultSceneObject): DefaultSceneObject {
  return DefaultSceneObjectSchema.parse(input) as DefaultSceneObject;
}

const t = (
  position: [number, number, number],
  yaw = 0,
  scale: [number, number, number] = [1, 1, 1],
): Transform => ({ position, rotation: [0, yaw, 0], scale });

/** A meeting table with four chairs facing its center. */
function tableWithChairs(
  cx: number,
  cz: number,
  roomKey: string,
  label: string,
): DefaultSceneObject[] {
  const chairs: [number, number][] = [
    [cx + 2.2, cz],
    [cx - 2.2, cz],
    [cx, cz + 2.2],
    [cx, cz - 2.2],
  ];
  return [
    obj({
      type: ObjectType.MEETING_TABLE,
      transform: t([cx, 0, cz]),
      config: { type: ObjectType.MEETING_TABLE, capacity: 6, roomKey, label },
      interaction: { onClick: 'joinTable', permissionsRequired: ['media:publish'] },
    }),
    ...chairs.map(([x, z]) => {
      const yaw = Math.atan2(cx - x, cz - z); // face the table center
      return obj({
        type: ObjectType.CHAIR,
        transform: t([x, 0, z], yaw),
        config: { type: ObjectType.CHAIR, sitRotation: yaw, style: 'default' },
        interaction: { onClick: 'sit', permissionsRequired: [] },
      });
    }),
  ];
}

/**
 * The designed Lobby (M2): welcome screen up front, two huddle tables with
 * chairs, a work corner of desks, whiteboard + Monday dashboard on the walls,
 * a portal placeholder and an external link sign.
 */
const LOBBY_OBJECTS: DefaultSceneObject[] = [
  obj({
    type: ObjectType.SCREEN,
    transform: t([0, 0, -16]),
    config: { type: ObjectType.SCREEN, source: 'screenshare', label: 'Main Screen' },
    interaction: { onClick: 'open', permissionsRequired: [] },
  }),
  obj({
    type: ObjectType.WHITEBOARD,
    transform: t([-13, 0, -12], 0.7),
    config: { type: ObjectType.WHITEBOARD, width: 4, height: 2.5, label: 'Ideas' },
    interaction: { onClick: 'open', permissionsRequired: ['whiteboard:edit'] },
  }),
  obj({
    type: ObjectType.DASHBOARD,
    transform: t([13, 0, -12], -0.7),
    config: {
      type: ObjectType.DASHBOARD,
      mondayBoardId: 'demo-board-1',
      vizType: 'kpi',
      refreshSeconds: 60,
      label: 'Team KPIs',
    },
    interaction: { onClick: 'openBoard', permissionsRequired: ['monday:read'] },
  }),
  ...tableWithChairs(-9, -2, 'lobby-west', 'Huddle West'),
  ...tableWithChairs(9, -2, 'lobby-east', 'Huddle East'),
  // Work corner
  obj({
    type: ObjectType.DESK,
    transform: t([-18, 0, 8], Math.PI / 2),
    config: { type: ObjectType.DESK },
  }),
  obj({
    type: ObjectType.DESK,
    transform: t([-18, 0, 11], Math.PI / 2),
    config: { type: ObjectType.DESK },
  }),
  obj({
    type: ObjectType.DESK,
    transform: t([-14.5, 0, 8], -Math.PI / 2),
    config: { type: ObjectType.DESK },
  }),
  obj({
    type: ObjectType.DESK,
    transform: t([-14.5, 0, 11], -Math.PI / 2),
    config: { type: ObjectType.DESK },
  }),
  obj({
    type: ObjectType.PORTAL,
    transform: t([18, 0, 4]),
    config: { type: ObjectType.PORTAL, targetSpaceId: '', label: 'Auditorium' },
    interaction: { onClick: 'teleport', permissionsRequired: [] },
  }),
  obj({
    type: ObjectType.LINK,
    transform: t([18, 0, 10], -0.5),
    config: { type: ObjectType.LINK, url: 'https://monday.com', openIn: 'newTab', label: 'monday.com' },
    interaction: { onClick: 'openLink', permissionsRequired: [] },
  }),
];

/**
 * The designed Auditorium (Phase 2): presentation screen behind the stage
 * zone (the stage platform itself is scene config, not an object), rows of
 * audience chairs facing the stage, and a portal back to the lobby.
 * Portal targetSpaceIds are blank here — the API binds them to the tenant's
 * real space ids at provisioning time.
 */
const STAGE_CENTER: [number, number] = [0, -40];

/** Curved theater rows: arcs of plush seats centered on the stage. */
function audienceRows(): DefaultSceneObject[] {
  const chairs: DefaultSceneObject[] = [];
  for (let row = 0; row < 6; row++) {
    const radius = 15 + row * 3.2;
    const seats = 15 + row * 2;
    const span = Math.PI * 0.62; // arc width
    for (let i = 0; i < seats; i++) {
      const angle = -span / 2 + (span * i) / (seats - 1);
      const x = STAGE_CENTER[0] + Math.sin(angle) * radius;
      const z = STAGE_CENTER[1] + Math.cos(angle) * radius;
      const yaw = Math.atan2(STAGE_CENTER[0] - x, STAGE_CENTER[1] - z); // face the stage
      chairs.push(
        obj({
          type: ObjectType.CHAIR,
          transform: t([x, 0, z], yaw),
          config: { type: ObjectType.CHAIR, sitRotation: yaw, style: 'theater', color: '#5e2333' },
          interaction: { onClick: 'sit', permissionsRequired: [] },
        }),
      );
    }
  }
  return chairs;
}

const AUDITORIUM_OBJECTS: DefaultSceneObject[] = [
  // One large cinema-style LED wall on the back wall, behind the stage, so the
  // whole audience reads it. Uniform scale keeps the 16:9 share undistorted.
  obj({
    type: ObjectType.SCREEN,
    transform: t([0, 0, -48], 0, [11, 11, 11]),
    config: { type: ObjectType.SCREEN, source: 'screenshare' },
    interaction: { onClick: 'open', permissionsRequired: [] },
  }),
  ...audienceRows(),
  obj({
    type: ObjectType.PORTAL,
    transform: t([26, 0, 24]),
    config: { type: ObjectType.PORTAL, targetSpaceId: '', label: 'Lobby' },
    interaction: { onClick: 'teleport', permissionsRequired: [] },
  }),
];

const DEFAULT_OBJECTS: Partial<Record<SpaceType, DefaultSceneObject[]>> = {
  [SpaceType.LOBBY]: z.array(DefaultSceneObjectSchema).parse(LOBBY_OBJECTS) as DefaultSceneObject[],
  [SpaceType.AUDITORIUM]: z
    .array(DefaultSceneObjectSchema)
    .parse(AUDITORIUM_OBJECTS) as DefaultSceneObject[],
};

/** Designed starter objects for a space type (deep copy; [] if none). */
export function defaultObjectsFor(type: SpaceType): DefaultSceneObject[] {
  return structuredClone(DEFAULT_OBJECTS[type] ?? []);
}

/** Validate an arbitrary scene config (from DB or scene editor). */
export function validateSceneConfig(input: unknown): SceneConfig {
  return SceneConfigSchema.parse(input);
}

/** Merge a tenant's stored palette over defaults. */
export function resolvePalette(stored: unknown): BrandingPalette {
  return BrandingPaletteSchema.parse({ ...DEFAULT_PALETTE, ...(stored as object) });
}

export { SceneConfigSchema, BrandingPaletteSchema };
