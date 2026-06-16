import { Injectable } from '@nestjs/common';
import type { AnalyticsSummary, HeatmapResponse, SpaceHeatmap } from '@mvs/shared';
import { HEATMAP_GRID, SceneConfigSchema } from '@mvs/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Aggregates raw AnalyticsEvent rows (written fire-and-forget by the realtime
 * gateway) into the admin dashboard summary. In-memory rollups are fine at MVP
 * volume; time-bucket partitioning + materialized rollups are the Phase-3
 * scale-hardening step.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string, days: number): Promise<AnalyticsSummary> {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const [events, spaces] = await Promise.all([
      this.prisma.forTenant(tenantId).analyticsEvent.findMany({
        where: { ts: { gte: from } },
        orderBy: { ts: 'asc' },
      }),
      this.prisma.forTenant(tenantId).space.findMany({ select: { id: true, name: true } }),
    ]);
    const spaceName = new Map(spaces.map((s) => [s.id, s.name]));

    const activeUserIds = new Set<string>();
    const dayUsers = new Map<string, Set<string>>(); // YYYY-MM-DD → users
    const durations: number[] = [];
    let sessions = 0;
    let messages = 0;
    let reactions = 0;
    let handRaises = 0;

    // Per-space accumulators.
    const perSpace = new Map<
      string,
      { sessions: number; messages: number; durations: number[] }
    >();
    const space = (id: string) => {
      let s = perSpace.get(id);
      if (!s) {
        s = { sessions: 0, messages: 0, durations: [] };
        perSpace.set(id, s);
      }
      return s;
    };

    for (const e of events) {
      if (e.userId) {
        activeUserIds.add(e.userId);
        const day = e.ts.toISOString().slice(0, 10);
        (dayUsers.get(day) ?? dayUsers.set(day, new Set()).get(day)!).add(e.userId);
      }
      const payload = (e.payload ?? {}) as { durationSeconds?: number };
      switch (e.type) {
        case 'space_join':
          sessions++;
          if (e.spaceId) space(e.spaceId).sessions++;
          break;
        case 'space_leave':
          if (typeof payload.durationSeconds === 'number') {
            durations.push(payload.durationSeconds);
            if (e.spaceId) space(e.spaceId).durations.push(payload.durationSeconds);
          }
          break;
        case 'chat_send':
          messages++;
          if (e.spaceId) space(e.spaceId).messages++;
          break;
        case 'reaction':
          reactions++;
          break;
        case 'hand_raise':
          handRaises++;
          break;
      }
    }

    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const toMinutes = (seconds: number) => Math.round((seconds / 60) * 10) / 10;

    // Fill every day in the window so the trend line has no gaps.
    const dailyActiveUsers: { date: string; users: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(to.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      dailyActiveUsers.push({ date: d, users: dayUsers.get(d)?.size ?? 0 });
    }

    const spaceRows = [...perSpace.entries()]
      .map(([spaceId, s]) => ({
        spaceId,
        name: spaceName.get(spaceId) ?? 'Unknown space',
        sessions: s.sessions,
        avgSessionMinutes: toMinutes(mean(s.durations)),
        messages: s.messages,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        activeUsers: activeUserIds.size,
        sessions,
        avgSessionMinutes: toMinutes(mean(durations)),
        messages,
        reactions,
        handRaises,
      },
      dailyActiveUsers,
      spaces: spaceRows,
    };
  }

  /**
   * Occupancy heatmap: fold the `space_occupancy` samples (sparse XZ point
   * lists written by the realtime occupancy sampler) into a per-space grid of
   * normalized weights over the floor plane. Each sample point is binned into
   * the grid cell its world XZ falls in, using the space's scene bounds; the
   * grid is then normalized to its own peak so the hottest cell reads 1.0.
   */
  async heatmap(tenantId: string, days: number, spaceId?: string): Promise<HeatmapResponse> {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const [events, spaces] = await Promise.all([
      this.prisma.forTenant(tenantId).analyticsEvent.findMany({
        where: { type: 'space_occupancy', ts: { gte: from }, ...(spaceId ? { spaceId } : {}) },
        select: { spaceId: true, payload: true },
      }),
      this.prisma
        .forTenant(tenantId)
        .space.findMany({ select: { id: true, name: true, sceneConfig: true } }),
    ]);

    const spaceMeta = new Map(spaces.map((s) => [s.id, s]));

    // Accumulate counts per space into a fresh grid, plus the sample total.
    const accum = new Map<string, { grid: number[][]; samples: number }>();
    const gridFor = (id: string) => {
      let g = accum.get(id);
      if (!g) {
        g = {
          grid: Array.from({ length: HEATMAP_GRID }, () => new Array<number>(HEATMAP_GRID).fill(0)),
          samples: 0,
        };
        accum.set(id, g);
      }
      return g;
    };

    for (const e of events) {
      if (!e.spaceId) continue;
      const meta = spaceMeta.get(e.spaceId);
      if (!meta) continue;
      const payload = (e.payload ?? {}) as { points?: [number, number][]; count?: number };
      const points = Array.isArray(payload.points) ? payload.points : [];
      if (points.length === 0) continue;

      const bounds = this.floorBounds(meta.sceneConfig);
      const [minX, maxX, minZ, maxZ] = bounds;
      const spanX = maxX - minX || 1;
      const spanZ = maxZ - minZ || 1;
      const g = gridFor(e.spaceId);
      g.samples += 1;
      for (const p of points) {
        const [x, z] = p;
        const col = clampCell(Math.floor(((x - minX) / spanX) * HEATMAP_GRID));
        const row = clampCell(Math.floor(((z - minZ) / spanZ) * HEATMAP_GRID));
        g.grid[row][col] += 1;
      }
    }

    const out: SpaceHeatmap[] = [];
    let peakBusy = 0;
    for (const [id, { grid, samples }] of accum) {
      const meta = spaceMeta.get(id);
      if (!meta) continue;
      let peak = 0;
      let total = 0;
      for (const row of grid) for (const v of row) {
        if (v > peak) peak = v;
        total += v;
      }
      const norm = peak > 0 ? grid.map((row) => row.map((v) => Math.round((v / peak) * 1000) / 1000)) : grid;
      if (total > peakBusy) peakBusy = total;
      out.push({ spaceId: id, name: meta.name, bounds: this.floorBounds(meta.sceneConfig), grid: norm, samples });
    }
    // Busiest first (by total occupancy mass).
    out.sort((a, b) => b.samples - a.samples);

    return { from: from.toISOString(), to: to.toISOString(), spaces: out };
  }

  /** Floor extent [minX, maxX, minZ, maxZ] from a space's scene bounds. */
  private floorBounds(sceneConfig: unknown): [number, number, number, number] {
    const parsed = SceneConfigSchema.safeParse(sceneConfig);
    const b = parsed.success ? parsed.data.bounds : { min: [-50, 0, -50] as const, max: [50, 20, 50] as const };
    return [b.min[0], b.max[0], b.min[2], b.max[2]];
  }
}

/** Clamp a computed cell index into [0, HEATMAP_GRID-1] (out-of-bounds positions hug the edge). */
function clampCell(i: number): number {
  if (i < 0) return 0;
  if (i >= HEATMAP_GRID) return HEATMAP_GRID - 1;
  return i;
}
