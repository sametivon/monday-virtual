import { z } from 'zod';

/**
 * Validated environment. The app refuses to boot if required vars are missing
 * or malformed (fail fast — no half-configured services). Secrets are NEVER
 * hardcoded; everything flows through here.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Hosts like Render/Heroku inject the port to bind as $PORT. Honor it when
  // API_PORT isn't explicitly set (see loadEnv); default 4000 locally.
  API_PORT: z.coerce.number().default(4000),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(2592000),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 32-byte hex (64 chars)'),

  MONDAY_CLIENT_ID: z.string().optional(),
  MONDAY_CLIENT_SECRET: z.string().optional(),
  MONDAY_SIGNING_SECRET: z.string().optional(),
  MONDAY_OAUTH_REDIRECT_URI: z.string().url().optional(),
  MONDAY_SCOPES: z.string().default('me:read boards:read users:read account:read'),

  // Plan for tenants with NO monday subscription (pre-marketplace, dev tokens).
  // COMPANY = all features on (today's behavior); flip to TEAM/FREE once the
  // Marketplace listing is live to turn plan enforcement on.
  DEFAULT_PLAN: z.enum(['FREE', 'TEAM', 'COMPANY', 'ENTERPRISE']).default('COMPANY'),

  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),

  // S3-compatible object storage (AWS S3 / Cloudflare R2 / Backblaze B2) for
  // uploaded logos + slide images. All optional — uploads return 503 until set.
  S3_ENDPOINT: z.string().url().optional(), // omit for AWS; set for R2/B2
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Public base URL the bucket is served from (CDN or bucket public URL). */
  S3_PUBLIC_BASE_URL: z.string().url().optional(),

  // Transactional mail (Resend). Both optional — mail silently no-ops until
  // set, and sending is always fire-and-forget (never blocks a request).
  RESEND_API_KEY: z.string().optional(),
  /** RFC 5322 sender, e.g. `MondayVirtual <hello@mondayvirtual.eu>`. */
  MAIL_FROM: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, unknown> = process.env): Env {
  // Map the host-injected $PORT onto API_PORT unless API_PORT is set explicitly.
  const withPort =
    source.API_PORT == null && source.PORT != null ? { ...source, API_PORT: source.PORT } : source;
  const parsed = EnvSchema.safeParse(withPort);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
