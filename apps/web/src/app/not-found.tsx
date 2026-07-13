import Link from 'next/link';

/** Branded 404 — quiet, with paths back to the app and the site. */
export default function NotFound() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center"
      style={{ background: '#faf7f2', color: '#211c29' }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">404</p>
      <h1 className="font-display text-3xl">This room doesn&rsquo;t exist</h1>
      <p className="max-w-sm text-sm opacity-60">
        The page you&rsquo;re looking for was moved or never built.
      </p>
      <div className="mt-2 flex gap-2">
        <Link
          href="/"
          className="rounded-md bg-brand-text px-4 py-2 text-sm font-medium text-brand-surface shadow-e1 transition hover:opacity-90"
          style={{ background: '#211c29', color: '#ffffff' }}
        >
          Open the app
        </Link>
        <Link
          href="/home"
          className="rounded-md border px-4 py-2 text-sm font-medium transition hover:bg-white"
          style={{ borderColor: 'rgb(33 28 41 / 0.15)' }}
        >
          Visit the website
        </Link>
      </div>
    </div>
  );
}
