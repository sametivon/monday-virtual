import { Controller, Get, Query } from '@nestjs/common';
import {
  AnalyticsQuerySchema,
  HeatmapQuerySchema,
  Permission,
  type AnalyticsSummary,
  type HeatmapResponse,
} from '@mvs/shared';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Admin dashboard summary over the last `days` (default 7). */
  @RequirePermissions(Permission.ANALYTICS_VIEW)
  @Get('summary')
  summary(
    @CurrentUser() user: RequestUser,
    @Query(new ZodBody(AnalyticsQuerySchema)) query: { days: number },
  ): Promise<AnalyticsSummary> {
    return this.analytics.summary(user.tenantId, query.days);
  }

  /** Per-space occupancy heatmap over the last `days` (optionally one space). */
  @RequirePermissions(Permission.ANALYTICS_VIEW)
  @Get('heatmap')
  heatmap(
    @CurrentUser() user: RequestUser,
    @Query(new ZodBody(HeatmapQuerySchema)) query: { days: number; spaceId?: string },
  ): Promise<HeatmapResponse> {
    return this.analytics.heatmap(user.tenantId, query.days, query.spaceId);
  }
}
