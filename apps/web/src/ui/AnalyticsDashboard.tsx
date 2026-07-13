'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ChartNoAxesColumn } from 'lucide-react';
import { Permission, type AnalyticsSummary, type HeatmapResponse } from '@mvs/shared';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
import { Button, EmptyState, Modal, Spinner } from '@/ui/primitives';
import { OccupancyHeatmap } from './OccupancyHeatmap';

const RANGES = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];

/**
 * Tenant analytics dashboard (ANALYTICS_VIEW): headline totals, a daily
 * active-users trend, and per-space engagement, aggregated from the
 * AnalyticsEvent stream the realtime gateway captures.
 */
export function AnalyticsDashboard() {
  const me = useSessionStore((s) => s.me);
  const [open, setOpen] = useState(false);
  if (!me?.permissions.includes(Permission.ANALYTICS_VIEW)) return null;

  if (!open) {
    return (
      <Button variant="ghost" icon={ChartNoAxesColumn} onClick={() => setOpen(true)}>
        Analytics
      </Button>
    );
  }
  return <AnalyticsModal onClose={() => setOpen(false)} />;
}

type Tab = 'overview' | 'heatmap';

function AnalyticsModal({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState(7);
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = tab === 'overview' ? api.analyticsSummary(days) : api.analyticsHeatmap(days);
    load
      .then((d) => {
        if (cancelled) return;
        if (tab === 'overview') setData(d as AnalyticsSummary);
        else setHeatmap(d as HeatmapResponse);
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days, tab]);

  const maxUsers = Math.max(1, ...(data?.dailyActiveUsers.map((d) => d.users) ?? [1]));

  return (
    <Modal
      title="Workspace analytics"
      size="lg"
      onClose={onClose}
      headerExtra={
        <div className="flex items-center gap-2">
          <Segmented
            options={(['overview', 'heatmap'] as const).map((t) => ({ value: t, label: t }))}
            value={tab}
            onChange={setTab}
            capitalize
          />
          <Segmented
            options={RANGES.map((r) => ({ value: r.days, label: r.label }))}
            value={days}
            onChange={setDays}
          />
        </div>
      }
    >
      <div className="p-5">
        {loading && (
          <div className="flex justify-center py-14">
            <Spinner size={22} />
          </div>
        )}
        {error && !loading && (
          <EmptyState icon={AlertTriangle} title="Couldn’t load analytics" body={error} />
        )}

        {tab === 'heatmap' && heatmap && !loading && !error && <OccupancyHeatmap data={heatmap} />}

        {tab === 'overview' && data && !loading && !error && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Kpi label="Active users" value={data.totals.activeUsers} />
              <Kpi label="Sessions" value={data.totals.sessions} />
              <Kpi label="Avg session" value={`${data.totals.avgSessionMinutes}m`} />
              <Kpi label="Messages" value={data.totals.messages} />
              <Kpi label="Reactions" value={data.totals.reactions} />
              <Kpi label="Hands raised" value={data.totals.handRaises} />
            </div>

            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-brand-text/55">
              Daily active users
            </div>
            <div className="mb-6 flex h-32 items-end gap-1">
              {data.dailyActiveUsers.map((d) => (
                <div
                  key={d.date}
                  className="flex h-full flex-1 items-end rounded-t-sm bg-line/8"
                  title={`${d.date}: ${d.users}`}
                >
                  <div
                    className="w-full rounded-t-sm bg-brand-primary/70"
                    style={{ height: `${(d.users / maxUsers) * 100}%`, minHeight: d.users > 0 ? 2 : 0 }}
                  />
                </div>
              ))}
            </div>

            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-brand-text/55">
              By space
            </div>
            {data.spaces.length === 0 ? (
              <p className="py-6 text-center text-sm text-brand-text/55">
                No activity yet in this window.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line/10 text-[11px] uppercase tracking-wide text-brand-text/55">
                    <th className="py-2 pr-3 font-medium">Space</th>
                    <th className="py-2 pr-3 font-medium">Sessions</th>
                    <th className="py-2 pr-3 font-medium">Avg session</th>
                    <th className="py-2 pr-3 font-medium">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {data.spaces.map((s) => (
                    <tr key={s.spaceId} className="border-b border-line/8">
                      <td className="py-2 pr-3 font-medium text-brand-text">{s.name}</td>
                      <td className="py-2 pr-3 tabular-nums text-brand-text/75">{s.sessions}</td>
                      <td className="py-2 pr-3 tabular-nums text-brand-text/75">{s.avgSessionMinutes}m</td>
                      <td className="py-2 pr-3 tabular-nums text-brand-text/75">{s.messages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Light segmented control: inset track, raised active segment. */
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  capitalize = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  capitalize?: boolean;
}) {
  return (
    <div className="flex gap-0.5 rounded-md bg-brand-bg p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`rounded-sm px-2.5 py-1 font-medium transition ${capitalize ? 'capitalize' : ''} ${
            value === o.value
              ? 'bg-brand-surface text-brand-text shadow-e1'
              : 'text-brand-text/60 hover:text-brand-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-brand-bg p-3">
      <div className="font-display text-2xl tabular-nums text-brand-text">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-brand-text/55">
        {label}
      </div>
    </div>
  );
}
