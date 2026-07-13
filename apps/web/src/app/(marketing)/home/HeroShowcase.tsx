'use client';

import { m, useInView, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The hero's product showcase: a calm, looping mock workspace — a live meeting
 * panel, screen share, whiteboard, chat and a monday board update — floating as
 * glass layers with gentle pointer parallax. Everything loops slowly (CSS
 * keyframes, gated by .mv-inview so off-screen costs nothing) and freezes under
 * prefers-reduced-motion. The goal: understand the product before reading a word.
 */

const PEOPLE = [
  { n: 'Maya', c: '#6c5ce7' },
  { n: 'Jonas', c: '#0a9a6e' },
  { n: 'Aylin', c: '#d0716d' },
  { n: 'Tomas', c: '#3d84c6' },
];

export function HeroShowcase() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2 });

  // Pointer parallax — springs so layers glide, multiplied per depth.
  const px = useSpring(0, { stiffness: 60, damping: 18 });
  const py = useSpring(0, { stiffness: 60, damping: 18 });
  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (reduce || e.pointerType !== 'mouse') return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      px.set(((e.clientX - r.left) / r.width - 0.5) * 2);
      py.set(((e.clientY - r.top) / r.height - 0.5) * 2);
    },
    [reduce, px, py],
  );
  const onLeave = useCallback(() => {
    px.set(0);
    py.set(0);
  }, [px, py]);

  // Depth transforms (px) — back layers move less than front ones.
  const x1 = useTransform(px, (v) => v * 4);
  const y1 = useTransform(py, (v) => v * 3);
  const x2 = useTransform(px, (v) => v * 9);
  const y2 = useTransform(py, (v) => v * 7);
  const x3 = useTransform(px, (v) => v * 14);
  const y3 = useTransform(py, (v) => v * 11);

  // Meeting timer — ticks only while visible; static under reduced motion.
  const [secs, setSecs] = useState(11 * 60 + 42);
  useEffect(() => {
    if (reduce || !inView) return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [reduce, inView]);
  const timer = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  // Active speaker cycles through participants.
  const [speaker, setSpeaker] = useState(0);
  useEffect(() => {
    if (reduce || !inView) return;
    const id = setInterval(() => setSpeaker((s) => (s + 1) % PEOPLE.length), 3400);
    return () => clearInterval(id);
  }, [reduce, inView]);

  return (
    <div
      ref={ref}
      className={`hs ${inView && !reduce ? 'mv-inview' : ''}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      aria-label="Preview of a MondayVirtual workspace: a live meeting with screen share, whiteboard, chat and a monday.com board updating"
      role="img"
    >
      {/* Back layer: the meeting room */}
      <m.div className="hs-layer" style={{ x: x1, y: y1 }}>
        <div className="hs-panel hs-meeting hs-float" style={{ animationDelay: '0s' }}>
          <div className="hs-head">
            <span className="hs-live">
              <span className="hs-dot" /> LIVE
            </span>
            <span className="hs-title">All-hands · Auditorium</span>
            <span className="hs-timer">{timer}</span>
          </div>
          <div className="hs-people">
            {PEOPLE.map((p, i) => (
              <div key={p.n} className={`hs-person ${i === speaker ? 'speaking' : ''}`}>
                <span className="hs-avatar" style={{ background: p.c }}>
                  {p.n[0]}
                </span>
                <span className="hs-name">{p.n}</span>
                {i === speaker && (
                  <span className="hs-wave" aria-hidden="true">
                    <i /><i /><i /><i /><i />
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="hs-meet-foot">
            <span className="hs-chip">🎤 12 unmuted</span>
            <span className="hs-chip">✋ 3 hands</span>
            <span className="hs-chip hs-chip-accent">🖥️ Maya is presenting</span>
          </div>
        </div>
      </m.div>

      {/* Mid layer: screen share + monday board */}
      <m.div className="hs-layer" style={{ x: x2, y: y2 }}>
        <div className="hs-panel hs-screen hs-float" style={{ animationDelay: '-3s' }}>
          <div className="hs-mini-head">
            <span className="hs-dot" /> Screen share
          </div>
          <div className="hs-slide">
            <span className="hs-slide-bar" style={{ width: '62%' }} />
            <span className="hs-slide-bar" style={{ width: '84%' }} />
            <span className="hs-slide-bar thin" style={{ width: '48%' }} />
            <span className="hs-slide-chart" aria-hidden="true">
              <i style={{ height: '38%' }} /><i style={{ height: '64%' }} /><i style={{ height: '52%' }} /><i style={{ height: '82%' }} />
            </span>
          </div>
          <div className="hs-slide-foot">Q3 review.pdf · slide 3 / 12</div>
        </div>

        <div className="hs-panel hs-board hs-float" style={{ animationDelay: '-6s' }}>
          <div className="hs-mini-head">📊 Sprint board · monday.com</div>
          <div className="hs-row">
            <span className="hs-cell">Launch page</span>
            <span className="hs-status flip">Working on it</span>
          </div>
          <div className="hs-row">
            <span className="hs-cell">Beta invites</span>
            <span className="hs-status done">Done</span>
          </div>
          <div className="hs-row hs-row-new">
            <span className="hs-cell">Follow-ups from all-hands</span>
            <span className="hs-status queued">New task</span>
          </div>
        </div>
      </m.div>

      {/* Front layer: whiteboard + chat + cursors */}
      <m.div className="hs-layer" style={{ x: x3, y: y3 }}>
        <div className="hs-panel hs-wb hs-float" style={{ animationDelay: '-1.6s' }}>
          <div className="hs-mini-head">🖊️ Whiteboard</div>
          <svg viewBox="0 0 150 84" aria-hidden="true">
            <path className="hs-stroke" d="M14 62 C 34 18, 58 20, 74 44 S 116 70, 138 30" />
            <circle className="hs-stroke hs-stroke-2" cx="46" cy="34" r="13" />
          </svg>
          <span className="hs-sticky">idea!</span>
        </div>

        <div className="hs-panel hs-chat hs-float" style={{ animationDelay: '-4.4s' }}>
          <div className="hs-msg m1"><b>Jonas</b> can everyone see the deck?</div>
          <div className="hs-msg m2"><b>Aylin</b> crystal clear 👍</div>
          <div className="hs-typing" aria-hidden="true"><i /><i /><i /></div>
        </div>

        <div className="hs-cursor hs-cursor-a" aria-hidden="true">
          <svg width="13" height="14" viewBox="0 0 13 14"><path d="M1 1l4.2 11 1.7-4.6L11.6 6z" fill="#0a9a6e" stroke="#fff" strokeWidth="1" /></svg>
          <span>Jonas</span>
        </div>
        <div className="hs-cursor hs-cursor-b" aria-hidden="true">
          <svg width="13" height="14" viewBox="0 0 13 14"><path d="M1 1l4.2 11 1.7-4.6L11.6 6z" fill="#d0716d" stroke="#fff" strokeWidth="1" /></svg>
          <span>Aylin</span>
        </div>
      </m.div>
    </div>
  );
}
