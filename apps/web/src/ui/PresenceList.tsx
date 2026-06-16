'use client';

import { useState } from 'react';
import { Permission } from '@mvs/shared';
import { useChatStore } from '@/stores/chatStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useSessionStore } from '@/stores/sessionStore';
import { sendHandLower } from '@/realtime/useSpaceSocket';

/**
 * Who's-here panel (M3): live roster fed by presence join/leave events.
 * Collapsed it shows the count; expanded it lists everyone in the space.
 * Clicking a person opens a DM with them (M5).
 */
export function PresenceList() {
  const [open, setOpen] = useState(false);
  const players = usePresenceStore((s) => s.players);
  const hands = usePresenceStore((s) => s.hands);
  const me = useSessionStore((s) => s.me);
  const canModerate = me?.permissions.includes(Permission.MEDIA_MODERATE) ?? false;

  const others = Object.values(players);
  const count = others.length + 1;

  return (
    <div className="absolute bottom-4 right-4 w-56">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-lg bg-black/40 px-4 py-2 text-left text-sm backdrop-blur transition hover:bg-black/60"
      >
        <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
        {count} in this space {open ? '▾' : '▸'}
      </button>
      {open && (
        <ul className="mt-1 max-h-64 overflow-y-auto rounded-lg bg-black/40 p-2 text-sm backdrop-blur">
          <li className="flex items-center gap-2 rounded px-2 py-1">
            <Dot color="#6c5ce7" />
            <span className="truncate">{me?.user.name ?? 'You'}</span>
            <span className="ml-auto flex items-center gap-1">
              {me && hands[me.user.id] && (
                <HandMark
                  raised
                  onLower={canModerate ? () => sendHandLower(me.user.id) : undefined}
                />
              )}
              <span className="text-xs text-white/40">you</span>
            </span>
          </li>
          {others.map((p) => (
            <li key={p.userId} className="flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10">
              <button
                onClick={() => useChatStore.getState().openDm(p.userId, p.name)}
                title={`Message ${p.name}`}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Dot color="#00b894" />
                <span className="truncate">{p.name}</span>
              </button>
              <span className="flex shrink-0 items-center gap-1">
                {hands[p.userId] && (
                  <HandMark
                    raised
                    onLower={canModerate ? () => sendHandLower(p.userId) : undefined}
                  />
                )}
                <span className="text-xs text-white/30">💬</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The ✋ raised-hand indicator. For moderators it's a button that lowers the
 * hand (swaps to ✕ on hover); for everyone else it's a static glyph.
 */
function HandMark({ raised, onLower }: { raised: boolean; onLower?: () => void }) {
  if (!raised) return null;
  if (!onLower) return <span>✋</span>;
  return (
    <button
      onClick={onLower}
      title="Lower hand"
      className="group/hand rounded px-0.5 leading-none transition hover:bg-white/15"
    >
      <span className="group-hover/hand:hidden">✋</span>
      <span className="hidden text-red-400 group-hover/hand:inline">✕</span>
    </button>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}
