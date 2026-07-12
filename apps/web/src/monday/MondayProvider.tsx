'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { getMondaySessionToken, inMondayIframe, mondayApi } from './client';

/**
 * Bootstraps the session when the app loads inside the monday.com iframe:
 *   1. ask the monday SDK for a sessionToken
 *   2. exchange it for app JWTs at the API
 *   3. load /me, apply tenant branding
 * For local standalone dev, falls back to `?devSessionToken=...` in the URL.
 */
export function MondayProvider({ children }: { children: React.ReactNode }) {
  const { setStatus, setMe } = useSessionStore();

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setStatus('authenticating');
      try {
        // Pop-out handoff: a one-shot token left by the in-iframe session
        // lets the new top-level tab skip the monday auth entirely.
        const handoff = consumeHandoff();
        if (handoff) {
          api.setToken(handoff);
          const me = await api.me();
          if (cancelled) return;
          setMe(me); // BrandingApplier (layout) themes off the store
          return;
        }

        // An explicit dev token in the URL wins; otherwise ask the monday SDK
        // (which only answers inside the monday iframe).
        const fromUrl =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('devSessionToken')
            : null;
        const sessionToken = fromUrl ?? (await getMondaySessionToken());
        if (!sessionToken) {
          // A public visitor opened the app URL directly (not embedded in the
          // monday iframe and no pop-out handoff) — send them to the website
          // instead of showing the "open from monday" error.
          if (!inMondayIframe()) {
            window.location.replace('/home');
            return;
          }
          throw new Error('No monday sessionToken (open this app from monday.com)');
        }

        // Real display name/email come from a client-side seamless me() —
        // view sessionTokens don't carry them and aren't accepted by the
        // monday API server-side. Cosmetic only; ids stay token-verified.
        let profile: { name: string; email?: string } | undefined;
        if (!fromUrl && inMondayIframe()) {
          profile = await mondayApi<{ me: { name: string; email: string } }>(
            'query { me { name email } }',
            undefined,
            4000,
          )
            .then((d) => ({ name: d.me.name, email: d.me.email }))
            .catch(() => undefined);
        }

        await api.authWithSession(sessionToken, profile);
        const me = await api.me();
        if (cancelled) return;
        setMe(me);
      } catch (err) {
        if (!cancelled) setStatus('error', (err as Error).message);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setStatus, setMe]);

  return <>{children}</>;
}

/**
 * Read the pop-out token from the URL fragment and strip it so it can't be
 * replayed from history. The fragment (not localStorage) is used because the
 * in-iframe session's storage is partitioned under monday.com and invisible to
 * a top-level pop-out tab. A legacy localStorage key is still consumed as a
 * fallback for same-origin (non-iframe) pop-outs.
 */
function consumeHandoff(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const match = /[#&]mvs_handoff=([^&]+)/.exec(window.location.hash);
    if (match) {
      const token = decodeURIComponent(match[1]);
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return token || null;
    }
    const raw = localStorage.getItem('mvs:handoff');
    if (!raw) return null;
    localStorage.removeItem('mvs:handoff');
    return (JSON.parse(raw) as { accessToken?: string }).accessToken ?? null;
  } catch {
    return null;
  }
}
