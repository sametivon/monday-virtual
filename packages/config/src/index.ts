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
  normalizeBrandingPalette,
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
export const SCENE_REV = 16;

/** Per-space-type default scene config. All validated at module load. */
export const SCENE_PRESETS: Record<SpaceType, SceneConfig> = {
  [SpaceType.LOBBY]: SceneConfigSchema.parse({
    environment: {
      skybox: 'city',
      groundColor: '#d9d0c2',
      // Light-first palette (S2): plaster walls, warm bright ceiling — the
      // room itself reads like the product's paper, not a game dungeon.
      interior: {
        floor: 'wood',
        wallColor: '#e7ddcc',
        panelColor: '#9c8d78',
        ceilingColor: '#f1ebe1',
        accentColor: '#d9a441',
        lightColor: '#ffedd6',
        wallHeight: 6,
      },
    },
    lighting: {
      ambientIntensity: 0.85,
      ambientColor: '#fff6ea',
      directionalIntensity: 1.0,
    },
    bounds: { min: [-24, 0, -20], max: [24, 12, 16] },
    spawnPoints: [{ id: 'entrance', position: [0, 0, 8], rotation: Math.PI }],
    spatialAudio: { minDistance: 2, maxDistance: 18, rolloff: 'inverse' },
  }),
  [SpaceType.AUDITORIUM]: SceneConfigSchema.parse({
    environment: {
      skybox: 'studio',
      groundColor: '#3f3a34',
      // Keynote hall (S3): charcoal carpet, washed light walls with walnut
      // slat paneling, focused mid-dark ceiling. The gold hex grid is retired.
      interior: {
        floor: 'carpet',
        floorColor: '#37333c',
        accentColor: '#c9a23f',
        wallColor: '#cfc4b2',
        panelColor: '#6b4f39',
        ceilingColor: '#453e36',
        lightColor: '#ffe8cd',
        wallHeight: 14,
      },
    },
    lighting: { ambientIntensity: 0.8, ambientColor: '#f6efe6', directionalIntensity: 1.0 },
    // Tightened around the bowl (S3): the old 80×52 hall left ~15m of bare
    // glowing margin on every side of the seating.
    bounds: { min: [-30, 0, -46], max: [30, 18, -2] },
    spawnPoints: [{ id: 'mid', position: [0, 2.4, -16], rotation: Math.PI }],
    // Auditorium uses near-uniform audience audio; widen falloff.
    spatialAudio: { minDistance: 4, maxDistance: 60, rolloff: 'linear' },
    // Low front stage inside the bowl's flat center.
    stage: { center: [0, 0, -36], size: [18, 7], height: 0.6 },
    // Raked seating bowl — see AUDITORIUM_BOWL (kept in sync with the seats).
    amphitheater: { center: [0, -36], innerRadius: 11, rowDepth: 2.7, riser: 0.6, rows: 9, halfArc: 1.2 },
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
/**
 * The raked amphitheater bowl — kept in sync with the scene's `amphitheater`
 * config above. Seats sit ON each rising terrace, fanned to face the stage.
 */
const AUDITORIUM_BOWL = {
  center: [0, -36] as [number, number],
  innerRadius: 11,
  rowDepth: 2.7,
  riser: 0.6,
  rows: 9,
  halfArc: 1.2,
};

/** Curved raked theater rows: each terrace steps up + back, seats face the stage. */
function audienceRows(): DefaultSceneObject[] {
  const b = AUDITORIUM_BOWL;
  const chairs: DefaultSceneObject[] = [];
  const seatGap = 1.15; // theater spacing — 2.8m read as scattered toys (S3)
  for (let row = 0; row < b.rows; row++) {
    const radius = b.innerRadius + b.rowDepth * (row + 0.5);
    const y = b.riser * (row + 1); // terrace height for this row
    const seats = Math.max(7, Math.round((2 * b.halfArc * radius) / seatGap));
    for (let i = 0; i < seats; i++) {
      const a = -b.halfArc + (2 * b.halfArc * i) / (seats - 1);
      const x = b.center[0] + Math.sin(a) * radius;
      const z = b.center[1] + Math.cos(a) * radius;
      const yaw = Math.atan2(b.center[0] - x, b.center[1] - z); // face the stage
      chairs.push(
        obj({
          type: ObjectType.CHAIR,
          transform: t([x, y, z], yaw),
          config: { type: ObjectType.CHAIR, sitRotation: yaw, style: 'theater', color: '#3d3844' },
          interaction: { onClick: 'sit', permissionsRequired: [] },
        }),
      );
    }
  }
  return chairs;
}

const AUDITORIUM_OBJECTS: DefaultSceneObject[] = [
  // eXp-style stage screen array: a trio of big screens up on the front wall,
  // above the low stage, so the whole raked audience reads them.
  ...[-13, 0, 13].map((x) =>
    obj({
      type: ObjectType.SCREEN,
      transform: t([x, 6, -45], 0, [2.5, 2.5, 2.5]),
      config: { type: ObjectType.SCREEN, source: 'screenshare' },
      interaction: { onClick: 'open', permissionsRequired: [] },
    }),
  ),
  ...audienceRows(),
  obj({
    type: ObjectType.PORTAL,
    transform: t([24, 0, -40]),
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

/** Merge a tenant's stored palette over defaults (legacy dark values remapped). */
export function resolvePalette(stored: unknown): BrandingPalette {
  return normalizeBrandingPalette(stored);
}

export { SceneConfigSchema, BrandingPaletteSchema };
