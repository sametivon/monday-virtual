import { Injectable, Logger } from '@nestjs/common';
import { HEATMAP_GRID } from '@mvs/shared';
import { AnalyticsService } from './analytics.service';
import { PresenceService } from './presence.service';

/**
 * Occupancy sampling for the analytics heatmap (Phase 3). On a slow timer
 * (OCCUPANCY_SAMPLE_INTERVAL_MS, driven by the tick loop) this snapshots where
 * players are standing in each occupied space and writes ONE compact
 * `space_occupancy` AnalyticsEvent per space — a sparse list of populated grid
 * cells, not the hot-path movement stream. The API folds these samples into a
 * per-space heatmap.
 *
 * Multi-node safe: each realtime node samples only the players connected to it
 * and writes its own rows; the API sums rows across nodes, so the aggregate is
 * the true occupancy without any cross-node coordination.
 *
 * Grid coords are normalized 0..1 over the space's floor; the API maps them to
 * world XZ using the space's bounds. Sampling in normalized space here means we
 * don't need the scene config in the realtime process — `position` is already
 * world XZ, and the API knows the bounds, so we send raw world XZ and let the
 * API bin it. (Binning here would bake in stale bounds.)
 */
@Injectable()
export class OccupancyService {
  private readonly logger = new Logger(OccupancyService.name);

  constructor(
    private readonly presence: PresenceService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Snapshot every locally-occupied space and emit one occupancy event each. */
  sample(): void {
    const bySpace = this.presence.localPositionsBySpace();
    for (const [{ tenantId, spaceId }, points] of bySpace) {
      if (points.length === 0) continue;
      // Cap the payload: send raw XZ points (the API bins them). A space with
      // hundreds present is the scale-hardening regime; clamp to keep the row
      // small — a sample of positions is statistically representative.
      const sampled = points.length > 256 ? points.slice(0, 256) : points;
      this.analytics.track(tenantId, 'space_occupancy', {
        spaceId,
        payload: { points: sampled, count: points.length, grid: HEATMAP_GRID },
      });
    }
  }
}
