'use client';

import { media, useMediaStore, type VideoTile } from './mediaController';

/**
 * The screen-share tile currently live in the room, if any (latest sharer
 * wins when several publish). In-world SCREEN objects render this as a video
 * texture — the "presenter screen" path (Phase 2).
 */
export function useScreenShareTile(): VideoTile | null {
  // tilesVersion subscribes to tile-set changes.
  useMediaStore((s) => s.tilesVersion);
  const screens = [...media.tiles.values()].filter((t) => t.kind === 'screen');
  return screens[screens.length - 1] ?? null;
}
