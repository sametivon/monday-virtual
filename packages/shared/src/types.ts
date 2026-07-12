/**
 * Shared domain DTOs exchanged over the control plane (REST/GraphQL). These are
 * the API ↔ client contract; the API maps Prisma rows onto these shapes.
 */

import { z } from 'zod';
import {
  ChatScope,
  EventStatus,
  EventType,
  ObjectType,
  RoleKey,
  SpaceType,
  TenantStatus,
  UserPresenceStatus,
} from './enums';
import { ObjectInteractionSchema, TransformSchema } from './scene/index';
import type { TenantPlanInfo } from './plans';

// ── Auth ───────────────────────────────────────────────────────────────────

/** JWT payload carried in the app access token. */
export interface AppJwtPayload {
  sub: string; // userId
  tenantId: string;
  roleKey: RoleKey;
  permissions: string[];
  name: string;
  iat?: number;
  exp?: number;
}

export const SessionAuthRequestSchema = z.object({
  /** monday.com short-lived sessionToken from the iframe SDK. */
  sessionToken: z.string().min(10),
  /**
   * Display profile fetched client-side via seamless me() — view
   * sessionTokens don't carry name/email and monday's API rejects them
   * server-side. Cosmetic only: identity ids always come from the verified
   * token, never from here.
   */
  profile: z
    .object({
      name: z.string().min(1).max(120),
      email: z.string().max(254).default(''),
    })
    .optional(),
});
export type SessionAuthRequest = z.infer<typeof SessionAuthRequestSchema>;

export const OAuthCallbackRequestSchema = z.object({
  code: z.string(),
  state: z.string().optional(),
});
export type OAuthCallbackRequest = z.infer<typeof OAuthCallbackRequestSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ── Branding ───────────────────────────────────────────────────────────────

export const BrandingPaletteSchema = z.object({
  primary: z.string().default('#6c5ce7'),
  secondary: z.string().default('#00b894'),
  background: z.string().default('#0f1115'),
  surface: z.string().default('#1a1d24'),
  accent: z.string().default('#fdcb6e'),
  text: z.string().default('#f5f6fa'),
});
export type BrandingPalette = z.infer<typeof BrandingPaletteSchema>;

export interface BrandingDTO {
  productName: string;
  logoUrl: string | null;
  palette: BrandingPalette;
  theme: Record<string, unknown> | null;
}

/** PATCH /tenant/branding — white-label editing (branding:edit). */
export const BrandingUpdateSchema = z.object({
  productName: z.string().min(1).max(60).optional(),
  logoUrl: z.string().url().nullable().optional(),
  palette: BrandingPaletteSchema.partial().optional(),
});
export type BrandingUpdate = z.infer<typeof BrandingUpdateSchema>;

// ── User / Tenant ──────────────────────────────────────────────────────────

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  company: string | null;
  jobTitle: string | null;
  status: UserPresenceStatus;
  roleKey: RoleKey;
  avatarConfig: AvatarConfig;
}

export interface TenantDTO {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  branding: BrandingDTO;
}

// ── Analytics ───────────────────────────────────────────────────────────────

/** Query window for the analytics dashboard (days back from now). */
export const AnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});
export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

export interface AnalyticsSummary {
  /** Window covered, ISO dates. */
  from: string;
  to: string;
  /** Headline totals over the window. */
  totals: {
    activeUsers: number; // distinct users with any event
    sessions: number; // space_join count
    avgSessionMinutes: number; // mean of space_leave durations
    messages: number; // chat_send count
    reactions: number; // reaction count
    handRaises: number; // hand_raise count
  };
  /** Distinct active users per day (for the trend line). */
  dailyActiveUsers: { date: string; users: number }[];
  /** Per-space engagement, busiest first. */
  spaces: {
    spaceId: string;
    name: string;
    sessions: number;
    avgSessionMinutes: number;
    messages: number;
  }[];
}

/** Query window for the occupancy heatmap (days back from now, optional space). */
export const HeatmapQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  spaceId: z.string().optional(),
});
export type HeatmapQuery = z.infer<typeof HeatmapQuerySchema>;

/**
 * Occupancy heatmap for one space: a HEATMAP_GRID×HEATMAP_GRID grid of
 * normalized weights (0..1) over the floor plane, accumulated from periodic
 * occupancy samples the realtime tick loop emits. Cell [row][col] maps to world
 * XZ via the space's `bounds`; weight is the share of total presence-time spent
 * in that cell over the window.
 */
export interface SpaceHeatmap {
  spaceId: string;
  name: string;
  /** World-space floor extent the grid covers: [minX, maxX, minZ, maxZ]. */
  bounds: [number, number, number, number];
  /** grid[row][col], row = z axis, col = x axis; values normalized 0..1. */
  grid: number[][];
  /** Total occupancy samples that fed the grid (0 → no data yet). */
  samples: number;
}

export interface HeatmapResponse {
  from: string;
  to: string;
  /** Spaces that have occupancy data in the window, busiest first. */
  spaces: SpaceHeatmap[];
}

// ── RBAC management ─────────────────────────────────────────────────────────

/** A tenant member in the admin roster. */
export interface MemberDTO {
  id: string;
  name: string;
  email: string;
  roleKey: RoleKey;
  roleId: string | null;
  status: UserPresenceStatus;
  lastSeenAt: string | null;
}

/** A tenant role with its (possibly customized) permission set. */
export interface RoleDTO {
  id: string;
  key: RoleKey;
  name: string;
  permissions: string[];
}

/** Assign a member to a role (by role key — resolved to the tenant's row). */
export const AssignRoleRequestSchema = z.object({
  userId: z.string().min(1),
  roleKey: z.nativeEnum(RoleKey),
});
export type AssignRoleRequest = z.infer<typeof AssignRoleRequestSchema>;

/** Replace a role's permission set (full list; validated against the catalog). */
export const UpdateRolePermissionsRequestSchema = z.object({
  permissions: z.array(z.string()).max(64),
});
export type UpdateRolePermissionsRequest = z.infer<typeof UpdateRolePermissionsRequestSchema>;

/** Response for GET /me — the bootstrap payload after auth. */
export interface MeResponse {
  user: UserDTO;
  tenant: TenantDTO;
  permissions: string[];
  /** Subscription plan + gated features (monday Marketplace monetization). */
  plan: TenantPlanInfo;
}

// ── GDPR / data protection ──────────────────────────────────────────────────

/**
 * A full export of one user's personal data (GDPR right of access /
 * portability, art. 15 & 20). Admin-gated (USER_MANAGE). Everything stored
 * about the subject, in a portable JSON shape.
 */
export interface GdprExport {
  exportedAt: string;
  subject: {
    id: string;
    mondayUserId: string;
    name: string;
    email: string;
    company: string | null;
    jobTitle: string | null;
    roleKey: RoleKey | null;
    avatarConfig: unknown;
    status: UserPresenceStatus;
    createdAt: string;
    lastSeenAt: string | null;
  };
  sessions: { id: string; userAgent: string | null; ip: string | null; createdAt: string; expiresAt: string; revokedAt: string | null }[];
  eventRegistrations: { eventId: string; eventTitle: string; registeredAt: string; attended: boolean }[];
  chatMessages: { id: string; scope: ChatScope; body: string; createdAt: string }[];
  analyticsEvents: { type: string; spaceId: string | null; ts: string }[];
}

/** Result of an erasure (right to be forgotten, art. 17): what was scrubbed. */
export interface GdprErasureResult {
  userId: string;
  erasedAt: string;
  /** Counts of records anonymized or deleted, for the audit trail. */
  removed: {
    sessions: number;
    directMessages: number;
    chatMessagesAnonymized: number;
    eventRegistrations: number;
    analyticsEventsDetached: number;
  };
}

/** Confirm-by-typing-the-id guard so erasure can't fire by a stray click. */
export const GdprEraseRequestSchema = z.object({
  /** Must equal the target userId — a deliberate confirmation token. */
  confirm: z.string().min(1),
});
export type GdprEraseRequest = z.infer<typeof GdprEraseRequestSchema>;

// ── Avatar ─────────────────────────────────────────────────────────────────

export const AvatarConfigSchema = z.object({
  modelId: z.string().default('default'),
  skin: z.string().optional(),
  color: z.string().optional(),
  accessories: z.array(z.string()).default([]),
  /** Equipped gear node names (headgear/cape/weapons); undefined = default loadout. */
  parts: z.array(z.string()).optional(),
  /** Ready-Player-Me / external glTF url (Phase 2). */
  customModelUrl: z.string().url().optional(),
});
export type AvatarConfig = z.infer<typeof AvatarConfigSchema>;

// ── Spaces ─────────────────────────────────────────────────────────────────

export interface SpaceSummaryDTO {
  id: string;
  name: string;
  type: SpaceType;
  isPublished: boolean;
  capacity: number;
  occupancy: number; // live, from Redis presence
}

// ── Media tokens ───────────────────────────────────────────────────────────

export const MediaTokenRequestSchema = z.object({
  spaceId: z.string(),
  /** Optional meeting-table sub-room key for a full-volume room. */
  roomKey: z.string().optional(),
  publish: z.boolean().default(true),
});
export type MediaTokenRequest = z.infer<typeof MediaTokenRequestSchema>;

export interface MediaTokenResponse {
  token: string;
  url: string; // LiveKit ws url
  room: string;
}

// ── Monday data ────────────────────────────────────────────────────────────

export interface MondayBoardData {
  boardId: string;
  name: string;
  columns: { id: string; title: string; type: string }[];
  items: { id: string; name: string; values: Record<string, unknown> }[];
  fetchedAt: string; // ISO
  cached: boolean;
}

export interface MondayBoardSummary {
  id: string;
  name: string;
}

/** Seamless monday reads: the iframe sessionToken doubles as the API token. */
export const MondaySeamlessRequestSchema = z.object({
  sessionToken: z.string().min(10),
});
export type MondaySeamlessRequest = z.infer<typeof MondaySeamlessRequestSchema>;

export const MondayBoardRequestSchema = z.object({
  sessionToken: z.string().min(10),
  boardId: z.string().min(1),
});
export type MondayBoardRequest = z.infer<typeof MondayBoardRequestSchema>;

/** Pin a monday board to an in-world DASHBOARD object (scene authoring). */
export const PinBoardRequestSchema = z.object({ mondayBoardId: z.string().min(1) });
export type PinBoardRequest = z.infer<typeof PinBoardRequestSchema>;

// ── Scene editor (drag-and-drop authoring) ──────────────────────────────────

/** Create a new scene object. Transform/config default to sane empties. */
export const CreateObjectRequestSchema = z.object({
  type: z.nativeEnum(ObjectType),
  transform: TransformSchema.optional(),
  config: z.record(z.unknown()).optional(),
  interaction: ObjectInteractionSchema.optional(),
});
export type CreateObjectRequest = z.infer<typeof CreateObjectRequestSchema>;

/** Patch an existing object's placement/config (any subset). */
export const UpdateObjectRequestSchema = z
  .object({
    transform: TransformSchema.optional(),
    config: z.record(z.unknown()).optional(),
    interaction: ObjectInteractionSchema.optional(),
  })
  .refine((v) => v.transform || v.config || v.interaction, {
    message: 'At least one of transform/config/interaction is required',
  });
export type UpdateObjectRequest = z.infer<typeof UpdateObjectRequestSchema>;

// ── Uploads (S3-compatible presigned PUT) ───────────────────────────────────

/** What an upload is for — drives the storage key prefix and size/type limits. */
export const UploadKind = { LOGO: 'logo', SLIDE: 'slide' } as const;
export type UploadKind = (typeof UploadKind)[keyof typeof UploadKind];

export const UploadSignRequestSchema = z.object({
  kind: z.nativeEnum(UploadKind),
  contentType: z.string().min(3).max(100),
  /** Original file size in bytes (server enforces the per-kind cap). */
  size: z.number().int().positive(),
});
export type UploadSignRequest = z.infer<typeof UploadSignRequestSchema>;

export interface UploadSignResponse {
  /** Presigned PUT URL — the browser uploads the bytes here directly. */
  putUrl: string;
  /** Stable URL the asset will be served from once uploaded. */
  publicUrl: string;
  /** Echo of the headers the client MUST send on the PUT (e.g. Content-Type). */
  headers: Record<string, string>;
}

/** Per-kind upload constraints, shared so the client can pre-validate. */
export const UPLOAD_LIMITS: Record<UploadKind, { maxBytes: number; mime: RegExp }> = {
  [UploadKind.LOGO]: { maxBytes: 2 * 1024 * 1024, mime: /^image\/(png|jpeg|svg\+xml|webp)$/ },
  [UploadKind.SLIDE]: { maxBytes: 8 * 1024 * 1024, mime: /^image\/(png|jpeg|webp)$/ },
};

/** A presentation deck bound to an auditorium/screen (slide image URLs). */
export const SlideDeckSchema = z.object({
  slides: z.array(z.string().url()).max(200),
});
export type SlideDeck = z.infer<typeof SlideDeckSchema>;

// ── Events ─────────────────────────────────────────────────────────────────

/** One agenda slot in an event programme. */
export const AgendaItemSchema = z.object({
  title: z.string().min(1).max(200),
  startsAt: z.string().datetime(),
  durationMinutes: z.number().int().min(1).max(720),
  speaker: z.string().max(120).optional(),
});
export type AgendaItem = z.infer<typeof AgendaItemSchema>;

/** A speaker / presenter listed on an event. */
export const SpeakerSchema = z.object({
  name: z.string().min(1).max(120),
  title: z.string().max(160).optional(),
  avatarUrl: z.string().url().optional(),
});
export type Speaker = z.infer<typeof SpeakerSchema>;

export interface EventDTO {
  id: string;
  type: EventType;
  title: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  spaceId: string | null;
  agenda: AgendaItem[];
  speakers: Speaker[];
  registeredCount: number;
  /** Whether the requesting user has registered (per-viewer). */
  registered: boolean;
  /** Whether the requesting user attended (joined while LIVE). */
  attended: boolean;
}

/** One registrant's attendance record (admin export). */
export interface AttendanceRow {
  userId: string;
  name: string;
  email: string;
  registeredAt: string;
  attended: boolean;
}

/** Attendance report for one event — registrants + who actually showed up. */
export interface AttendanceReport {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  registeredCount: number;
  attendedCount: number;
  rows: AttendanceRow[];
}

export const CreateEventRequestSchema = z.object({
  type: z.nativeEnum(EventType),
  title: z.string().min(1).max(200),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  spaceId: z.string().optional(),
  agenda: z.array(AgendaItemSchema).max(50).optional(),
  speakers: z.array(SpeakerSchema).max(50).optional(),
});
export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>;

/** Patch an event; every field optional (status changes go through go-live/end). */
export const UpdateEventRequestSchema = CreateEventRequestSchema.partial();
export type UpdateEventRequest = z.infer<typeof UpdateEventRequestSchema>;

// ── Chat (REST history) ────────────────────────────────────────────────────

export interface ChatHistoryItem {
  id: string;
  scope: ChatScope;
  spaceId: string | null;
  fromUserId: string;
  fromName: string;
  body: string;
  createdAt: string;
}

// ── AI ─────────────────────────────────────────────────────────────────────

export const AiQueryRequestSchema = z.object({
  prompt: z.string().min(1).max(8000),
  spaceId: z.string().optional(),
  context: z.enum(['navigate', 'explainBoard', 'summarize', 'general']).default('general'),
});
export type AiQueryRequest = z.infer<typeof AiQueryRequestSchema>;

export interface AiQueryResponse {
  answer: string;
  /** Optional structured action the client can execute (e.g. teleport). */
  action?: { type: string; payload: Record<string, unknown> };
}
