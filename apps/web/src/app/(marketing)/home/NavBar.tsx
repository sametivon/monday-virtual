'use client';

import { useEffect, useState } from 'react';

const LINKS = [
  ['demo', 'Product'],
  ['features', 'Features'],
  ['how', 'How it works'],
  ['pricing', 'Pricing'],
  ['faq', 'FAQ'],
] as const;

/**
 * Floating glass navigation: transparent over the hero, condenses into a
 * blurred glass pill once you scroll, tracks the active section and slides an
 * indicator under it. Pure CSS transitions; one scroll + one IO listener.
 */
export function NavBar({ trialUrl }: { trialUrl: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 28);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-38% 0px -55% 0px' },
    );
    for (const [id] of LINKS) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return (
    <div className={`mv-nav ${scrolled ? 'scrolled' : ''}`}>
      <nav className="mv-nav-inner" aria-label="Primary">
        <a className="brand" href="#top" aria-label="MondayVirtual home">
          <span className="dot" aria-hidden="true" /> MondayVirtual
        </a>
        <div className="nav-links">
          {LINKS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={active === id ? 'active' : ''}>
              {label}
            </a>
          ))}
          <a className="btn btn-ghost btn-sm" href={trialUrl}>
            Open your office
          </a>
        </div>
      </nav>
    </div>
  );
}
