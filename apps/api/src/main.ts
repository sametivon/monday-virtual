import 'reflect-metadata';
import * as Sentry from '@sentry/node';

// Error tracking: initialised BEFORE the app so early errors are captured. A
// no-op when SENTRY_DSN is unset, so local dev is unaffected.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
  });
}
// OpenTelemetry is deferred (no collector on the free tier). When ready, init an
// env-gated `NodeSDK` here, only when OTEL_EXPORTER_OTLP_ENDPOINT is set.

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logging/json.logger';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new JsonLogger());
  const config = app.get(ConfigService<Env, true>);

  // Behind Render's proxy: trust the first hop so client IP (rate limiting) and
  // protocol detection use X-Forwarded-*. Harmless when no proxy is present.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.use(helmet({ contentSecurityPolicy: false })); // CSP handled at the edge/iframe host
  app.enableCors({
    origin: [config.get('WEB_PUBLIC_URL', { infer: true })],
    credentials: true,
  });
  // Request validation is zod-based, applied per-route via ZodValidationPipe.
  app.enableShutdownHooks();

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on :${port} (prefix /api)`);

  // Free-tier keep-alive: ping our own public URL + the realtime service
  // every 5 minutes. Render counts proxied self-traffic as inbound activity,
  // so the pair never spins down while either is awake (the GitHub cron only
  // fires ~hourly in practice — it resurrects, this sustains). Also keeps
  // the event-reminder cron honest.
  const keepAlive = process.env.KEEPALIVE_URLS;
  if (keepAlive) {
    const urls = keepAlive.split(',').map((u) => u.trim()).filter(Boolean);
    setInterval(() => {
      for (const url of urls) {
        void fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => undefined);
      }
    }, 5 * 60_000).unref();
  }
}

void bootstrap();
