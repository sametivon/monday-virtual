/** Public runtime config (NEXT_PUBLIC_* only — safe to ship to the browser). */
export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4001',
  livekitUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? '',
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
} as const;

// Fail the production BUILD if the API/realtime URLs still point at localhost —
// a localhost backend in a deployed bundle is always broken (NEXT_PUBLIC_* are
// inlined at build time, so this can only be fixed by setting them on the host).
// NODE_ENV is statically inlined by Next, so this whole block is dead-code-
// eliminated in dev/test and never runs in the browser.
if (process.env.NODE_ENV === 'production') {
  const local = /localhost|127\.0\.0\.1/;
  for (const [key, value] of [
    ['NEXT_PUBLIC_API_URL', env.apiUrl],
    ['NEXT_PUBLIC_REALTIME_URL', env.realtimeUrl],
  ] as const) {
    if (local.test(value)) {
      throw new Error(
        `${key} is "${value}" in a production build — set it to the deployed backend URL.`,
      );
    }
  }
}
