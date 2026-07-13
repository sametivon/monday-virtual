'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { SPRING } from './Motion';
import { useToastStore, type ToastItem } from './toastStore';

const ICONS = {
  success: { Ico: CheckCircle2, cls: 'text-success' },
  error: { Ico: AlertCircle, cls: 'text-danger' },
  info: { Ico: Info, cls: 'text-brand-primary' },
} as const;

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = () => {
    timer.current = setTimeout(() => dismiss(item.id), item.duration);
  };
  const disarm = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => {
    arm();
    return disarm;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { Ico, cls } = ICONS[item.kind];
  return (
    <m.button
      layout
      type="button"
      onClick={() => dismiss(item.id)}
      onMouseEnter={disarm}
      onMouseLeave={arm}
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={SPRING}
      className="glass-strong pointer-events-auto flex max-w-md items-center gap-2.5 rounded-md px-3.5 py-2.5 text-left text-sm text-brand-text"
    >
      <Ico size={16} strokeWidth={2} className={`shrink-0 ${cls}`} aria-hidden="true" />
      {item.message}
    </m.button>
  );
}

/** Bottom-center toast stack (above the dock). Mounted once in (app)/layout. */
export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
