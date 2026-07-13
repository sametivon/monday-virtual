'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { HelpCircle, MousePointerClick, X } from 'lucide-react';
import { IconButton, Kbd, SPRING } from '@/ui/primitives';

const STORAGE_KEY = 'mvs:controls:v1';

const ROWS: { keys: React.ReactNode; label: string }[] = [
  {
    keys: (
      <>
        <Kbd>W</Kbd>
        <Kbd>A</Kbd>
        <Kbd>S</Kbd>
        <Kbd>D</Kbd>
      </>
    ),
    label: 'Walk around (or click the floor)',
  },
  { keys: <span className="text-xs text-brand-text/60">Drag · Scroll</span>, label: 'Look around · zoom' },
  { keys: <Kbd>G</Kbd>, label: 'Wave' },
  { keys: <Kbd>X</Kbd>, label: 'Sit down / stand up' },
  {
    keys: <MousePointerClick size={14} strokeWidth={1.75} className="text-brand-text/60" aria-hidden="true" />,
    label: 'Click tables, boards and screens to use them',
  },
  { keys: <span className="text-xs text-brand-text/60">🔊</span>, label: 'Walk close to someone to talk' },
];

/**
 * First-visit controls card (dismiss persists in localStorage) + a persistent
 * "?" button to reopen it. The product's entire control surface, explained
 * once, quietly.
 */
export function WelcomeHint() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      /* storage unavailable (iframe privacy mode) — skip the hint */
    }
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="absolute bottom-4 right-[280px] z-30">
        <IconButton
          icon={HelpCircle}
          aria-label="Show controls"
          variant="ghost"
          onClick={() => setOpen(true)}
        />
      </div>
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={SPRING}
            className="glass-strong absolute bottom-20 right-4 z-30 w-72 rounded-lg p-4 text-brand-text"
            role="dialog"
            aria-label="Controls"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base">Getting around</h3>
              <IconButton icon={X} aria-label="Dismiss controls" size="sm" onClick={dismiss} />
            </div>
            <ul className="space-y-2.5">
              {ROWS.map((row, i) => (
                <li key={i} className="flex items-center gap-3 text-[13px]">
                  <span className="flex w-28 shrink-0 flex-wrap items-center gap-1">{row.keys}</span>
                  <span className="text-brand-text/75">{row.label}</span>
                </li>
              ))}
            </ul>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
