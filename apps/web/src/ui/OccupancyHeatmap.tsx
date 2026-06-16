'use client';

import { useState } from 'react';
import type { HeatmapResponse, SpaceHeatmap } from '@mvs/shared';

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
      <p className="py-10 text-center text-sm text-white/40">
        No occupancy samples yet in this window. Heatmaps build as people spend time in your spaces.
      </p>
    );
  }
  const space = spaces[Math.min(selected, spaces.length - 1)];

  return (
    <div>
      {spaces.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1 text-xs">
          {spaces.map((s, i) => (
            <button
              key={s.spaceId}
              onClick={() => setSelected(i)}
              className={`rounded-md px-2.5 py-1 transition ${
                i === Math.min(selected, spaces.length - 1)
                  ? 'bg-brand-primary'
                  : 'bg-white/5 text-white/60 hover:text-white'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <HeatGrid space={space} />

      <div className="mt-3 flex items-center justify-between text-xs text-white/40">
        <span>{space.samples} samples</span>
        <div className="flex items-center gap-2">
          <span>low</span>
          <div className="h-2 w-24 rounded-full bg-gradient-to-r from-[#1a2540] via-[#6c5ce7] to-[#ff5a5a]" />
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
      className="grid aspect-square w-full overflow-hidden rounded-lg border border-white/10 bg-[#0e1320]"
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
 * Map a normalized weight 0..1 to a perceptual cool→hot color. Below a floor we
 * return the grid background so empty cells disappear into the plan.
 */
function heatColor(w: number): string {
  if (w <= 0.001) return 'transparent';
  // Three-stop ramp: navy → violet (brand) → warm red, with alpha rising too.
  const stops = [
    { t: 0, c: [26, 37, 64] }, // #1a2540
    { t: 0.5, c: [108, 92, 231] }, // #6c5ce7 brand
    { t: 1, c: [255, 90, 90] }, // #ff5a5a
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (w >= stops[i].t && w <= stops[i + 1].t) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi.t - lo.t || 1;
  const f = (w - lo.t) / span;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * f);
  const [r, g, b] = [mix(lo.c[0], hi.c[0]), mix(lo.c[1], hi.c[1]), mix(lo.c[2], hi.c[2])];
  const alpha = 0.25 + 0.75 * w; // faint at the cold end, solid when hot
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}
