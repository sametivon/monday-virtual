import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE_PERMISSIONS,
  Permission,
  RoleKey,
  hasPermission,
} from '../index';
import { SceneConfigSchema, WorldManifestSchema } from '../scene/index';
import { PlayerMovePayloadSchema, room } from '../realtime/index';

describe('permissions', () => {
  it('super admin implicitly has every permission via platform:manage', () => {
    const granted = DEFAULT_ROLE_PERMISSIONS[RoleKey.SUPER_ADMIN];
    expect(hasPermission(granted, Permission.TENANT_DELETE)).toBe(true);
    expect(hasPermission(granted, Permission.SPACE_EDIT)).toBe(true);
  });

  it('guest cannot edit spaces but can join presence', () => {
    const granted = DEFAULT_ROLE_PERMISSIONS[RoleKey.GUEST];
    expect(hasPermission(granted, Permission.SPACE_EDIT)).toBe(false);
    expect(hasPermission(granted, Permission.PRESENCE_JOIN)).toBe(true);
  });

  it('member inherits baseline but not admin perms', () => {
    const granted = DEFAULT_ROLE_PERMISSIONS[RoleKey.MEMBER];
    expect(hasPermission(granted, Permission.CHAT_SEND)).toBe(true);
    expect(hasPermission(granted, Permission.USER_MANAGE)).toBe(false);
  });
});

describe('scene config', () => {
  it('applies defaults to an empty scene config', () => {
    const parsed = SceneConfigSchema.parse({});
    expect(parsed.spawnPoints.length).toBeGreaterThanOrEqual(1);
    expect(parsed.spatialAudio.maxDistance).toBeGreaterThan(parsed.spatialAudio.minDistance);
  });

  it('validates a minimal world manifest', () => {
    const manifest = WorldManifestSchema.parse({
      spaceId: 's1',
      spaceType: 'LOBBY',
      name: 'Lobby',
      scene: {},
      objects: [],
    });
    expect(manifest.name).toBe('Lobby');
  });
});

describe('realtime contracts', () => {
  it('rejects malformed movement payloads', () => {
    expect(() => PlayerMovePayloadSchema.parse({ position: [0, 0], rotation: 0 })).toThrow();
  });

  it('builds tenant-scoped room keys', () => {
    expect(room.space('t1', 's1')).toBe('t1:s1');
    expect(room.table('t1', 's1', 'tableA')).toBe('t1:s1:table:tableA');
  });
});
