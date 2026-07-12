'use client';

import { useEffect, useRef } from 'react';

/**
 * Soft, flowing mesh-gradient background — layered blurred color fields that
 * slowly drift (see landing.css `.grad-*`). Pure CSS so it composites reliably
 * everywhere and stays light. The drift only runs while on-screen (an
 * IntersectionObserver toggles `.mv-inview`) and is frozen under
 * prefers-reduced-motion. `palette`/`base` are accepted for API compatibility;
 * the per-variant colors live in the stylesheet.
 */
export function GradientCanvas({
  className,
}: {
  className?: string;
  palette?: [number, number, number, number];
  base?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      el.classList.add('mv-inview');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => el.classList.toggle('mv-inview', entries[0]?.isIntersecting ?? false),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <div ref={ref} className={className} aria-hidden="true" />;
}
