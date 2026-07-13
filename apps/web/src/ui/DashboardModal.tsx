'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, LayoutDashboard, Pin } from 'lucide-react';
import { Permission, type MondayBoardData, type MondayBoardSummary, type SceneObjectDTO } from '@mvs/shared';
import { api } from '@/lib/api';
import { inMondayIframe } from '@/monday/client';
import { fetchBoardDataSeamless, fetchBoardsSeamless } from '@/monday/boardApi';
import {
  groupBy,
  peopleColumn,
  statusBreakdown,
  statusColumn,
  type BoardGroup,
} from '@/monday/useBoardData';
import { useSessionStore } from '@/stores/sessionStore';
import { EmptyState, IconButton, Modal, Skeleton, Tooltip } from '@/ui/primitives';

type DashboardView = 'table' | 'pipeline' | 'workload';

/**
 * Live monday board data behind an in-world DASHBOARD object (Phase 2).
 * Inside the monday iframe data flows over the client-side seamless channel
 * (the app's granted scopes); outside the iframe we say so instead of
 * breaking. Data refreshes on the object's configured cadence. Scene
 * editors (space:edit) can pin the selected board to the panel itself.
 */
export function DashboardModal({
  object,
  spaceId,
  onPinned,
  onClose,
}: {
  object: SceneObjectDTO;
  spaceId: string;
  onPinned?: () => void;
  onClose: () => void;
}) {
  const config = object.config as {
    mondayBoardId?: string;
    refreshSeconds?: number;
    label?: string;
  };
  const me = useSessionStore((s) => s.me);
  const canPin = me?.permissions.includes(Permission.SPACE_EDIT) ?? false;
  const [pinnedId, setPinnedId] = useState(config.mondayBoardId);
  const [pinning, setPinning] = useState(false);
  const [boards, setBoards] = useState<MondayBoardSummary[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [data, setData] = useState<MondayBoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outsideMonday, setOutsideMonday] = useState(false);
  const [view, setView] = useState<DashboardView>('table');

  const pin = async () => {
    if (!boardId) return;
    setPinning(true);
    try {
      await api.pinBoard(spaceId, object.id, boardId);
      setPinnedId(boardId);
      onPinned?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPinning(false);
    }
  };

  // Board list once on open; preselect the configured board when it exists.
  useEffect(() => {
    let cancelled = false;
    if (!inMondayIframe()) {
      setOutsideMonday(true);
      return;
    }
    void (async () => {
      try {
        const list = await fetchBoardsSeamless();
        if (cancelled) return;
        setBoards(list);
        const configured = list.find((b) => b.id === config.mondayBoardId);
        setBoardId(configured?.id ?? list[0]?.id ?? null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.mondayBoardId]);

  // Selected board data, refreshed on the configured cadence.
  const load = useCallback(async () => {
    if (!boardId || !inMondayIframe()) return;
    try {
      setData(await fetchBoardDataSeamless(boardId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [boardId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), (config.refreshSeconds ?? 60) * 1000);
    return () => clearInterval(interval);
  }, [load, config.refreshSeconds]);

  // Status breakdown from the first status-type column (KPI chips).
  const breakdown = useMemo(() => (data ? statusBreakdown(data) : []), [data]);

  // The `name` column duplicates the item name we already render first.
  const visibleColumns = data?.columns.filter((c) => c.type !== 'name').slice(0, 4) ?? [];

  // Pipeline groups by status; workload groups by the people column (one item
  // can count toward several assignees). Each view is offered only when its
  // grouping column exists on the board.
  const statusCol = useMemo(() => (data ? statusColumn(data) : undefined), [data]);
  const peopleCol = useMemo(() => (data ? peopleColumn(data) : undefined), [data]);
  const pipeline = useMemo(
    () => (data && statusCol ? groupBy(data, statusCol.id, { emptyLabel: 'No status' }) : []),
    [data, statusCol],
  );
  const workload = useMemo(
    () => (data && peopleCol ? groupBy(data, peopleCol.id, { splitMulti: true }) : []),
    [data, peopleCol],
  );

  const views: { id: DashboardView; label: string; enabled: boolean }[] = [
    { id: 'table', label: 'Table', enabled: true },
    { id: 'pipeline', label: 'Pipeline', enabled: Boolean(statusCol) },
    { id: 'workload', label: 'Workload', enabled: Boolean(peopleCol) },
  ];
  // Fall back to Table if the active view's column vanished (board switch).
  const activeView = views.find((v) => v.id === view && v.enabled) ? view : 'table';

  return (
    <Modal
      size="lg"
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <LayoutDashboard
            size={17}
            strokeWidth={1.75}
            className="text-brand-primary"
            aria-hidden="true"
          />
          {config.label ?? 'Board data'}
        </span>
      }
      headerExtra={
        canPin && boardId && boardId !== pinnedId ? (
          <Tooltip label="Show this board on the 3D panel for everyone">
            <IconButton
              icon={Pin}
              aria-label="Pin this board to the panel"
              size="sm"
              disabled={pinning}
              onClick={() => void pin()}
            />
          </Tooltip>
        ) : undefined
      }
    >
      <div className="px-5 py-4">
        {data && (
          <div className="mb-3 text-xs text-brand-text/50">
            {data.items.length} items · updated{' '}
            {new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {data.cached ? ' (cached)' : ''}
          </div>
        )}

        {outsideMonday && (
          <EmptyState
            icon={Database}
            title="Open inside monday.com"
            body="Live board data is available when this space runs inside monday.com."
          />
        )}
        {error && <EmptyState icon={AlertTriangle} title="Couldn’t load board data" body={error} />}
        {!outsideMonday && !error && !data && (
          <div className="space-y-2 py-2" aria-busy="true">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        )}

        {boards && boards.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1 rounded-md bg-line/8 p-1 text-xs">
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => setBoardId(b.id)}
                className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 font-medium transition ${
                  boardId === b.id
                    ? 'bg-brand-primary text-white shadow-e1'
                    : 'text-brand-text/60 hover:text-brand-text'
                }`}
              >
                {b.name}
                {pinnedId === b.id && <Pin size={11} strokeWidth={1.75} aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}

        {breakdown.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {breakdown.map(([status, count]) => (
              <div key={status} className="min-w-[72px] rounded-md bg-brand-bg px-3 py-2">
                <div className="text-xl font-semibold tabular-nums text-brand-text">{count}</div>
                <div className="text-xs text-brand-text/55">{status}</div>
              </div>
            ))}
          </div>
        )}

        {data && views.filter((v) => v.enabled).length > 1 && (
          <div className="mb-4 inline-flex gap-1 rounded-md bg-line/8 p-1 text-xs">
            {views
              .filter((v) => v.enabled)
              .map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`rounded-sm px-3 py-1 font-medium transition ${
                    activeView === v.id
                      ? 'bg-brand-primary text-white shadow-e1'
                      : 'text-brand-text/60 hover:text-brand-text'
                  }`}
                >
                  {v.label}
                </button>
              ))}
          </div>
        )}

        {data && activeView === 'table' && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line/10 text-[11px] uppercase tracking-wide text-brand-text/55">
                <th className="py-2 pr-3 font-semibold">Item</th>
                {visibleColumns.map((c) => (
                  <th key={c.id} className="py-2 pr-3 font-semibold">
                    {c.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-b border-line/8">
                  <td className="py-2 pr-3 font-medium text-brand-text">{item.name}</td>
                  {visibleColumns.map((c) => (
                    <td key={c.id} className="py-2 pr-3 text-brand-text/70">
                      {String(item.values[c.id] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data && activeView === 'pipeline' && <Pipeline groups={pipeline} />}
        {data && activeView === 'workload' && <Workload groups={workload} />}
      </div>
    </Modal>
  );
}

/** Kanban-style columns, one per status value, each listing its items. */
function Pipeline({ groups }: { groups: BoardGroup[] }) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Database}
        title="No pipeline to show"
        body="This board has no status column to build a pipeline from."
      />
    );
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {groups.map((g) => (
        <div key={g.key} className="flex w-48 shrink-0 flex-col rounded-md bg-brand-bg">
          <div className="flex items-center justify-between border-b border-line/8 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-brand-text/55">
            <span className="truncate">{g.key}</span>
            <span className="ml-2 rounded-full bg-line/8 px-2 py-0.5 tabular-nums text-brand-text/70">
              {g.items.length}
            </span>
          </div>
          <div className="flex flex-col gap-2 p-2">
            {g.items.map((item) => (
              <div
                key={item.id}
                className="rounded-sm border border-line/10 bg-brand-surface px-3 py-2 text-sm text-brand-text shadow-e1"
              >
                {item.name}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars, one per assignee, length proportional to their item count. */
function Workload({ groups }: { groups: BoardGroup[] }) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Database}
        title="No workload to show"
        body="This board has no people column to measure workload from."
      />
    );
  }
  const max = Math.max(...groups.map((g) => g.items.length), 1);
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => (
        <div key={g.key} className="flex items-center gap-3 text-sm">
          <div className="w-32 shrink-0 truncate text-brand-text/70" title={g.key}>
            {g.key}
          </div>
          <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-line/8">
            <div
              className="h-full rounded-md bg-brand-primary/80"
              style={{ width: `${(g.items.length / max) * 100}%` }}
            />
          </div>
          <span className="w-6 shrink-0 text-right text-xs font-medium tabular-nums text-brand-text/70">
            {g.items.length}
          </span>
        </div>
      ))}
    </div>
  );
}
