'use client';

import { AnimatePresence, m, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * Interactive product demo: four short scenes that auto-advance (pause on
 * hover, click to jump) showing the core loop — walk in & talk, present,
 * whiteboard, boards updating. Crossfades with a soft rise; pauses off-screen;
 * static first scene under prefers-reduced-motion.
 */

const STEPS = [
  { key: 'meet', title: 'Walk in & talk', text: 'Move next to someone — voice fades in like real life. No links, no scheduling.' },
  { key: 'present', title: 'Present to the room', text: 'Share your screen onto the auditorium wall; every seat gets a one-click full-screen view.' },
  { key: 'board', title: 'Whiteboard together', text: 'Sketch on a shared board in the space — strokes sync live to everyone.' },
  { key: 'monday', title: 'Your boards stay live', text: 'monday.com boards hang on the walls and update as work happens — attendance flows back too.' },
] as const;

const DURATION = 4600;

function SceneMeet() {
  return (
    <div className="pd-scene">
      <div className="pd-floor" aria-hidden="true" />
      <div className="pd-ring" aria-hidden="true" />
      {[
        { n: 'M', c: '#6c5ce7', x: '38%', y: '52%' },
        { n: 'J', c: '#0a9a6e', x: '54%', y: '46%' },
        { n: 'A', c: '#d0716d', x: '70%', y: '60%', walk: true },
      ].map((p) => (
        <span key={p.n} className={`pd-av ${p.walk ? 'pd-walk' : ''}`} style={{ left: p.x, top: p.y, background: p.c }}>
          {p.n}
        </span>
      ))}
      <span className="pd-tag" style={{ left: '40%', top: '30%' }}>🔊 talking nearby</span>
    </div>
  );
}
function ScenePresent() {
  return (
    <div className="pd-scene">
      <div className="pd-bigscreen">
        <span className="hs-slide-bar" style={{ width: '58%' }} />
        <span className="hs-slide-bar" style={{ width: '76%' }} />
        <span className="hs-slide-chart" aria-hidden="true">
          <i style={{ height: '42%' }} /><i style={{ height: '70%' }} /><i style={{ height: '56%' }} /><i style={{ height: '86%' }} />
        </span>
        <span className="pd-live">● LIVE · Maya</span>
      </div>
      <div className="pd-seats" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} style={{ animationDelay: `${(i % 5) * 0.7}s` }} />
        ))}
      </div>
    </div>
  );
}
function SceneBoard() {
  return (
    <div className="pd-scene">
      <div className="pd-wb">
        <svg viewBox="0 0 240 120" aria-hidden="true">
          <path className="hs-stroke" d="M18 96 C 52 24, 96 30, 122 66 S 190 104, 224 40" />
          <rect className="hs-stroke hs-stroke-2" x="40" y="26" width="42" height="30" rx="6" />
        </svg>
        <span className="hs-sticky" style={{ right: '14%', top: '18%' }}>ship it</span>
        <div className="hs-cursor pd-wb-cursor" aria-hidden="true">
          <svg width="13" height="14" viewBox="0 0 13 14"><path d="M1 1l4.2 11 1.7-4.6L11.6 6z" fill="#6c5ce7" stroke="#fff" strokeWidth="1" /></svg>
          <span>Maya</span>
        </div>
      </div>
    </div>
  );
}
function SceneMonday() {
  return (
    <div className="pd-scene">
      <div className="pd-mboard">
        <div className="hs-mini-head">📊 Q3 launch · monday.com</div>
        <div className="hs-row"><span className="hs-cell">All-hands deck</span><span className="hs-status done">Done</span></div>
        <div className="hs-row"><span className="hs-cell">Pricing page</span><span className="hs-status flip">Working on it</span></div>
        <div className="hs-row hs-row-new"><span className="hs-cell">Attendance · 47 joined ✓</span><span className="hs-status queued">Synced</span></div>
      </div>
    </div>
  );
}
const SCENES = { meet: SceneMeet, present: ScenePresent, board: SceneBoard, monday: SceneMonday };

export function ProductDemo() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const [step, setStep] = useState(0);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (reduce || !inView || hover) return;
    const id = setInterval(() => setStep((s) => (s + 1) % STEPS.length), DURATION);
    return () => clearInterval(id);
  }, [reduce, inView, hover]);

  const active = STEPS[step]!;
  const Scene = SCENES[active.key];

  return (
    <div
      ref={ref}
      className={`pd ${inView && !reduce ? 'mv-inview' : ''}`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <div className="pd-steps" role="tablist" aria-label="Product demo steps">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={i === step}
            className={`pd-step ${i === step ? 'active' : ''}`}
            onClick={() => setStep(i)}
          >
            <span className="pd-step-title">{s.title}</span>
            <span className="pd-step-text">{s.text}</span>
            {i === step && (
              // Reduced-motion CSS freezes the fill; markup stays SSR-identical.
              <span className="pd-progress" key={`p-${step}`} aria-hidden="true">
                <i style={{ animationDuration: `${DURATION}ms`, animationPlayState: inView && !hover ? 'running' : 'paused' }} />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="pd-stage">
        <AnimatePresence mode="wait">
          <m.div
            key={active.key}
            className="pd-stage-inner"
            initial={{ opacity: 0, y: 14, scale: 0.985, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, scale: 0.99, filter: 'blur(4px)' }}
            transition={{ type: 'spring', stiffness: 130, damping: 20, filter: { type: 'tween', duration: 0.35 } }}
          >
            <Scene />
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
