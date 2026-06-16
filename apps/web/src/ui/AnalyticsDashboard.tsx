'use client';

import { useEffect, useState } from 'react';
import { Permission, type AnalyticsSummary, type HeatmapResponse } from '@mvs/shared';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';
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
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/10 bg-brand-surface px-4 py-2 text-sm transition hover:border-brand-primary"
      >
        📈 Analytics
      </button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-brand-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">📈 Workspace analytics</h2>
            <div className="flex gap-1 rounded-lg bg-white/5 p-1 text-xs">
              {(['overview', 'heatmap'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-2.5 py-1 capitalize transition ${
                    tab === t ? 'bg-brand-primary' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-white/5 p-1 text-xs">
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  onClick={() => setDays(r.days)}
                  className={`rounded-md px-2.5 py-1 transition ${
                    days === r.days ? 'bg-brand-primary' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="py-10 text-center text-sm text-white/50">Loading…</p>}
          {error && <p className="py-10 text-center text-sm text-red-400">⚠️ {error}</p>}

          {tab === 'heatmap' && heatmap && !loading && <OccupancyHeatmap data={heatmap} />}

          {tab === 'overview' && data && !loading && (
            <>
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Kpi label="Active users" value={data.totals.activeUsers} />
                <Kpi label="Sessions" value={data.totals.sessions} />
                <Kpi label="Avg session" value={`${data.totals.avgSessionMinutes}m`} />
                <Kpi label="Messages" value={data.totals.messages} />
                <Kpi label="Reactions" value={data.totals.reactions} />
                <Kpi label="Hands raised" value={data.totals.handRaises} />
              </div>

              <div className="mb-2 text-xs uppercase tracking-wide text-white/40">Daily active users</div>
              <div className="mb-6 flex h-32 items-end gap-1 rounded-lg bg-white/5 p-2">
                {data.dailyActiveUsers.map((d) => (
                  <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end">
                    <div
                      className="w-full rounded-t bg-brand-primary/80"
                      style={{ height: `${(d.users / maxUsers) * 100}%`, minHeight: d.users > 0 ? 2 : 0 }}
                      title={`${d.date}: ${d.users}`}
                    />
                  </div>
                ))}
              </div>

              <div className="mb-2 text-xs uppercase tracking-wide text-white/40">By space</div>
              {data.spaces.length === 0 ? (
                <p className="py-6 text-center text-sm text-white/40">No activity yet in this window.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase text-white/40">
                      <th className="py-2 pr-3">Space</th>
                      <th className="py-2 pr-3">Sessions</th>
                      <th className="py-2 pr-3">Avg session</th>
                      <th className="py-2 pr-3">Messages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.spaces.map((s) => (
                      <tr key={s.spaceId} className="border-b border-white/5">
                        <td className="py-2 pr-3 font-medium">{s.name}</td>
                        <td className="py-2 pr-3 text-white/70">{s.sessions}</td>
                        <td className="py-2 pr-3 text-white/70">{s.avgSessionMinutes}m</td>
                        <td className="py-2 pr-3 text-white/70">{s.messages}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-white/5 px-4 py-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-white/50">{label}</div>
    </div>
  );
}
