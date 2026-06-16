import type { MondayBoardData } from '@mvs/shared';

/**
 * Pure, dependency-free transforms over MondayBoardData that power the
 * dashboard views (KPI chips, pipeline, workload). Kept out of the `'use client'`
 * hook file so they're unit-testable without pulling in the monday SDK.
 */

type Column = MondayBoardData['columns'][number];
type Items = MondayBoardData['items'];

/** The first status/color column on a board, used to group the pipeline view. */
export function statusColumn(data: MondayBoardData): Column | undefined {
  return data.columns.find((c) => c.type === 'status' || c.type === 'color');
}

/** The first people column on a board, used to group the workload view. */
export function peopleColumn(data: MondayBoardData): Column | undefined {
  return data.columns.find((c) => c.type === 'people' || c.type === 'person');
}

/**
 * Count items per value of the first status-type column — the KPI breakdown
 * shown both in the DashboardModal and on the in-world panel face.
 */
export function statusBreakdown(data: MondayBoardData): [string, number][] {
  const statusCol = statusColumn(data);
  if (!statusCol) return [];
  const counts = new Map<string, number>();
  for (const item of data.items) {
    const v = String(item.values[statusCol.id] ?? '—');
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export interface BoardGroup {
  /** Bucket label (status value, or assignee name). */
  key: string;
  items: Items;
}

/**
 * Group items into buckets by a column's display text. Items with no value land
 * in an "Unassigned" bucket; a people column with several names puts the item in
 * each person's bucket (one item can be two people's workload). Buckets are
 * sorted largest-first, with the empty bucket pinned last.
 */
export function groupBy(
  data: MondayBoardData,
  columnId: string,
  { splitMulti = false, emptyLabel = 'Unassigned' } = {},
): BoardGroup[] {
  const buckets = new Map<string, Items>();
  const push = (key: string, item: Items[number]) => {
    const arr = buckets.get(key) ?? [];
    arr.push(item);
    buckets.set(key, arr);
  };
  for (const item of data.items) {
    const raw = item.values[columnId];
    const text = raw == null || raw === '' ? '' : String(raw);
    if (!text) {
      push(emptyLabel, item);
      continue;
    }
    const keys = splitMulti ? text.split(',').map((s) => s.trim()).filter(Boolean) : [text];
    for (const k of keys) push(k, item);
  }
  return [...buckets.entries()]
    .map(([key, items]) => ({ key, items }))
    .sort((a, b) => {
      if (a.key === emptyLabel) return 1;
      if (b.key === emptyLabel) return -1;
      return b.items.length - a.items.length;
    });
}
