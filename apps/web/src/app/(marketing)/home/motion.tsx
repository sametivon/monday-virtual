'use client';

import { LazyMotion, MotionConfig, domAnimation, m, useReducedMotion, useSpring } from 'framer-motion';
import { useCallback, useRef } from 'react';

/**
 * Motion primitives for the marketing page — one shared vocabulary so every
 * entrance/hover feels intentional and consistent.
 *
 * HYDRATION RULE: markup must be identical on server and client, so nothing
 * here branches its RENDER OUTPUT on useReducedMotion (SSR can't know it — a
 * mismatch leaves the server's `opacity:0` initial styles stuck). Instead,
 * MotionConfig reducedMotion="user" disables transform animation globally for
 * reduced-motion users, and pointer HANDLERS (client-only) check the flag.
 * LazyMotion(domAnimation) keeps the bundle to the features actually used.
 */

export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

const SPRING = { type: 'spring', stiffness: 110, damping: 18, mass: 0.7 } as const;

/** Scroll entrance: opacity + rise + de-blur + settle. Not a plain fade. */
export function Reveal({
  children,
  delay = 0,
  y = 26,
  className,
  as = 'div',
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'span';
}) {
  const Tag = (m as unknown as Record<string, typeof m.div>)[as] ?? m.div;
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y, scale: 0.985, filter: 'blur(7px)' }}
      whileInView={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-70px' }}
      transition={{ ...SPRING, delay, filter: { type: 'tween', duration: 0.5, delay } }}
    >
      {children}
    </Tag>
  );
}

/** Staggered child entrance for grids/lists. */
export function RevealGroup({
  children,
  className,
  stagger = 0.07,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  return (
    <m.div
      className={className}
      initial="off"
      whileInView="on"
      viewport={{ once: true, margin: '-60px' }}
      transition={{ staggerChildren: stagger }}
    >
      {children}
    </m.div>
  );
}

export function RevealItem({
  children,
  className,
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'li';
}) {
  const Tag = (m as unknown as Record<string, typeof m.div>)[as] ?? m.div;
  return (
    <Tag
      className={className}
      variants={{
        off: { opacity: 0, y: 22, scale: 0.985, filter: 'blur(6px)' },
        on: {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          transition: { ...SPRING, filter: { type: 'tween', duration: 0.5 } },
        },
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * Cursor-responsive tilt card: a few degrees of pointer-tracked rotation with
 * springs, plus a travelling sheen highlight (see .mv-tilt in landing.css).
 * The springs idle at 0 so SSR markup is stable; only the handlers move them.
 */
export function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const rx = useSpring(0, { stiffness: 180, damping: 22 });
  const ry = useSpring(0, { stiffness: 180, damping: 22 });
  const ref = useRef<HTMLDivElement>(null);

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (reduce || e.pointerType !== 'mouse') return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      ry.set(px * 6); // deg
      rx.set(-py * 5);
      el.style.setProperty('--mx', `${((px + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${((py + 0.5) * 100).toFixed(1)}%`);
    },
    [reduce, rx, ry],
  );
  const onLeave = useCallback(() => {
    rx.set(0);
    ry.set(0);
  }, [rx, ry]);

  return (
    <m.div
      ref={ref}
      className={`mv-tilt ${className ?? ''}`}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      whileHover={{ y: -4, transition: SPRING }}
    >
      {children}
    </m.div>
  );
}

/** Magnetic button wrapper: the element leans a few px toward the cursor. */
export function Magnetic({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 220, damping: 18 });
  const y = useSpring(0, { stiffness: 220, damping: 18 });
  const ref = useRef<HTMLDivElement>(null);

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (reduce || e.pointerType !== 'mouse') return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      x.set((e.clientX - (r.left + r.width / 2)) * 0.18);
      y.set((e.clientY - (r.top + r.height / 2)) * 0.22);
    },
    [reduce, x, y],
  );
  const onLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <m.div
      ref={ref}
      className={className}
      style={{ x, y, display: 'inline-flex' }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      whileTap={{ scale: 0.97 }}
    >
      {children}
    </m.div>
  );
}
