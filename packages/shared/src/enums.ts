/**
 * Canonical enums for the platform. These mirror the Prisma enums in
 * `packages/db/prisma/schema.prisma` — keep the two in sync. Defined here as
 * `const` objects (not TS `enum`) so they are tree-shakeable and usable on the
 * client without emitting runtime enum boilerplate.
 */

export const TenantStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  TRIAL: 'TRIAL',
} as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

export const UserPresenceStatus = {
  ONLINE: 'ONLINE',
  AWAY: 'AWAY',
  BUSY: 'BUSY',
  OFFLINE: 'OFFLINE',
} as const;
export type UserPresenceStatus = (typeof UserPresenceStatus)[keyof typeof UserPresenceStatus];

export const RoleKey = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  TENANT_ADMIN: 'TENANT_ADMIN',
  MODERATOR: 'MODERATOR',
  PRESENTER: 'PRESENTER',
  MEMBER: 'MEMBER',
  GUEST: 'GUEST',
} as const;
export type RoleKey = (typeof RoleKey)[keyof typeof RoleKey];

export const SpaceType = {
  LOBBY: 'LOBBY',
  AUDITORIUM: 'AUDITORIUM',
  MEETING: 'MEETING',
  WORKSPACE: 'WORKSPACE',
  TRAINING: 'TRAINING',
  EXPO: 'EXPO',
  LOUNGE: 'LOUNGE',
} as const;
export type SpaceType = (typeof SpaceType)[keyof typeof SpaceType];

export const ObjectType = {
  SCREEN: 'SCREEN',
  PORTAL: 'PORTAL',
  WHITEBOARD: 'WHITEBOARD',
  DESK: 'DESK',
  CHAIR: 'CHAIR',
  MEETING_TABLE: 'MEETING_TABLE',
  DASHBOARD: 'DASHBOARD',
  LINK: 'LINK',
  VIDEO: 'VIDEO',
  SPAWN_POINT: 'SPAWN_POINT',
} as const;
export type ObjectType = (typeof ObjectType)[keyof typeof ObjectType];

export const EventType = {
  CONFERENCE: 'CONFERENCE',
  WORKSHOP: 'WORKSHOP',
  TOWNHALL: 'TOWNHALL',
  TRAINING: 'TRAINING',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const EventStatus = {
  SCHEDULED: 'SCHEDULED',
  LIVE: 'LIVE',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED',
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const ChatScope = {
  GLOBAL: 'GLOBAL',
  ROOM: 'ROOM',
  DIRECT: 'DIRECT',
} as const;
export type ChatScope = (typeof ChatScope)[keyof typeof ChatScope];

export const AvatarAnimation = {
  IDLE: 'idle',
  WALK: 'walk',
  RUN: 'run',
  WAVE: 'wave',
  SIT: 'sit',
} as const;
export type AvatarAnimation = (typeof AvatarAnimation)[keyof typeof AvatarAnimation];
