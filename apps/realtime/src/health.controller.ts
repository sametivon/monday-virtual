import { Controller, Get, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { PLATFORM } from '@mvs/shared';
import { REDIS } from './common/redis.module';

@Controller('health')
export class HealthController {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  // Always returns 200 with status fields. We intentionally do NOT fail the
  // health response on a Redis blip — on a single free-tier instance that would
  // recycle the only node over a transient hiccup. The fields surface state for
  // monitoring; the process is up as long as it answers.
  @Get()
  async health() {
    let redis = 'unknown';
    try {
      redis = (await this.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      redis = 'down';
    }
    return {
      service: 'realtime',
      platform: PLATFORM.name,
      version: PLATFORM.version,
      redis,
      ts: new Date().toISOString(),
    };
  }
}
