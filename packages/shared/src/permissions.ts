/**
 * RBAC permission catalog and the default role → permissions mapping.
 *
 * Permissions are colon-namespaced strings (`resource:action`). The API's
 * `PermissionsGuard`, the realtime gateway, and LiveKit token issuance all
 * check against this catalog. A `Role.permissions` JSON column stores the
 * resolved set so tenant admins can customize beyond these defaults.
 */

import { RoleKey } from './enums';

export const Permission = {
  // Platform-level (super admin only)
  PLATFORM_MANAGE: 'platform:manage',
  TENANT_CREATE: 'tenant:create',
  TENANT_DELETE: 'tenant:delete',

  // Tenant administration
  TENANT_MANAGE: 'tenant:manage',
  BRANDING_EDIT: 'branding:edit',
  USER_MANAGE: 'user:manage',
  ROLE_MANAGE: 'role:manage',
  ANALYTICS_VIEW: 'analytics:view',
  AUDIT_VIEW: 'audit:view',

  // Spaces & scene authoring
  SPACE_VIEW: 'space:view',
  SPACE_CREATE: 'space:create',
  SPACE_EDIT: 'space:edit', // scene editor: place/move/configure objects
  SPACE_DELETE: 'space:delete',
  SPACE_PUBLISH: 'space:publish',

  // Presence / movement / chat (baseline member capabilities)
  PRESENCE_JOIN: 'presence:join',
  CHAT_SEND: 'chat:send',
  CHAT_MODERATE: 'chat:moderate',

  // Media
  MEDIA_PUBLISH: 'media:publish', // share mic/cam/screen
  MEDIA_MODERATE: 'media:moderate', // mute others, remove from room

  // Auditorium / events
  EVENT_CREATE: 'event:create',
  EVENT_MANAGE: 'event:manage',
  PRESENT: 'present', // control stage, slides, screen on the auditorium stage
  STAGE_INVITE: 'stage:invite',

  // Whiteboard
  WHITEBOARD_EDIT: 'whiteboard:edit',

  // Monday data binding
  MONDAY_BIND: 'monday:bind', // attach a board to a SceneObject
  MONDAY_READ: 'monday:read', // view bound board data

  // AI assistant
  AI_USE: 'ai:use',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL_PERMISSIONS = Object.values(Permission) as Permission[];

/** Baseline permissions every authenticated member receives. */
const MEMBER_PERMISSIONS: Permission[] = [
  Permission.SPACE_VIEW,
  Permission.PRESENCE_JOIN,
  Permission.CHAT_SEND,
  Permission.MEDIA_PUBLISH,
  Permission.WHITEBOARD_EDIT,
  Permission.MONDAY_READ,
  Permission.AI_USE,
];

const GUEST_PERMISSIONS: Permission[] = [
  Permission.SPACE_VIEW,
  Permission.PRESENCE_JOIN,
  Permission.CHAT_SEND,
];

const PRESENTER_PERMISSIONS: Permission[] = [
  ...MEMBER_PERMISSIONS,
  Permission.PRESENT,
  Permission.STAGE_INVITE,
];

const MODERATOR_PERMISSIONS: Permission[] = [
  ...PRESENTER_PERMISSIONS,
  Permission.CHAT_MODERATE,
  Permission.MEDIA_MODERATE,
  Permission.MONDAY_BIND,
];

const TENANT_ADMIN_PERMISSIONS: Permission[] = [
  ...MODERATOR_PERMISSIONS,
  Permission.TENANT_MANAGE,
  Permission.BRANDING_EDIT,
  Permission.USER_MANAGE,
  Permission.ROLE_MANAGE,
  Permission.ANALYTICS_VIEW,
  Permission.AUDIT_VIEW,
  Permission.SPACE_CREATE,
  Permission.SPACE_EDIT,
  Permission.SPACE_DELETE,
  Permission.SPACE_PUBLISH,
  Permission.EVENT_CREATE,
  Permission.EVENT_MANAGE,
];

/** Default permission set per role. Tenants may override per-role. */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  [RoleKey.SUPER_ADMIN]: ALL_PERMISSIONS,
  [RoleKey.TENANT_ADMIN]: dedupe(TENANT_ADMIN_PERMISSIONS),
  [RoleKey.MODERATOR]: dedupe(MODERATOR_PERMISSIONS),
  [RoleKey.PRESENTER]: dedupe(PRESENTER_PERMISSIONS),
  [RoleKey.MEMBER]: dedupe(MEMBER_PERMISSIONS),
  [RoleKey.GUEST]: dedupe(GUEST_PERMISSIONS),
};

export function hasPermission(
  granted: readonly string[] | undefined,
  required: Permission,
): boolean {
  if (!granted) return false;
  return granted.includes(Permission.PLATFORM_MANAGE) || granted.includes(required);
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
