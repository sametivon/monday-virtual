'use client';

import mondaySdk from 'monday-sdk-js';

/**
 * Singleton monday SDK instance. Inside the iframe it bridges to monday.com via
 * postMessage; outside (local dev standalone) calls simply resolve empty, which
 * lets us fall back to a dev session token from the URL.
 */
export const monday = mondaySdk();

export interface MondayContext {
  themeName?: string;
  account?: { id?: number };
  user?: { id?: number; isAdmin?: boolean };
}

export async function getMondayContext(): Promise<MondayContext> {
  try {
    const res = (await monday.get('context')) as { data?: MondayContext };
    return res.data ?? {};
  } catch {
    return {};
  }
}

export async function getMondaySessionToken(timeoutMs = 2000): Promise<string | null> {
  try {
    // Outside the monday iframe the SDK's get() never settles (it waits for a
    // postMessage reply that will never come), so cap it with a timeout.
    const res = (await Promise.race([
      monday.get('sessionToken'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])) as { data?: string } | null;
    return res?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Client-side seamless GraphQL: the iframe asks monday (via postMessage) to
 * run the query under the app's granted scopes. This is THE supported data
 * path for view-feature apps — monday does NOT accept view sessionTokens as
 * server-side API tokens, even with scopes configured (verified empirically).
 * Server-side reads need an OAuth grant instead (Phase 3).
 */
export async function mondayApi<T>(
  query: string,
  variables?: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<T> {
  const res = (await Promise.race([
    monday.api(query, { variables, apiVersion: '2024-10' }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('monday API timed out — are you inside monday.com?')), timeoutMs),
    ),
  ])) as { data?: T; errors?: { message: string }[]; error_message?: string };
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '));
  if (res.error_message) throw new Error(res.error_message);
  if (!res.data) throw new Error('monday API returned no data');
  return res.data;
}

/** True when running embedded in monday.com (the only place seamless calls work). */
export function inMondayIframe(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}
