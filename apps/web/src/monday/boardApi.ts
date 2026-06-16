'use client';

import type { MondayBoardData, MondayBoardSummary } from '@mvs/shared';
import { mondayApi } from './client';

/**
 * Board reads over the client-side seamless channel (see mondayApi). Shapes
 * mirror the api's MondayBoardData so the UI is agnostic about which path
 * (seamless now, server OAuth later) produced the data.
 */

export async function fetchBoardsSeamless(): Promise<MondayBoardSummary[]> {
  const data = await mondayApi<{ boards: { id: string; name: string }[] }>(
    `query { boards (limit: 50, order_by: used_at) { id name } }`,
  );
  return data.boards.map((b) => ({ id: b.id, name: b.name }));
}

interface BoardsResponse {
  boards: {
    id: string;
    name: string;
    columns: { id: string; title: string; type: string }[];
    items_page: {
      items: {
        id: string;
        name: string;
        column_values: { id: string; text: string | null; value: string | null }[];
      }[];
    };
  }[];
}

export async function fetchBoardDataSeamless(boardId: string): Promise<MondayBoardData> {
  const data = await mondayApi<BoardsResponse>(
    `query ($ids: [ID!]) {
      boards (ids: $ids) {
        id name
        columns { id title type }
        items_page (limit: 100) {
          items { id name column_values { id text value } }
        }
      }
    }`,
    { ids: [boardId] },
  );
  const board = data.boards[0];
  if (!board) throw new Error(`Board ${boardId} not found (is it in an allowed workspace?)`);
  return {
    boardId: board.id,
    name: board.name,
    columns: board.columns.map((c) => ({ id: c.id, title: c.title, type: c.type })),
    items: board.items_page.items.map((it) => ({
      id: it.id,
      name: it.name,
      // Display text only — falling back to `value` leaks raw column JSON
      // (e.g. {"index":5,...} for an unlabeled status) into the UI.
      values: Object.fromEntries(it.column_values.map((cv) => [cv.id, cv.text || null])),
    })),
    fetchedAt: new Date().toISOString(),
    cached: false,
  };
}
