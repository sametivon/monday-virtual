'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { m } from 'framer-motion';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { SPRING } from './Motion';

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  full: 'max-w-[96vw] max-h-[94vh]',
} as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * The app's one dialog. Portal to <body>, spring enter, Escape closes,
 * backdrop click closes (opt-out via closeOnBackdrop={false}), focus is
 * trapped inside and restored on unmount, aria-modal + labelled title.
 */
export function Modal({
  title,
  onClose,
  children,
  size = 'md',
  closeOnBackdrop = true,
  headerExtra,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  size?: keyof typeof SIZES;
  closeOnBackdrop?: boolean;
  /** Optional right-side header content (tabs, actions) before the close button. */
  headerExtra?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`modal-${Math.random().toString(36).slice(2, 8)}`);

  // Focus management: remember the opener, focus the panel, trap Tab, restore.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusables = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
  }, [onClose]);

  const onBackdrop = useCallback(() => {
    if (closeOnBackdrop) onClose();
  }, [closeOnBackdrop, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={onBackdrop}
    >
      <m.div
        className="absolute inset-0 bg-brand-text/25 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        aria-hidden="true"
      />
      <m.div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        onClick={(e) => e.stopPropagation()}
        className={`relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl bg-brand-surface shadow-e3 outline-none ${SIZES[size]}`}
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING}
      >
        <header className="flex items-center gap-3 border-b border-line/8 px-5 py-3.5">
          <h2 id={titleId.current} className="font-display text-lg text-brand-text">
            {title}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            {headerExtra}
            <IconButton icon={X} aria-label="Close" size="sm" onClick={onClose} />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </m.div>
    </div>,
    document.body,
  );
}
