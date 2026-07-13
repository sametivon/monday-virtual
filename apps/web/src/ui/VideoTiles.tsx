'use client';

import { useEffect, useRef } from 'react';
import type { Track } from 'livekit-client';
import { media, useMediaStore, type VideoTile } from '@/media/mediaController';

/**
 * Video tile strip (M4): camera + screen-share tracks of the current room,
 * rendered as a DOM overlay along the top. Screen shares get a wide tile —
 * except in space mode, where the share renders on the in-world 3D screens
 * instead (Phase 2 presenter flow).
 */
export function VideoTiles() {
  // tilesVersion subscribes this component to tile-set changes.
  useMediaStore((s) => s.tilesVersion);
  const mode = useMediaStore((s) => s.mode);
  const tiles = [...media.tiles.values()].filter(
    (t) => !(mode === 'space' && t.kind === 'screen'),
  );

  if (tiles.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 flex max-w-[90%] -translate-x-1/2 gap-2">
      {tiles.map((tile) => (
        <Tile key={tile.key} tile={tile} />
      ))}
    </div>
  );
}

function Tile({ tile }: { tile: VideoTile }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const track = tile.track as Track & {
      attach: (el: HTMLVideoElement) => void;
      detach: (el: HTMLVideoElement) => void;
    };
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [tile.track]);

  return (
    <div
      className={`relative overflow-hidden rounded-md border border-line/15 bg-brand-text shadow-e1 ${
        tile.kind === 'screen' ? 'h-36 w-64' : 'h-28 w-40'
      }`}
    >
      <video ref={ref} muted={tile.local} className="h-full w-full object-cover" />
      {/* Video content is dark — white-on-video is the correct exception here. */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-brand-text/70 to-transparent px-2 pb-1 pt-3 text-xs text-white">
        {tile.local ? 'You' : tile.participantName}
        {tile.kind === 'screen' ? ' · screen' : ''}
      </div>
    </div>
  );
}
