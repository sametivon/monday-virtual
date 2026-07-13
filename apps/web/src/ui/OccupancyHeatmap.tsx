'use client';

import { useState } from 'react';
import { Footprints } from 'lucide-react';
import type { HeatmapResponse, SpaceHeatmap } from '@mvs/shared';
import { EmptyState } from '@/ui/primitives';

/**
 * Occupancy heatmap viz: a grid of cells over a space's floor plane, each
 * shaded by the share of presence-time spent there (cool → hot). Fed by the
 * `space_occupancy` samples the realtime tick loop emits and the API folds into
 * a normalized grid. Renders the selected space with a picker across spaces
 * that have data.
 */
export function OccupancyHeatmap({ data }: { data: HeatmapResponse }) {
  const spaces = data.spaces.filter((s) => s.samples > 0);
  const [selected, setSelected] = useState(0);

  if (spaces.length === 0) {
    return (
      <EmptyState
        icon={Footprints}
        title="No occupancy yet"
        body="Heatmaps build up as people spend time in your spaces — check back after a few sessions."
      />
    );
  }
  const space = spaces[Math.min(selected, spaces.length - 1)]!;

  return (
    <div>
      {spaces.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1 rounded-md bg-line/8 p-1 text-xs">
          {spaces.map((s, i) => (
            <button
              key={s.spaceId}
              onClick={() => setSelected(i)}
              className={`rounded-sm px-2.5 py-1 transition ${
                i === Math.min(selected, spaces.length - 1)
                  ? 'bg-brand-primary text-white shadow-e1'
                  : 'text-brand-text/60 hover:text-brand-text'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <HeatGrid space={space} />

      <div className="mt-3 flex items-center justify-between text-xs text-brand-text/50">
        <span>{space.samples} samples</span>
        <div className="flex items-center gap-2">
          <span>low</span>
          <div
            className="h-2 w-24 rounded-full"
            style={{
              background: 'linear-gradient(to right, rgba(108,92,231,0.15), #6c5ce7, #c0392b)',
            }}
          />
          <span>high</span>
        </div>
      </div>
    </div>
  );
}

function HeatGrid({ space }: { space: SpaceHeatmap }) {
  const n = space.grid.length;
  return (
    <div
      className="grid aspect-square w-full overflow-hidden rounded-lg border border-line/10 bg-brand-bg"
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
    >
      {/* Row 0 (min Z) at the top; columns left→right are min→max X — a top-down floor plan. */}
      {space.grid.map((row, r) =>
        row.map((w, c) => (
          <div
            key={`${r}-${c}`}
            style={{ backgroundColor: heatColor(w) }}
            title={`${Math.round(w * 100)}%`}
          />
        )),
      )}
    </div>
  );
}

/**
 * Map a normalized weight 0..1 to a light-safe cool→hot color: brand violet
 * fading in from transparent, then heating to the semantic danger red. Empty
 * cells stay transparent so the paper floor plan reads through.
 */
function heatColor(w: number): string {
  if (w <= 0.001) return 'transparent';
  const stops = [
    { t: 0, c: [108, 92, 231] }, // violet, nearly transparent
    { t: 0.55, c: [108, 92, 231] }, // violet, solidifying
    { t: 1, c: [192, 57, 43] }, // #c0392b danger — hottest
  ];
  let lo = stops[0]!;
  let hi = stops[stops.length - 1]!;
  for (let i = 0; i < stops.length - 1; i++) {
    if (w >= stops[i]!.t && w <= stops[i + 1]!.t) {
      lo = stops[i]!;
      hi = stops[i + 1]!;
      break;
    }
  }
  const span = hi.t - lo.t || 1;
  const f = (w - lo.t) / span;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * f);
  const [r, g, b] = [mix(lo.c[0]!, hi.c[0]!), mix(lo.c[1]!, hi.c[1]!), mix(lo.c[2]!, hi.c[2]!)];
  const alpha = 0.12 + 0.88 * w; // faint at the cold end, solid when hot
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}
