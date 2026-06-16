'use client';

import { useEffect, useState } from 'react';
import type { MondayBoardData } from '@mvs/shared';
import { fetchBoardDataSeamless, fetchBoardsSeamless } from '@/monday/boardApi';
import { inMondayIframe } from '@/monday/client';

// Pure view transforms live in boardViews (SDK-free, unit-testable);
// re-exported here so existing imports keep working.
export {
  statusBreakdown,
  statusColumn,
  peopleColumn,
  groupBy,
  type BoardGroup,
} from '@/monday/boardViews';

/**
 * Live board data for an in-world panel, fetched over the client-side
 * seamless channel (iframe only — outside monday.com the panel stays
 * static): the configured board or the account's first board, polled on the
 * object's refresh cadence.
 */
export function useBoardData(boardId: string | undefined, refreshSeconds = 60): MondayBoardData | null {
  const [data, setData] = useState<MondayBoardData | null>(null);

  useEffect(() => {
    if (!inMondayIframe()) return;
    let cancelled = false;
    const load = async () => {
      try {
        const id = boardId ?? (await fetchBoardsSeamless())[0]?.id;
        if (!id || cancelled) return;
        const fresh = await fetchBoardDataSeamless(id);
        if (!cancelled) setData(fresh);
      } catch {
        // Panel stays static on failure; the modal surfaces errors instead.
      }
    };
    void load();
    const interval = setInterval(() => void load(), refreshSeconds * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [boardId, refreshSeconds]);

  return data;
}
