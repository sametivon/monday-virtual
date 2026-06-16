import { describe, expect, it } from 'vitest';
import type { MondayBoardData } from '@mvs/shared';
import {
  groupBy,
  peopleColumn,
  statusBreakdown,
  statusColumn,
} from '@/monday/boardViews';

function board(overrides: Partial<MondayBoardData> = {}): MondayBoardData {
  return {
    boardId: '1',
    name: 'Sprint',
    columns: [
      { id: 'name', title: 'Name', type: 'name' },
      { id: 'status', title: 'Status', type: 'status' },
      { id: 'owner', title: 'Owner', type: 'people' },
    ],
    items: [
      { id: 'a', name: 'A', values: { status: 'Done', owner: 'Sam' } },
      { id: 'b', name: 'B', values: { status: 'Working on it', owner: 'Sam, Bea' } },
      { id: 'c', name: 'C', values: { status: 'Done', owner: 'Bea' } },
      { id: 'd', name: 'D', values: { status: null, owner: '' } },
    ],
    fetchedAt: '2026-06-13T00:00:00.000Z',
    cached: false,
    ...overrides,
  };
}

describe('column detection', () => {
  it('finds the first status/color column', () => {
    expect(statusColumn(board())?.id).toBe('status');
    expect(statusColumn(board({ columns: [{ id: 'x', title: 'X', type: 'text' }] }))).toBeUndefined();
  });

  it('finds the first people column', () => {
    expect(peopleColumn(board())?.id).toBe('owner');
  });
});

describe('statusBreakdown', () => {
  it('counts items per status, largest first', () => {
    expect(statusBreakdown(board())).toEqual([
      ['Done', 2],
      ['Working on it', 1],
      ['—', 1], // null status renders as the em-dash bucket
    ]);
  });
});

describe('groupBy (pipeline)', () => {
  it('buckets by status with the empty bucket pinned last', () => {
    const groups = groupBy(board(), 'status', { emptyLabel: 'No status' });
    expect(groups.map((g) => [g.key, g.items.length])).toEqual([
      ['Done', 2],
      ['Working on it', 1],
      ['No status', 1],
    ]);
  });
});

describe('groupBy (workload, splitMulti)', () => {
  it('counts an item toward each assignee and pins Unassigned last', () => {
    const groups = groupBy(board(), 'owner', { splitMulti: true });
    // Sam: A + B = 2, Bea: B + C = 2, Unassigned: D = 1.
    expect(groups.map((g) => [g.key, g.items.length])).toEqual([
      ['Sam', 2],
      ['Bea', 2],
      ['Unassigned', 1],
    ]);
  });

  it('does not split when splitMulti is false', () => {
    const groups = groupBy(board(), 'owner');
    const multi = groups.find((g) => g.key === 'Sam, Bea');
    expect(multi?.items.length).toBe(1);
  });
});
