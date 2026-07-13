'use client';

import './landing.css';
import { GradientCanvas } from './GradientCanvas';
import { HeroShowcase } from './HeroShowcase';
import { NavBar } from './NavBar';
import { ProductDemo } from './ProductDemo';
import { Magnetic, MotionRoot, Reveal, RevealGroup, RevealItem, TiltCard } from './motion';
import { COMPARISON, FAQ, TESTIMONIALS, type Mark } from './content';

/**
 * MondayVirtual landing page (mondayvirtual.eu/home) — warm-paper editorial
 * identity elevated with product storytelling: an animated workspace in the
 * hero, a looping product demo, glass depth, and spring motion throughout.
 * Client component (motion needs hydration); SEO metadata + JSON-LD live in
 * the server layout; FAQ/comparison/testimonial copy in ./content.
 */

const APP_TRIAL_URL = 'https://auth.monday.com/oauth2/authorize';
const SOFT: [number, number, number, number] = [0xc9c2f0, 0xf6c7b8, 0xbbdcef, 0xc6e9d7];

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Arrow() {
  return (
    <svg className="mv-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MarkCell({ mark }: { mark: Mark }) {
  if (mark === true) return (<td className="mk yes"><span aria-hidden="true">✓</span><span className="sr-only">Yes</span></td>);
  if (mark === 'partial') return (<td className="mk part"><span aria-hidden="true">~</span><span className="sr-only">Partial</span></td>);
  return (<td className="mk no"><span aria-hidden="true">–</span><span className="sr-only">No</span></td>);
}

export default function LandingPage() {
  return (
    <MotionRoot>
      <div className="mv-landing">
        <a className="skip-link" href="#main">Skip to content</a>
        <NavBar trialUrl={APP_TRIAL_URL} />

        {/* ── 1 · Hero: the product, alive ─────────────────────────────── */}
        <header className="hero" id="top">
          <GradientCanvas className="grad-hero" palette={SOFT} base={0xe7dff5} />
          <div className="hero-scrim" aria-hidden="true" />
          <div className="wrap hero-body">
            <div className="hero-grid">
              <div className="hero-inner">
                <Reveal>
                  <p className="eyebrow">Virtual meetings &amp; office for monday.com</p>
                </Reveal>
                <Reveal delay={0.06}>
                  <h1 className="display">
                    Everyone&rsquo;s online.
                    <br />
                    Nobody&rsquo;s <em>together</em>.
                  </h1>
                </Reveal>
                <Reveal delay={0.12}>
                  <p className="lead">
                    MondayVirtual turns monday.com into a 3D office — walk over and talk, present to a
                    full auditorium, and keep your boards live on the walls. No new app, no new login.
                  </p>
                </Reveal>
                <Reveal delay={0.18}>
                  <div className="cta-row">
                    <Magnetic>
                      <a className="btn btn-primary" href={APP_TRIAL_URL}>
                        Open your office <Arrow />
                      </a>
                    </Magnetic>
                    <a className="btn btn-ghost" href="#demo">
                      Watch it work
                    </a>
                  </div>
                </Reveal>
                <Reveal delay={0.24}>
                  <ul className="trust" aria-label="At a glance">
                    <li><span className="tick" aria-hidden="true" /> Runs inside monday.com</li>
                    <li><span className="tick" aria-hidden="true" /> Nothing to install</li>
                    <li><span className="tick" aria-hidden="true" /> Proximity voice &amp; video</li>
                  </ul>
                </Reveal>
              </div>
              <Reveal delay={0.15} y={34} className="hero-showcase-slot">
                <HeroShowcase />
              </Reveal>
            </div>
          </div>
        </header>

        <main id="main">
          {/* ── 2 · The problem ─────────────────────────────────────────── */}
          <section className="band problem" id="problem" aria-labelledby="problem-h">
            <div className="wrap">
              <Reveal>
                <div className="kicker"><span className="rule" aria-hidden="true" /><span className="eyebrow">The remote gap</span></div>
                <h2 className="sec" id="problem-h">Chat isn&rsquo;t presence. A call isn&rsquo;t a room.</h2>
                <p className="sec-lead">
                  Remote and hybrid teams are reachable all day and in the same place never. Messages wait in
                  a channel; every conversation needs a link and a calendar slot. The unplanned moments that
                  build a team have nowhere to happen.
                </p>
              </Reveal>
              <RevealGroup className="contrast-grid">
                <RevealItem className="cell"><span className="tag">Today</span><h3>Pinging into the void</h3><p>&ldquo;You around?&rdquo; &rarr; wait. A quick question becomes a scheduled call. Nobody bumps into anyone.</p></RevealItem>
                <RevealItem className="cell"><span className="tag">Today</span><h3>Meetings, or nothing</h3><p>Every conversation needs a link, a time, and a reason. Spontaneity doesn&rsquo;t survive a scheduler.</p></RevealItem>
                <RevealItem className="cell here"><span className="tag">In MondayVirtual</span><h3>Walk over. Talk.</h3><p>Move your avatar next to someone and you&rsquo;re already talking — voice fades up as you get close.</p></RevealItem>
                <RevealItem className="cell here"><span className="tag">In MondayVirtual</span><h3>Gather the whole company</h3><p>Everyone lands in the same auditorium for the town hall — one stage, one screen, hundreds of seats.</p></RevealItem>
              </RevealGroup>
            </div>
          </section>

          {/* ── 3 · The solution, shown ────────────────────────────────── */}
          <section className="band demo" id="demo" aria-labelledby="demo-h">
            <div className="wrap">
              <Reveal>
                <div className="kicker"><span className="rule" aria-hidden="true" /><span className="eyebrow">See it work</span></div>
                <h2 className="sec" id="demo-h">One space. The whole meeting loop.</h2>
                <p className="sec-lead">Watch the core loop — or click through it. This is the product, not an illustration.</p>
              </Reveal>
              <Reveal delay={0.1} y={34}>
                <ProductDemo />
              </Reveal>
            </div>
          </section>

          {/* ── 4 · Benefits ───────────────────────────────────────────── */}
          <section className="band usecases" id="benefits" aria-labelledby="usecases-h">
            <div className="wrap">
              <Reveal>
                <div className="kicker"><span className="rule" aria-hidden="true" /><span className="eyebrow">What changes</span></div>
                <h2 className="sec" id="usecases-h">Made for remote &amp; hybrid teams on monday.com.</h2>
              </Reveal>
              <RevealGroup className="uc-grid">
                <RevealItem><TiltCard className="uc"><h3>All-hands &amp; town halls</h3><p>The whole company in one auditorium — screen share to every seat, attendance recorded to a board.</p></TiltCard></RevealItem>
                <RevealItem><TiltCard className="uc"><h3>Daily stand-ups</h3><p>Gather in front of the live board and run the update in minutes, not meetings.</p></TiltCard></RevealItem>
                <RevealItem><TiltCard className="uc"><h3>Onboarding &amp; culture</h3><p>Give new hires a place that feels like somewhere — walk over, meet the team, belong.</p></TiltCard></RevealItem>
                <RevealItem><TiltCard className="uc"><h3>Huddles that just happen</h3><p>Pull up to a table for a focused, full-volume conversation without booking a room.</p></TiltCard></RevealItem>
              </RevealGroup>
            </div>
          </section>

          {/* ── 5 · Features ───────────────────────────────────────────── */}
          <section className="band features" id="features" aria-labelledby="features-h">
            <div className="wrap">
              <Reveal>
                <div className="kicker"><span className="rule" aria-hidden="true" /><span className="eyebrow">What&rsquo;s inside</span></div>
                <h2 className="sec" id="features-h">A complete team collaboration platform — in a browser tab.</h2>
              </Reveal>
              <RevealGroup className="fgrid">
                <RevealItem><TiltCard className="feat">
                  <div className="ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" /><path d="M16 6.2a3 3 0 0 1 0 5.6M18.5 20a6 6 0 0 0-3-5.2" strokeLinecap="round" /></svg></div>
                  <h3>Proximity voice &amp; video</h3>
                  <p>Conversations start by moving, not scheduling. Get close, you hear each other; walk off, it fades.</p>
                </TiltCard></RevealItem>
                <RevealItem><TiltCard className="feat">
                  <div className="ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" strokeLinecap="round" /></svg></div>
                  <h3>Company auditorium</h3>
                  <p>All-hands, town halls and training on a real stage — with seats, hands, reactions and a live crowd.</p>
                </TiltCard></RevealItem>
                <RevealItem><TiltCard className="feat">
                  <div className="ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="15" width="7" height="6" rx="1.5" /></svg></div>
                  <h3>Boards on the walls</h3>
                  <p>Live monday.com data hangs in the space — status, KPIs and item tables update as your board does.</p>
                </TiltCard></RevealItem>
                <RevealItem><TiltCard className="feat">
                  <div className="ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M7 21h10M8 9l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                  <h3>Whiteboards &amp; huddles</h3>
                  <p>Sketch together on shared boards in the room, or huddle at a table at full volume.</p>
                </TiltCard></RevealItem>
                <RevealItem><TiltCard className="feat">
                  <div className="ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18.7l.9-5.4L4.2 8.7l5.4-.8z" strokeLinejoin="round" /></svg></div>
                  <h3>Your brand, your campus</h3>
                  <p>White-label end to end — your name, colors and logo on the room, the walls and the stage.</p>
                </TiltCard></RevealItem>
                <RevealItem><TiltCard className="feat">
                  <div className="ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 8h18M7 21h10" strokeLinecap="round" /></svg></div>
                  <h3>It&rsquo;s just a browser tab</h3>
                  <p>Runs inside monday.com. No downloads, no separate accounts — your team is already logged in.</p>
                </TiltCard></RevealItem>
              </RevealGroup>
            </div>
          </section>

          {/* ── 6 · Compare ────────────────────────────────────────────── */}
          <section className="band compare" id="compare" aria-labelledby="compare-h">
            <div className="wrap">
              <Reveal>
                <div className="kicker"><span className="rule" aria-hidden="true" /><span className="eyebrow">How it compares</span></div>
                <h2 className="sec" id="compare-h">Video calls schedule a meeting. This is a place.</h2>
              </Reveal>
              <Reveal delay={0.08}>
                <div className="table-scroll glass">
                  <table className="cmp">
                    <caption className="sr-only">Feature comparison: MondayVirtual vs video calls vs other virtual offices</caption>
                    <thead>
                      <tr>
                        <th scope="col">Capability</th>
                        {COMPARISON.columns.map((c, i) => (<th key={c} scope="col" className={i === 0 ? 'own' : ''}>{c}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {COMPARISON.rows.map((row) => (
                        <tr key={row.label}>
                          <th scope="row">{row.label}</th>
                          {row.marks.map((mk, i) => (<MarkCell key={i} mark={mk} />))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Reveal>
            </div>
          </section>

          {/* ── 7 · How it works ───────────────────────────────────────── */}
          <section className="band how" id="how" aria-labelledby="how-h">
            <div className="wrap">
              <Reveal>
                <div className="kicker"><span className="rule" aria-hidden="true" /><span className="eyebrow">Going live takes minutes</span></div>
                <h2 className="sec" id="how-h">From monday board to a full campus.</h2>
              </Reveal>
              <RevealGroup className="steps-wrap">
                <ol className="steps">
                  <RevealItem as="li" className="step"><h3>Add it to monday</h3><p>Install MondayVirtual from the Marketplace. It appears as a view — no admin project required.</p></RevealItem>
                  <RevealItem as="li" className="step"><h3>Everyone walks in</h3><p>Your team is already signed into monday, so they land in the lobby as themselves in one click.</p></RevealItem>
                  <RevealItem as="li" className="step"><h3>Meet, present, gather</h3><p>Bump into people, huddle at a table, or fill the auditorium for the next all-hands.</p></RevealItem>
                </ol>
              </RevealGroup>
            </div>
          </section>

          {/* ── 8 · monday.com integration ─────────────────────────────── */}
          <section className="band integration" id="integration" aria-labelledby="int-h">
            <div className="wrap">
              <Reveal>
                <div className="kicker"><span className="rule" aria-hidden="true" /><span className="eyebrow">Deep monday.com integration</span></div>
                <h2 className="sec" id="int-h">Your workspace, not another silo.</h2>
              </Reveal>
              <RevealGroup className="int-grid">
                <RevealItem><div className="int glass"><span className="int-ico" aria-hidden="true">🔐</span><h3>One login</h3><p>Opens inside monday.com with your existing account — nothing new to provision.</p></div></RevealItem>
                <RevealItem><div className="int glass"><span className="int-ico" aria-hidden="true">📊</span><h3>Boards, live in the room</h3><p>Pin any board to a wall; status and KPIs stay in sync with the source of truth.</p></div></RevealItem>
                <RevealItem><div className="int glass"><span className="int-ico" aria-hidden="true">📅</span><h3>Events flow back</h3><p>All-hands attendance and event registrations record straight into your workflows.</p></div></RevealItem>
              </RevealGroup>
            </div>
          </section>

          {/* ── 9 · Early-access voices ────────────────────────────────── */}
          <section className="band voices" id="voices" aria-labelledby="voices-h">
            <div className="wrap">
              <Reveal>
                <div className="kicker"><span className="rule" aria-hidden="true" /><span className="eyebrow">From the early-access program</span></div>
                <h2 className="sec" id="voices-h">Teams stopped scheduling calls.</h2>
              </Reveal>
              <RevealGroup className="t-grid">
                {TESTIMONIALS.map((t, i) => (
                  <RevealItem key={t.name}>
                    <figure className="t-card glass hs-float" style={{ animationDelay: `${-i * 2.4}s` }}>
                      <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
                      <figcaption>
                        <span className="t-avatar" style={{ background: t.accent }} aria-hidden="true">{t.name[0]}</span>
                        <span><b>{t.name}</b><br /><small>{t.role}</small></span>
                      </figcaption>
                    </figure>
                  </RevealItem>
                ))}
              </RevealGroup>
              <Reveal><p className="note center">Early-access quotes — want yours here? You&rsquo;ll be one of the first teams in.</p></Reveal>
            </div>
          </section>

          {/* ── 10 · Pricing ───────────────────────────────────────────── */}
          <section className="band pricing" id="pricing" aria-labelledby="pricing-h">
            <div className="wrap">
              <Reveal>
                <div className="kicker"><span className="rule" aria-hidden="true" /><span className="eyebrow">Simple per-seat pricing</span></div>
                <h2 className="sec" id="pricing-h">Priced like a tool, not a headset.</h2>
                <p className="sec-lead">Pay for the people who show up. No hardware, no per-minute meeting fees — just a seat a month.</p>
              </Reveal>
              <RevealGroup className="tiers">
                <RevealItem><TiltCard className="tier">
                  <h3 className="plan">Team</h3>
                  <div className="price">&euro;8<small> / seat &middot; mo</small></div>
                  <p className="per">For small teams finding their space.</p>
                  <ul>
                    <li><Tick /> Lobby + proximity voice &amp; video</li>
                    <li><Tick /> Whiteboards &amp; huddle tables</li>
                    <li><Tick /> Boards on the walls</li>
                  </ul>
                  <a className="btn btn-ghost" href={APP_TRIAL_URL}>Start with Team</a>
                </TiltCard></RevealItem>
                <RevealItem><TiltCard className="tier feat-tier">
                  <span className="badge">Most teams start here</span>
                  <h3 className="plan">Company</h3>
                  <div className="price">&euro;14<small> / seat &middot; mo</small></div>
                  <p className="per">The full campus, auditorium included.</p>
                  <ul>
                    <li><Tick /> Everything in Team</li>
                    <li><Tick /> Auditorium, events &amp; attendance</li>
                    <li><Tick /> White-label branding &amp; analytics</li>
                  </ul>
                  <Magnetic className="btn-stretch">
                    <a className="btn btn-accent" href={APP_TRIAL_URL}>Open your campus <Arrow /></a>
                  </Magnetic>
                </TiltCard></RevealItem>
                <RevealItem><TiltCard className="tier">
                  <h3 className="plan">Enterprise</h3>
                  <div className="price">Let&rsquo;s talk</div>
                  <p className="per">For companies rolling it out org-wide.</p>
                  <ul>
                    <li><Tick /> Custom spaces &amp; capacity</li>
                    <li><Tick /> SSO, roles &amp; GDPR tooling</li>
                    <li><Tick /> Priority support &amp; onboarding</li>
                  </ul>
                  <a className="btn btn-ghost" href="mailto:sam@skortmens.com">Talk to us</a>
                </TiltCard></RevealItem>
              </RevealGroup>
              <Reveal><p className="note center">Billed monthly · cancel any time · your data stays in monday.com</p></Reveal>
            </div>
          </section>

          {/* ── 11 · FAQ ───────────────────────────────────────────────── */}
          <section className="band faq" id="faq" aria-labelledby="faq-h">
            <div className="wrap">
              <Reveal>
                <div className="kicker"><span className="rule" aria-hidden="true" /><span className="eyebrow">Questions, answered</span></div>
                <h2 className="sec" id="faq-h">Frequently asked questions.</h2>
              </Reveal>
              <Reveal delay={0.06}>
                <div className="faq-list">
                  {FAQ.map((f, i) => (
                    <details key={f.q} className="faq-item" open={i === 0}>
                      <summary><h3>{f.q}</h3></summary>
                      <p>{f.a}</p>
                    </details>
                  ))}
                </div>
              </Reveal>
            </div>
          </section>
        </main>

        {/* ── 12 · Final CTA + footer share one gradient ending ─────────── */}
        <section className="closing" aria-labelledby="closing-h">
          <GradientCanvas className="grad-closing" palette={SOFT} base={0xf6f0fa} />
          <div className="veil" aria-hidden="true" />
          <div className="wrap closing-inner">
            <Reveal>
              <p className="eyebrow">Your team is one click from together</p>
              <h2 id="closing-h">Give everyone a place to actually show up.</h2>
              <p className="closing-sub">Open your office inside monday.com and watch the team gather — no installs, no new logins, no scheduling.</p>
              <div className="cta-row cta-center">
                <Magnetic>
                  <a className="btn btn-primary btn-lg" href={APP_TRIAL_URL}>Open your office <Arrow /></a>
                </Magnetic>
                <a className="btn btn-ghost" href="#pricing">See pricing</a>
              </div>
            </Reveal>
          </div>

          <footer className="foot-glass">
            <div className="wrap">
              <div className="foot">
                <a className="brand" href="#top" aria-label="MondayVirtual home">
                  <span className="dot" aria-hidden="true" /> MondayVirtual
                </a>
                <nav className="foot-links" aria-label="Footer">
                  <a href="#demo">Product</a>
                  <a href="#features">Features</a>
                  <a href="#pricing">Pricing</a>
                  <a href="#faq">FAQ</a>
                  <a href={APP_TRIAL_URL}>Open the app</a>
                </nav>
                <p className="foot-note">
                  MondayVirtual — virtual meetings and a 3D team office for monday.com · mondayvirtual.eu ·
                  Runs in the browser, no downloads. Not affiliated with monday.com Ltd.
                </p>
              </div>
            </div>
          </footer>
        </section>
      </div>
    </MotionRoot>
  );
}
