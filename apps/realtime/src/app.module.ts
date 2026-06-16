import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { RedisModule } from './common/redis.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { loadEnv } from './config/env';
import { HealthController } from './health.controller';
import { AnalyticsService } from './gateways/analytics.service';
import { AttendanceService } from './gateways/attendance.service';
import { ChatService } from './gateways/chat.service';
import { OccupancyService } from './gateways/occupancy.service';
import { PresenceService } from './gateways/presence.service';
import { SpaceGateway } from './gateways/space.gateway';
import { TickService } from './gateways/tick.service';
import { WhiteboardService } from './gateways/whiteboard.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: (raw) => loadEnv(raw) }),
    RedisModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    AnalyticsService,
    AttendanceService,
    ChatService,
    OccupancyService,
    PresenceService,
    TickService,
    WhiteboardService,
    SpaceGateway,
  ],
})
export class AppModule {}
