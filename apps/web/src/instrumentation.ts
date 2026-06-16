/**
 * Next.js server-side instrumentation hook. Initialises Sentry on the server
 * (Node + Edge runtimes) only when NEXT_PUBLIC_SENTRY_DSN is set, so local dev
 * and DSN-less deploys are unaffected. Source maps are NOT uploaded (that needs
 * a build-time auth token); errors still report with minified frames.
 */
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({ dsn, environment: process.env.NODE_ENV, tracesSampleRate: 0 });
}
