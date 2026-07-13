'use client';

import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';

/**
 * App-wide motion context. LazyMotion keeps the bundle to the DOM-animation
 * features actually used; reducedMotion="user" disables transform animation
 * for prefers-reduced-motion users WITHOUT branching render output (the
 * hydration-safe pattern — never branch markup on useReducedMotion).
 */
export function UiMotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** The app's one spring — snappy but quiet. */
export const SPRING = { type: 'spring', stiffness: 320, damping: 28, mass: 0.7 } as const;
