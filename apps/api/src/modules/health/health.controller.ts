import { Controller, Get, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { PLATFORM } from '@mvs/shared';
import { SCENE_REV } from '@mvs/config';
import { Public } from '../../common/auth/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REDIS } from '../../common/redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  async health() {
    let db = 'unknown';
    try {
      await this.prisma.raw.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    let redis = 'unknown';
    try {
      redis = (await this.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      redis = 'down';
    }
    return {
      service: 'api',
      platform: PLATFORM.name,
      version: PLATFORM.version,
      sceneRev: SCENE_REV,
      db,
      redis,
      ts: new Date().toISOString(),
    };
  }
}
