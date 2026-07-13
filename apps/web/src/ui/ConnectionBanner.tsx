'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { useConnectionStore } from '@/stores/connectionStore';
import { SPRING, Spinner } from '@/ui/primitives';

/**
 * Top-center pill while the realtime connection is down — outages must never
 * be silent. After ~10s the copy explains the free-tier cold start so a long
 * wait reads as expected behavior, not a hang.
 */
export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);
  const serverRestarting = useConnectionStore((s) => s.serverRestarting);
  const [longWait, setLongWait] = useState(false);

  const visible = status === 'reconnecting' || status === 'offline';

  useEffect(() => {
    if (!visible) {
      setLongWait(false);
      return;
    }
    const id = setTimeout(() => setLongWait(true), 10_000);
    return () => clearTimeout(id);
  }, [visible]);

  const label = serverRestarting
    ? 'Server updating — reconnecting…'
    : status === 'offline'
      ? 'Connection lost — retrying…'
      : 'Reconnecting…';

  return (
    <AnimatePresence>
      {visible && (
        <m.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={SPRING}
          className="glass-strong absolute left-1/2 top-16 z-40 flex max-w-md -translate-x-1/2 items-center gap-2.5 rounded-md px-4 py-2.5 text-sm text-brand-text"
          role="status"
          aria-live="assertive"
        >
          {status === 'offline' ? (
            <WifiOff size={15} strokeWidth={1.75} className="shrink-0 text-warning" aria-hidden="true" />
          ) : (
            <Spinner size={14} />
          )}
          <span>
            {label}
            {longWait && (
              <span className="block text-xs text-brand-text/55">
                The server is waking up — this can take up to ~45 seconds.
              </span>
            )}
          </span>
        </m.div>
      )}
    </AnimatePresence>
  );
}
