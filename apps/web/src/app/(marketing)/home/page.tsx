import './landing.css';
import { GradientCanvas } from './GradientCanvas';

/**
 * MondayVirtual landing page (mondayvirtual.eu) — warm-paper editorial treatment
 * with a soft flowing three.js gradient hero. Static server component; the only
 * client JS is the ambient gradient canvas. SEO/JSON-LD live in the layout.
 */

// Monday install/trial entry — placeholder; wire to the Marketplace listing.
const APP_TRIAL_URL = 'https://auth.monday.com/oauth2/authorize';
const SOFT: [number, number, number, number] = [0xc9c2f0, 0xf6c7b8, 0xbbdcef, 0xc6e9d7];

/** Stylized cross-section of the amphitheater: a lit stage screen + a presenter
 *  + tiered curved rows of seats — a recognizable picture of the product. */
function AuditoriumArt() {
  const cx = 300;
  const rows = [
    { y: 250, rx: 205, ry: 40, n: 13, w: 15, h: 12, o: 0.95 },
    { y: 296, rx: 248, ry: 46, n: 15, w: 17, h: 13, o: 0.86 },
    { y: 348, rx: 292, ry: 52, n: 17, w: 19, h: 15, o: 0.76 },
    { y: 406, rx: 338, ry: 58, n: 19, w: 21, h: 16, o: 0.66 },
  ];
  const seats: React.ReactNode[] = [];
  rows.forEach((row, r) => {
    for (let i = 0; i < row.n; i++) {
      const a = -1.15 + (2.3 * i) / (row.n - 1);
      const x = cx + Math.sin(a) * row.rx;
      const y = row.y + (1 - Math.cos(a)) * row.ry;
      seats.push(
        <rect
          key={`${r}-${i}`}
          x={x - row.w / 2}
          y={y - row.h / 2}
          width={row.w}
          height={row.h}
          rx={row.w * 0.28}
          fill="#7a2f42"
          opacity={row.o}
        />,
      );
    }
  });
  return (
    <svg
      viewBox="0 0 600 460"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <defs>
        <radialGradient id="mv-glow" cx="50%" cy="26%" r="72%">
          <stop offset="0" stopColor="#3a2e6b" />
          <stop offset="1" stopColor="#16121f" />
        </radialGradient>
        <linearGradient id="mv-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b7bf0" />
          <stop offset="1" stopColor="#5a49c8" />
        </linearGradient>
      </defs>
      <rect width="600" height="460" fill="url(#mv-glow)" />
      <rect x="182" y="32" width="236" height="128" rx="12" fill="url(#mv-screen)" />
      <rect x="182" y="32" width="236" height="128" rx="12" fill="none" stroke="#b7acf2" strokeOpacity="0.45" />
      <rect x="206" y="150" width="46" height="7" rx="3.5" fill="#c9a23f" opacity="0.85" />
      <ellipse cx="300" cy="206" rx="128" ry="24" fill="#221b31" />
      <rect x="188" y="198" width="224" height="10" rx="5" fill="#c9a23f" opacity="0.45" />
      <g transform="translate(300 190)">
        <rect x="-7" y="-6" width="14" height="20" rx="6" fill="#b7acf2" />
        <circle cx="0" cy="-12" r="7" fill="#dcd6f6" />
      </g>
      {seats}
    </svg>
  );
}

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="mv-landing">
      <header className="hero">
        <GradientCanvas className="grad-hero" palette={SOFT} base={0xf3eefb} />
        <div className="hero-scrim" aria-hidden="true" />

        <div className="wrap">
          <nav>
            <a className="brand" href="#top">
              <span className="dot" aria-hidden="true" /> MondayVirtual
            </a>
            <div className="nav-links">
              <a href="#space">The space</a>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a className="btn btn-ghost" href={APP_TRIAL_URL}>
                Open your office
              </a>
            </div>
          </nav>
        </div>

        <div className="wrap hero-body" id="top">
          <div className="hero-inner">
            <p className="eyebrow">A virtual campus for teams on monday.com</p>
            <h1 className="display">
              Everyone&rsquo;s online.
              <br />
              Nobody&rsquo;s <em>together</em>.
            </h1>
            <p className="lead">
              MondayVirtual is a 3D office that lives inside monday.com. Walk over to a teammate and just
              talk. Fill the auditorium for the all-hands. See your boards on the walls &mdash; no new app,
              no new login.
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href={APP_TRIAL_URL}>
                Open your office
              </a>
              <a className="btn btn-ghost" href="#space">
                See how it feels
              </a>
            </div>
            <div className="trust">
              <span>
                <span className="tick" aria-hidden="true" /> Runs inside monday.com
              </span>
              <span>
                <span className="tick" aria-hidden="true" /> Nothing to install
              </span>
              <span>
                <span className="tick" aria-hidden="true" /> Proximity voice &amp; video
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="band problem">
        <div className="wrap">
          <div className="kicker">
            <span className="rule" aria-hidden="true" />
            <span className="eyebrow">The remote gap</span>
          </div>
          <h2 className="sec">Chat isn&rsquo;t presence. A call isn&rsquo;t a room.</h2>
          <p className="sec-lead">
            Your team is reachable all day and in the same place never. Messages wait in a channel. Meetings
            are scheduled interruptions. The easy, unplanned moments &mdash; the ones that build a team
            &mdash; have nowhere to happen.
          </p>

          <div className="contrast-grid">
            <div className="cell">
              <span className="tag">Today</span>
              <h3>Pinging into the void</h3>
              <p>&ldquo;You around?&rdquo; &rarr; wait. A quick question becomes a calendar invite. Nobody bumps into anyone.</p>
            </div>
            <div className="cell">
              <span className="tag">Today</span>
              <h3>Meetings, or nothing</h3>
              <p>Every conversation needs a link, a time, and a reason. Spontaneity doesn&rsquo;t survive a scheduler.</p>
            </div>
            <div className="cell here">
              <span className="tag">In MondayVirtual</span>
              <h3>Walk over. Talk.</h3>
              <p>Move your avatar next to someone and you&rsquo;re already talking &mdash; voice fades up as you get close, like real life.</p>
            </div>
            <div className="cell here">
              <span className="tag">In MondayVirtual</span>
              <h3>Gather the whole company</h3>
              <p>Everyone lands in the same auditorium for the town hall &mdash; one stage, one screen, hundreds of seats.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="band space" id="space">
        <div className="wrap">
          <div className="kicker">
            <span className="rule" aria-hidden="true" />
            <span className="eyebrow">The auditorium</span>
          </div>
          <h2 className="sec">A stage big enough for the whole team.</h2>
          <p className="sec-lead">
            Host all-hands, trainings and launches in a tiered amphitheater. Share your screen and it fills
            the room &mdash; click it and read it full-screen from any seat.
          </p>

          <div className="stage-card">
            <div className="stage-visual">
              <AuditoriumArt />
              <span className="stage-tag">&#9679; Live on stage &mdash; proximity audio, seat &amp; present</span>
            </div>
            <div className="stage-copy">
              <h3>Present to a room, not a grid of faces.</h3>
              <p>
                Take the stage, share your deck or screen, and the whole audience sees it together &mdash;
                with a &ldquo;Seat me&rdquo; button, raised hands, reactions and a chat running alongside.
              </p>
              <ul className="mini-list">
                <li>
                  <Tick /> Screen-share that fills the wall &mdash; one click to full-screen
                </li>
                <li>
                  <Tick /> Raked seating so every row has a clear view
                </li>
                <li>
                  <Tick /> Live attendance, recorded to your monday board
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="band features" id="features">
        <div className="wrap">
          <div className="kicker">
            <span className="rule" aria-hidden="true" />
            <span className="eyebrow">What&rsquo;s inside</span>
          </div>
          <h2 className="sec">Everything a real office does &mdash; in a browser tab.</h2>

          <div className="fgrid">
            <div className="feat">
              <div className="ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="8" r="3.2" />
                  <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
                  <path d="M16 6.2a3 3 0 0 1 0 5.6M18.5 20a6 6 0 0 0-3-5.2" strokeLinecap="round" />
                </svg>
              </div>
              <h3>Proximity voice &amp; video</h3>
              <p>Conversations start by moving, not scheduling. Get close, you hear each other; walk off, it fades.</p>
            </div>
            <div className="feat">
              <div className="ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="12" rx="2" />
                  <path d="M8 20h8M12 16v4" strokeLinecap="round" />
                </svg>
              </div>
              <h3>The auditorium</h3>
              <p>All-hands, town halls and training on a real stage &mdash; screen-share, seats, hands and reactions for a live crowd.</p>
            </div>
            <div className="feat">
              <div className="ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="9" rx="1.5" />
                  <rect x="14" y="3" width="7" height="5" rx="1.5" />
                  <rect x="14" y="11" width="7" height="10" rx="1.5" />
                  <rect x="3" y="15" width="7" height="6" rx="1.5" />
                </svg>
              </div>
              <h3>Your boards, on the walls</h3>
              <p>Live monday.com data hangs in the space &mdash; status, KPIs and item tables update as your board does.</p>
            </div>
            <div className="feat">
              <div className="ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="13" rx="2" />
                  <path d="M7 21h10M8 9l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3>Whiteboards &amp; huddles</h3>
              <p>Pull up to a table for a full-volume huddle, or sketch together on a shared whiteboard in the room.</p>
            </div>
            <div className="feat">
              <div className="ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18.7l.9-5.4L4.2 8.7l5.4-.8z" strokeLinejoin="round" />
                </svg>
              </div>
              <h3>Your brand, your campus</h3>
              <p>White-label it end to end &mdash; your name, colors and logo on the room, the walls and the stage.</p>
            </div>
            <div className="feat">
              <div className="ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="14" rx="2" />
                  <path d="M3 8h18M7 21h10" strokeLinecap="round" />
                </svg>
              </div>
              <h3>It&rsquo;s just a browser tab</h3>
              <p>Lives inside monday.com. No downloads, no separate accounts &mdash; your team is already logged in.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="band how" id="how">
        <div className="wrap">
          <div className="kicker">
            <span className="rule" aria-hidden="true" />
            <span className="eyebrow">Going live takes minutes</span>
          </div>
          <h2 className="sec">From monday board to a full campus.</h2>
          <div className="steps">
            <div className="step">
              <h3>Add it to monday</h3>
              <p>Install MondayVirtual from the Marketplace. It appears as a view &mdash; no admin project required.</p>
            </div>
            <div className="step">
              <h3>Everyone walks in</h3>
              <p>Your team is already signed into monday, so they land in the lobby as themselves in one click.</p>
            </div>
            <div className="step">
              <h3>Meet, present, gather</h3>
              <p>Bump into people, huddle at a table, or fill the auditorium for the next all-hands.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="band pricing" id="pricing">
        <div className="wrap">
          <div className="kicker">
            <span className="rule" aria-hidden="true" />
            <span className="eyebrow">Simple per-seat pricing</span>
          </div>
          <h2 className="sec">Priced like a tool, not a headset.</h2>
          <p className="sec-lead">
            Pay for the people who show up. No hardware, no per-minute meeting fees &mdash; just a seat a
            month.
          </p>

          <div className="tiers">
            <div className="tier">
              <div className="plan">Team</div>
              <div className="price">
                &euro;8<small> / seat &middot; mo</small>
              </div>
              <div className="per">For small teams finding their space.</div>
              <ul>
                <li>
                  <Tick /> Lobby + proximity voice &amp; video
                </li>
                <li>
                  <Tick /> Whiteboards &amp; huddle tables
                </li>
                <li>
                  <Tick /> Boards on the walls
                </li>
              </ul>
              <a className="btn btn-ghost" href={APP_TRIAL_URL}>
                Start with Team
              </a>
            </div>

            <div className="tier feat-tier">
              <span className="badge">Most teams start here</span>
              <div className="plan">Company</div>
              <div className="price">
                &euro;14<small> / seat &middot; mo</small>
              </div>
              <div className="per">The full campus, auditorium included.</div>
              <ul>
                <li>
                  <Tick /> Everything in Team
                </li>
                <li>
                  <Tick /> Auditorium, events &amp; attendance
                </li>
                <li>
                  <Tick /> White-label branding &amp; analytics
                </li>
              </ul>
              <a className="btn btn-accent" href={APP_TRIAL_URL}>
                Open your campus
              </a>
            </div>

            <div className="tier">
              <div className="plan">Enterprise</div>
              <div className="price">Let&rsquo;s talk</div>
              <div className="per">For companies rolling it out org-wide.</div>
              <ul>
                <li>
                  <Tick /> Custom spaces &amp; capacity
                </li>
                <li>
                  <Tick /> SSO, roles &amp; GDPR tooling
                </li>
                <li>
                  <Tick /> Priority support &amp; onboarding
                </li>
              </ul>
              <a className="btn btn-ghost" href="mailto:sam@skortmens.com">
                Talk to us
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="closing">
        <GradientCanvas className="grad-closing" palette={SOFT} base={0xf6f0fa} />
        <div className="veil" aria-hidden="true" />
        <div className="wrap">
          <p className="eyebrow">Your team is one click from together</p>
          <h2>Give everyone a place to actually show up.</h2>
          <p>Open your office inside monday.com and watch the team gather &mdash; no installs, no new logins, no scheduling.</p>
          <div className="cta-row">
            <a className="btn btn-primary" href={APP_TRIAL_URL}>
              Open your office
            </a>
            <a className="btn btn-ghost" href="#pricing">
              See pricing
            </a>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="foot">
            <a className="brand" href="#top">
              <span className="dot" aria-hidden="true" /> MondayVirtual
            </a>
            <div className="foot-links">
              <a href="#space">The space</a>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href={APP_TRIAL_URL}>Open the app</a>
            </div>
            <div className="foot-note">
              MondayVirtual &mdash; a 3D virtual campus for teams on monday.com &middot; mondayvirtual.eu
              &middot; Built for the browser, no downloads. Not affiliated with monday.com Ltd.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
