import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Hosts like Render inject $PORT; honored in loadEnv when REALTIME_PORT unset.
  REALTIME_PORT: z.coerce.number().default(4001),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  REDIS_URL: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  /** Override the occupancy-heatmap sampling cadence (ms). Optional — defaults
   * to OCCUPANCY_SAMPLE_INTERVAL_MS. Lets tests/load-runs sample faster. */
  OCCUPANCY_SAMPLE_MS: z.coerce.number().int().positive().optional(),
  /** Sentry error tracking DSN. Optional — when unset, Sentry is a no-op. */
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, unknown> = process.env): Env {
  // Map the host-injected $PORT onto REALTIME_PORT unless set explicitly.
  const withPort =
    source.REALTIME_PORT == null && source.PORT != null
      ? { ...source, REALTIME_PORT: source.PORT }
      : source;
  const parsed = EnvSchema.safeParse(withPort);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid realtime environment:\n${issues}`);
  }
  return parsed.data;
}
