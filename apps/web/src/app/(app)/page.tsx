'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { PlanFeature, type SpaceSummaryDTO } from '@mvs/shared';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { AnalyticsDashboard } from '@/ui/AnalyticsDashboard';
import { BrandingSettings } from '@/ui/BrandingSettings';
import { EventsPanel } from '@/ui/EventsPanel';
import { TeamSettings } from '@/ui/TeamSettings';

// Browser-only (renders a three.js preview canvas).
const AvatarPicker = dynamic(() => import('@/ui/AvatarPicker').then((m) => m.AvatarPicker), {
  ssr: false,
});

/** Lobby/launcher: shows the tenant's product name and a list of spaces to enter. */
export default function HomePage() {
  const { status, error, me } = useSessionStore();
  const [spaces, setSpaces] = useState<SpaceSummaryDTO[]>([]);

  useEffect(() => {
    if (status !== 'ready') return;
    api
      .spaces()
      .then(setSpaces)
      .catch(() => setSpaces([]));
  }, [status]);

  if (status === 'authenticating' || status === 'idle') {
    return <Centered>Connecting to your workspace…</Centered>;
  }
  if (status === 'error') {
    return <Centered>⚠️ {error}</Centered>;
  }

  // Plan-gated features (billing) — a user needs both the RBAC permission
  // (checked inside each panel) and the plan feature to see the entry point.
  const features = me?.plan?.features ?? [];
  const has = (f: PlanFeature) => features.includes(f);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
      {me?.plan?.isTrial && (
        <div className="rounded-full bg-amber-400/15 px-4 py-1.5 text-sm text-amber-300 ring-1 ring-amber-400/40">
          ✨ Trial plan
          {me.plan.renewalDate ? ` · ends ${new Date(me.plan.renewalDate).toLocaleDateString()}` : ''} —
          manage your subscription in monday.com
        </div>
      )}
      <header className="text-center">
        <h1 className="text-4xl font-bold text-brand-text">
          {me?.tenant.branding.productName ?? 'Virtual Spaces'}
        </h1>
        <p className="mt-2 text-brand-text/60">
          Welcome, {me?.user.name}. Choose a space to enter.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <AvatarPicker />
          {has(PlanFeature.EVENTS) && <EventsPanel />}
          {has(PlanFeature.BRANDING) && <BrandingSettings />}
          <TeamSettings />
          {has(PlanFeature.ANALYTICS) && <AnalyticsDashboard />}
        </div>
      </header>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {spaces.length === 0 && (
          <div className="col-span-full rounded-xl border border-white/10 bg-brand-surface p-6 text-center text-brand-text/60">
            No spaces yet.
          </div>
        )}
        {spaces.map((s) => (
          <Link
            key={s.id}
            href={`/space/${s.id}`}
            className="group rounded-xl border border-white/10 bg-brand-surface p-6 transition hover:border-brand-primary"
          >
            <div className="text-xs uppercase tracking-wide text-brand-secondary">{s.type}</div>
            <div className="mt-1 text-xl font-semibold">{s.name}</div>
            <div className="mt-4 flex items-center justify-between text-sm text-brand-text/60">
              <span>
                {s.occupancy}/{s.capacity} present
              </span>
              <span className="text-brand-primary opacity-0 transition group-hover:opacity-100">
                Enter →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-brand-text/70">{children}</div>
  );
}
