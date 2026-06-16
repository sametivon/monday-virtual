import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { loadEnv } from './config/env';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { EventsModule } from './modules/events/events.module';
import { GdprModule } from './modules/gdpr/gdpr.module';
import { HealthModule } from './modules/health/health.module';
import { MediaModule } from './modules/media/media.module';
import { MeModule } from './modules/me/me.module';
import { MondayModule } from './modules/monday/monday.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { SpacesModule } from './modules/spaces/spaces.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { WhiteboardModule } from './modules/whiteboard/whiteboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Fail fast on bad config; root .env is loaded by the process.
      validate: (raw) => loadEnv(raw),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    AnalyticsModule,
    AuthModule,
    ChatModule,
    EventsModule,
    GdprModule,
    HealthModule,
    MeModule,
    SpacesModule,
    MediaModule,
    MondayModule,
    RbacModule,
    TenantModule,
    UploadsModule,
    WhiteboardModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
