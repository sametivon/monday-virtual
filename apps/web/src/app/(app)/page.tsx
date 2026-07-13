'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { m } from 'framer-motion';
import { AlertTriangle, Building2, Sparkles } from 'lucide-react';
import { PlanFeature, type SpaceSummaryDTO } from '@mvs/shared';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { EmptyState, Panel, SPRING, Skeleton, Spinner } from '@/ui/primitives';
import { AnalyticsDashboard } from '@/ui/AnalyticsDashboard';
import { BrandingSettings } from '@/ui/BrandingSettings';
import { EventsPanel } from '@/ui/EventsPanel';
import { TeamSettings } from '@/ui/TeamSettings';

// Browser-only (renders a three.js preview canvas).
const AvatarPicker = dynamic(() => import('@/ui/AvatarPicker').then((m) => m.AvatarPicker), {
  ssr: false,
});

/** Lobby/launcher: the tenant's front door — pick a space to walk into. */
export default function HomePage() {
  const { status, error, me } = useSessionStore();
  const [spaces, setSpaces] = useState<SpaceSummaryDTO[] | null>(null);

  useEffect(() => {
    if (status !== 'ready') return;
    api
      .spaces()
      .then(setSpaces)
      .catch(() => setSpaces([]));
  }, [status]);

  if (status === 'authenticating' || status === 'idle') {
    return (
      <Centered>
        <Spinner size={22} />
        <p className="text-sm text-brand-text/60">Connecting to your workspace…</p>
        <p className="text-xs text-brand-text/40">
          First visit after a quiet period can take up to ~30 seconds while the office wakes up.
        </p>
      </Centered>
    );
  }
  if (status === 'error') {
    return (
      <Centered>
        <span className="grid h-11 w-11 place-items-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle size={20} strokeWidth={1.75} />
        </span>
        <p className="font-display text-lg">We couldn&rsquo;t connect</p>
        <p className="max-w-sm text-center text-sm text-brand-text/60">{error}</p>
      </Centered>
    );
  }

  const features = me?.plan?.features ?? [];
  const has = (f: PlanFeature) => features.includes(f);
  const logoUrl = me?.tenant.branding.logoUrl;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center gap-9 px-6 py-12">
        {me?.plan?.isTrial && (
          <div className="flex items-center gap-2 rounded-full bg-warning/10 px-4 py-1.5 text-sm text-warning ring-1 ring-warning/25">
            <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
            Trial plan
            {me.plan.renewalDate
              ? ` · ends ${new Date(me.plan.renewalDate).toLocaleDateString()}`
              : ''}{' '}
            — manage your subscription in monday.com
          </div>
        )}

        <m.header
          className="flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="mb-4 h-10 w-auto object-contain" />
          ) : null}
          <h1 className="font-display text-4xl tracking-tight text-brand-text">
            {me?.tenant.branding.productName ?? 'Virtual Spaces'}
          </h1>
          <p className="mt-2 text-brand-text/55">
            Welcome, {me?.user.name}. Choose a space to walk into.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <AvatarPicker />
            {has(PlanFeature.EVENTS) && <EventsPanel />}
            {has(PlanFeature.BRANDING) && <BrandingSettings />}
            <TeamSettings />
            {has(PlanFeature.ANALYTICS) && <AnalyticsDashboard />}
          </div>
        </m.header>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces === null &&
            [0, 1, 2].map((i) => (
              <Panel key={i} variant="solid" padding="lg" className="space-y-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-3 w-24" />
              </Panel>
            ))}

          {spaces?.length === 0 && (
            <div className="col-span-full">
              <EmptyState
                icon={Building2}
                title="No spaces yet"
                body="Your spaces are created automatically the first time an admin opens the app."
              />
            </div>
          )}

          {spaces?.map((s, i) => (
            <m.div
              key={s.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: 0.05 * i }}
            >
              <Link
                href={`/space/${s.id}`}
                className="group block rounded-lg border border-line/10 bg-brand-surface p-6 shadow-e1 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-primary/35 hover:shadow-e2"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-primary">
                  {s.type}
                </div>
                <div className="mt-1.5 font-display text-xl text-brand-text">{s.name}</div>
                <div className="mt-5 flex items-center justify-between text-sm text-brand-text/55">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${s.occupancy > 0 ? 'bg-success' : 'bg-line/25'}`}
                      aria-hidden="true"
                    />
                    {s.occupancy}/{s.capacity} present
                  </span>
                  <span className="text-brand-primary opacity-0 transition group-hover:opacity-100">
                    Enter →
                  </span>
                </div>
              </Link>
            </m.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6">{children}</div>
  );
}
