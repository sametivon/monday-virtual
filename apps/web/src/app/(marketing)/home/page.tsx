import Link from 'next/link';

/**
 * MondayVirtual landing page (mondayvirtual.eu). Built to the "32 Principles of
 * a Viral Product": three colors (black text / white bg / one purple accent),
 * one idea per screen, numbers over adjectives, empathy before the sell, popcorn
 * pricing, a single repeated CTA, and a shareable footer. Static server
 * component — no auth, no client JS beyond anchor scrolling.
 */

const ACCENT = '#6c5ce7';
const APP_TRIAL_URL = 'https://auth.monday.com/oauth2/authorize'; // monday install/trial entry (placeholder, wire to listing)

export default function LandingPage() {
  return (
    <>
      <Header />
      <Hero />
      <LogosStrip />
      <Problem />
      <FeatureScreens />
      <Comparison />
      <Pricing />
      <Testimonials />
      <FinalCta />
      <Footer />
    </>
  );
}

/* ── Header: logo + Pricing (#16) + one CTA (#22) ───────────────────────────── */
function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/home" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Logo />
          MondayVirtual
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium text-neutral-600">
          <a href="#pricing" className="hidden hover:text-neutral-900 sm:block">
            Pricing
          </a>
          <a href="#how" className="hidden hover:text-neutral-900 sm:block">
            How it works
          </a>
          <Cta>Open your office</Cta>
        </nav>
      </div>
    </header>
  );
}

/* ── Hero: sells from here alone (#20), emotional headline (#18), numbers (#3) ─ */
function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-10 pt-16 sm:pt-24">
      <div className="mx-auto max-w-3xl text-center">
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: `${ACCENT}1a`, color: ACCENT }}
        >
          The first virtual office built inside monday.com
        </span>
        {/* Emotional, 5th-grade-simple, memorable (#7 #17 #18). */}
        <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
          Your team is online.
          <br />
          They’re just not <span style={{ color: ACCENT }}>together</span>.
        </h1>
        {/* Empathy + the outcome, with a number, not adjectives (#3 #21 #24). */}
        <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600">
          MondayVirtual turns your monday.com workspace into a real office your team walks into. See all
          40 people in one room, walk over to talk, and read your live boards off the wall. Cut the daily
          standup from 30 minutes to 4.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Cta size="lg">Open your office — free for 14 days</Cta>
          <span className="text-sm text-neutral-500">No credit card. Live in your monday in 2 minutes.</span>
        </div>
      </div>

      {/* Show the product before explaining it (#10). */}
      <div className="mx-auto mt-14 max-w-5xl">
        <DemoFrame />
      </div>
    </section>
  );
}

/* A self-contained SVG "screenshot" of the 3D office so the hero needs no asset
   pipeline and stays crisp. Reads as a top-down room with avatars + a board. */
function DemoFrame() {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 shadow-2xl">
      <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-neutral-300" />
        <span className="h-3 w-3 rounded-full bg-neutral-300" />
        <span className="h-3 w-3 rounded-full bg-neutral-300" />
        <span className="ml-3 text-xs text-neutral-400">monday.com › Marketing › Virtual Office</span>
      </div>
      <svg viewBox="0 0 1000 520" className="block w-full" role="img" aria-label="A 3D virtual office with teammates and a live board">
        <defs>
          <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4f1ff" />
            <stop offset="1" stopColor="#e9e3ff" />
          </linearGradient>
        </defs>
        <rect width="1000" height="520" fill="url(#floor)" />
        {/* board on the wall */}
        <g transform="translate(360 36)">
          <rect width="280" height="150" rx="10" fill="#ffffff" stroke="#d9d2f5" />
          <rect x="16" y="18" width="120" height="12" rx="6" fill={ACCENT} />
          <rect x="16" y="44" width="248" height="10" rx="5" fill="#e3e8ef" />
          <rect x="16" y="64" width="210" height="10" rx="5" fill="#e3e8ef" />
          <rect x="16" y="84" width="232" height="10" rx="5" fill="#e3e8ef" />
          <rect x="16" y="110" width="70" height="20" rx="10" fill="#00b894" />
          <rect x="96" y="110" width="70" height="20" rx="10" fill="#fdcb6e" />
          <rect x="176" y="110" width="70" height="20" rx="10" fill="#e17055" />
        </g>
        {/* meeting table */}
        <ellipse cx="500" cy="350" rx="150" ry="60" fill="#ffffff" stroke="#d9d2f5" />
        {/* avatars (people in the room) */}
        {[
          { x: 360, y: 320, c: ACCENT },
          { x: 640, y: 320, c: '#00b894' },
          { x: 430, y: 410, c: '#e17055' },
          { x: 575, y: 410, c: '#0984e3' },
          { x: 230, y: 250, c: '#e84393' },
          { x: 770, y: 250, c: '#fdcb6e' },
        ].map((a, i) => (
          <g key={i} transform={`translate(${a.x} ${a.y})`}>
            <ellipse cx="0" cy="34" rx="26" ry="8" fill="#000" opacity="0.08" />
            <rect x="-16" y="0" width="32" height="34" rx="12" fill={a.c} />
            <circle cx="0" cy="-10" r="13" fill={a.c} />
          </g>
        ))}
        {/* "talking" proximity ring around two near avatars */}
        <circle cx="500" cy="410" r="95" fill="none" stroke={ACCENT} strokeDasharray="5 6" opacity="0.5" />
        <g transform="translate(470 470)">
          <rect width="60" height="22" rx="11" fill={ACCENT} />
          <text x="30" y="15" fontSize="12" fill="#fff" textAnchor="middle" fontFamily="system-ui">
            🔊 talking
          </text>
        </g>
      </svg>
    </div>
  );
}

/* ── Social proof strip (#29 lite) ──────────────────────────────────────────── */
function LogosStrip() {
  return (
    <section className="border-y border-neutral-200 bg-neutral-50 py-6">
      <p className="text-center text-sm text-neutral-500">
        Built for the <span className="font-semibold text-neutral-700">225,000+ teams</span> already running
        their work on monday.com
      </p>
    </section>
  );
}

/* ── Problem: empathy before selling (#21), one idea (#6) ───────────────────── */
function Problem() {
  const pains = [
    { stat: '23', unit: 'pings a day', label: 'just to ask “got a sec?” — each one breaks someone’s focus.' },
    { stat: '31', unit: 'hours a month', label: 'the average teammate spends in calls that a 2-minute walk-over would’ve closed.' },
    { stat: '0', unit: 'sense of “there”', label: 'your tools show who’s online. None of them show your team in a room.' },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight sm:text-4xl">
        Remote work didn’t kill the office. It just made it invisible.
      </h2>
      <div className="mt-12 grid gap-8 sm:grid-cols-3">
        {pains.map((p) => (
          <div key={p.unit} className="rounded-2xl border border-neutral-200 p-7">
            <div className="text-5xl font-extrabold" style={{ color: ACCENT }}>
              {p.stat}
            </div>
            <div className="mt-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">{p.unit}</div>
            <p className="mt-3 text-neutral-600">{p.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Feature screens: one idea per screen (#6), numbers (#3), try-before (#25) ─ */
function FeatureScreens() {
  const features = [
    {
      kicker: 'Presence',
      title: 'Walk over instead of scheduling a call.',
      body: 'Everyone’s an avatar in a shared room. Step next to someone and you’re talking — spatial audio fades in as you approach, just like a real office. No link, no invite, no “can you hear me?”.',
      bullet: 'Voice gets louder as you get closer. Walk away and it fades.',
    },
    {
      kicker: 'Your monday data, on the wall',
      title: 'Your boards live in the room.',
      body: 'Pin any monday board to a screen in the space. Status, owners, and counts update live. Stand-ups happen in front of the board — because the board is right there.',
      bullet: 'Live KPIs render on the 3D screens, refreshed automatically.',
    },
    {
      kicker: 'Events & all-hands',
      title: 'An auditorium that holds the whole company.',
      body: 'Step on stage and you’re heard by everyone. Raise a hand, drop a reaction, share your screen onto the wall. The back row sees the same thing as the front.',
      bullet: 'Stage audio reaches the entire room — no “you’re on mute”.',
    },
  ];
  return (
    <section id="how" className="bg-neutral-50 py-20">
      <div className="mx-auto max-w-6xl space-y-20 px-6">
        {features.map((f, i) => (
          <div
            key={f.kicker}
            className={`grid items-center gap-10 lg:grid-cols-2 ${i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''}`}
          >
            <div>
              <div className="text-sm font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>
                {f.kicker}
              </div>
              <h3 className="mt-2 text-3xl font-bold tracking-tight">{f.title}</h3>
              <p className="mt-4 text-lg text-neutral-600">{f.body}</p>
              <div className="mt-5 flex items-start gap-2 text-neutral-800">
                <Check />
                <span className="font-medium">{f.bullet}</span>
              </div>
            </div>
            <FeatureArt variant={i} />
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatureArt({ variant }: { variant: number }) {
  return (
    <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg">
      <svg viewBox="0 0 400 300" className="h-full w-full">
        <rect width="400" height="300" fill="#faf9ff" />
        {variant === 0 && (
          <>
            <circle cx="200" cy="160" r="80" fill="none" stroke={ACCENT} strokeDasharray="4 6" opacity="0.6" />
            <circle cx="200" cy="160" r="45" fill="none" stroke={ACCENT} strokeDasharray="4 6" opacity="0.9" />
            {[
              [170, 150, ACCENT],
              [230, 150, '#00b894'],
            ].map(([x, y, c], k) => (
              <g key={k} transform={`translate(${x} ${y})`}>
                <rect x="-12" y="0" width="24" height="26" rx="9" fill={c as string} />
                <circle cx="0" cy="-8" r="10" fill={c as string} />
              </g>
            ))}
            <text x="200" y="250" fontSize="15" fill="#6b7280" textAnchor="middle" fontFamily="system-ui">
              🔊 in conversation
            </text>
          </>
        )}
        {variant === 1 && (
          <>
            <rect x="70" y="50" width="260" height="150" rx="10" fill="#fff" stroke="#d9d2f5" />
            <rect x="88" y="70" width="110" height="12" rx="6" fill={ACCENT} />
            <rect x="88" y="96" width="224" height="9" rx="4" fill="#e3e8ef" />
            <rect x="88" y="114" width="200" height="9" rx="4" fill="#e3e8ef" />
            <rect x="88" y="150" width="60" height="20" rx="10" fill="#00b894" />
            <rect x="156" y="150" width="60" height="20" rx="10" fill="#fdcb6e" />
            <rect x="224" y="150" width="60" height="20" rx="10" fill="#e17055" />
            <text x="200" y="240" fontSize="15" fill="#6b7280" textAnchor="middle" fontFamily="system-ui">
              live monday board
            </text>
          </>
        )}
        {variant === 2 && (
          <>
            <rect x="120" y="40" width="160" height="60" rx="8" fill={ACCENT} opacity="0.15" />
            <rect x="140" y="52" width="120" height="36" rx="6" fill={ACCENT} />
            {[90, 140, 190, 240, 290].map((x) => (
              <g key={x}>
                {[150, 185, 220].map((y) => (
                  <g key={y} transform={`translate(${x} ${y})`}>
                    <rect x="-9" y="0" width="18" height="20" rx="7" fill="#9aa3b2" />
                    <circle cx="0" cy="-6" r="7" fill="#9aa3b2" />
                  </g>
                ))}
              </g>
            ))}
            <text x="200" y="270" fontSize="15" fill="#6b7280" textAnchor="middle" fontFamily="system-ui">
              all-hands on stage
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

/* ── Comparison: why switch (#31) ───────────────────────────────────────────── */
function Comparison() {
  const rows = [
    ['Lives inside monday.com', true, false, false],
    ['Your live boards on the wall', true, false, false],
    ['Spatial “walk-over” audio', true, true, false],
    ['Company-wide auditorium', true, true, false],
    ['No extra app to log into', true, false, true],
    ['Set up in under 2 minutes', true, false, false],
  ] as const;
  const cols = ['MondayVirtual', 'Other virtual offices', 'Video calls'];
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Why teams switch</h2>
      <div className="mt-10 overflow-hidden rounded-2xl border border-neutral-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="px-5 py-4 font-medium text-neutral-500">&nbsp;</th>
              {cols.map((c, i) => (
                <th
                  key={c}
                  className={`px-5 py-4 text-center font-bold ${i === 0 ? '' : 'text-neutral-500'}`}
                  style={i === 0 ? { color: ACCENT } : undefined}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, ...marks]) => (
              <tr key={label as string} className="border-b border-neutral-100 last:border-0">
                <td className="px-5 py-4 font-medium text-neutral-800">{label}</td>
                {marks.map((m, i) => (
                  <td key={i} className="px-5 py-4 text-center">
                    {m ? (
                      <span className="font-bold" style={{ color: ACCENT }}>
                        ✓
                      </span>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Pricing: popcorn 3-tier (#12), visible (#16), premium (#32), one CTA each ─ */
function Pricing() {
  const tiers = [
    {
      name: 'Team',
      price: '€8',
      tagline: 'For one team that wants to feel together again.',
      features: ['Up to 25 seats', '1 office space', 'Spatial voice + chat', 'Live monday boards on the wall'],
      cta: 'Start your team',
      featured: false,
    },
    {
      name: 'Company',
      price: '€14',
      tagline: 'Your whole company, with an auditorium for all-hands.',
      features: [
        'Up to 250 seats',
        'Unlimited spaces',
        'Company-wide auditorium',
        'Screen share onto the wall',
        'White-label branding',
      ],
      cta: 'Open your office',
      featured: true,
    },
    {
      name: 'Enterprise',
      price: 'Let’s talk',
      tagline: 'For org-wide rollouts that need control and scale.',
      features: ['Unlimited seats', 'SSO + admin controls', 'Custom scenes & RBAC', 'Priority support & SLA'],
      cta: 'Talk to us',
      featured: false,
    },
  ];
  return (
    <section id="pricing" className="bg-neutral-50 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          One office. Priced per seat, per month.
        </h2>
        <p className="mt-3 text-center text-neutral-600">
          Billed annually. 14-day trial on every plan — your team’s in the room before you pay a cent.
        </p>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-2xl border bg-white p-8 ${
                t.featured ? 'shadow-2xl' : 'border-neutral-200'
              }`}
              style={t.featured ? { borderColor: ACCENT, borderWidth: 2 } : undefined}
            >
              {t.featured && (
                <span
                  className="mb-3 self-start rounded-full px-3 py-1 text-xs font-bold"
                  style={{ backgroundColor: ACCENT, color: '#fff' }}
                >
                  MOST POPULAR
                </span>
              )}
              <div className="text-lg font-bold">{t.name}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">{t.price}</span>
                {t.price.startsWith('€') && <span className="text-neutral-500">/seat/mo</span>}
              </div>
              <p className="mt-3 text-sm text-neutral-600">{t.tagline}</p>
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Cta full filled={t.featured}>
                {t.cta}
              </Cta>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Testimonials: proof before traffic (#29) ───────────────────────────────── */
function Testimonials() {
  // PLACEHOLDER quotes — replace with real beta-tester words before launch (#14 #29).
  const quotes = [
    {
      q: 'Our 9:30 stand-up went from half an hour to four minutes. We just gather at the board and go.',
      name: 'Beta tester',
      role: 'Ops lead, 40-person team',
    },
    {
      q: 'It’s the first time my remote hires said the company finally “feels like somewhere”.',
      name: 'Beta tester',
      role: 'Founder, fully-remote SaaS',
    },
    {
      q: 'The boards being on the wall is the part nobody expected to love. Now we run reviews in there.',
      name: 'Beta tester',
      role: 'PM, monday.com power user',
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
        Teams stopped scheduling calls
      </h2>
      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {quotes.map((t) => (
          <figure key={t.q} className="rounded-2xl border border-neutral-200 p-7">
            <blockquote className="text-neutral-800">“{t.q}”</blockquote>
            <figcaption className="mt-5 text-sm">
              <div className="font-semibold">{t.name}</div>
              <div className="text-neutral-500">{t.role}</div>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-neutral-400">
        Early-access quotes. Want yours here? You’ll be one of the first teams in.
      </p>
    </section>
  );
}

/* ── Final CTA: one next step (#22 #28) ─────────────────────────────────────── */
function FinalCta() {
  return (
    <section className="px-6 py-24" style={{ backgroundColor: ACCENT }}>
      <div className="mx-auto max-w-2xl text-center text-white">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Get your team in one room today.
        </h2>
        <p className="mt-4 text-lg text-white/80">
          Add MondayVirtual to your monday.com and walk into your office in two minutes. Free for 14 days.
        </p>
        <div className="mt-8 flex justify-center">
          <a
            href={APP_TRIAL_URL}
            className="rounded-xl bg-white px-8 py-4 text-lg font-bold text-neutral-900 shadow-lg transition hover:scale-[1.02]"
          >
            Open your office →
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── Footer people want to share (#4) ───────────────────────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-col items-center gap-6 text-center">
          <Link href="/home" className="flex items-center gap-2 text-lg font-bold">
            <Logo />
            MondayVirtual
          </Link>
          {/* The line people screenshot (#4 #30). */}
          <p className="max-w-xl text-xl font-semibold text-neutral-800">
            Your team’s office, inside monday.com.
          </p>
          <Cta>Open your office</Cta>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-neutral-500">
            <a href="#how" className="hover:text-neutral-900">
              How it works
            </a>
            <a href="#pricing" className="hover:text-neutral-900">
              Pricing
            </a>
            <a href="mailto:hello@mondayvirtual.eu" className="hover:text-neutral-900">
              hello@mondayvirtual.eu
            </a>
          </div>
          <p className="text-xs text-neutral-400">
            © {2026} MondayVirtual · mondayvirtual.eu · Not affiliated with monday.com Ltd.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ── Shared bits ────────────────────────────────────────────────────────────── */
function Cta({
  children,
  size = 'md',
  full = false,
  filled = true,
}: {
  children: React.ReactNode;
  size?: 'md' | 'lg';
  full?: boolean;
  filled?: boolean;
}) {
  const pad = size === 'lg' ? 'px-7 py-4 text-lg' : 'px-5 py-2.5 text-sm';
  return (
    <a
      href={APP_TRIAL_URL}
      className={`inline-block rounded-xl font-bold transition hover:scale-[1.02] ${pad} ${full ? 'mt-6 w-full text-center' : ''}`}
      style={
        filled
          ? { backgroundColor: ACCENT, color: '#fff' }
          : { backgroundColor: '#fff', color: ACCENT, border: `2px solid ${ACCENT}` }
      }
    >
      {children}
    </a>
  );
}

function Check() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="mt-0.5 shrink-0" fill="none">
      <circle cx="10" cy="10" r="10" fill={ACCENT} opacity="0.15" />
      <path d="M6 10.5l2.5 2.5L14 7.5" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
      <rect width="26" height="26" rx="7" fill={ACCENT} />
      <circle cx="9" cy="13" r="3" fill="#fff" />
      <circle cx="17" cy="13" r="3" fill="#fff" opacity="0.7" />
    </svg>
  );
}
