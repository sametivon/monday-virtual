import 'reflect-metadata';
import * as Sentry from '@sentry/node';

// Error tracking: initialised BEFORE the app. No-op when SENTRY_DSN is unset.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
  });
}

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './adapters/redis-io.adapter';
import { JsonLogger } from './common/logging/json.logger';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new JsonLogger());
  const config = app.get(ConfigService<Env, true>);

  // Behind Render's proxy — trust the first hop for client IP / protocol.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const corsOrigin = config.get('WEB_PUBLIC_URL', { infer: true });
  app.enableCors({ origin: [corsOrigin], credentials: true });

  const redisAdapter = new RedisIoAdapter(
    app,
    config.get('REDIS_URL', { infer: true }),
    corsOrigin,
  );
  await redisAdapter.connect();
  app.useWebSocketAdapter(redisAdapter);
  app.enableShutdownHooks();

  const port = config.get('REALTIME_PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`Realtime (Socket.IO) listening on :${port} namespace /space`);
}

void bootstrap();
