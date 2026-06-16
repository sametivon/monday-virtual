/**
 * @mvs/shared — single source of truth for cross-cutting types, enums, zod
 * schemas, RBAC permissions, scene config, and realtime event contracts.
 * Imported by apps/web, apps/api, and apps/realtime.
 */

export * from './enums';
export * from './permissions';
export * from './types';
export * from './scene/index';
export * from './realtime/index';

export const PLATFORM = {
  name: 'Monday Virtual Spaces',
  version: '0.1.0',
} as const;
