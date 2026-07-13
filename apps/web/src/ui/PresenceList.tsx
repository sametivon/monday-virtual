'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Hand, MessageCircle } from 'lucide-react';
import { Permission } from '@mvs/shared';
import { useChatStore } from '@/stores/chatStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useSessionStore } from '@/stores/sessionStore';
import { sendHandLower } from '@/realtime/useSpaceSocket';
import { IconButton, Tooltip } from '@/ui/primitives';

/** Roster avatar colors (kept from the original presence-dot logic). */
const ME_COLOR = '#6c5ce7';
const OTHER_COLOR = '#00b894';

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

  const Chevron = open ? ChevronDown : ChevronUp;

  return (
    <div className="absolute bottom-4 right-4 w-64">
      <button
        onClick={() => setOpen((v) => !v)}
        className="glass-strong flex w-full items-center gap-2 rounded-lg px-3.5 py-2 text-left text-sm text-brand-text transition hover:shadow-e2"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{count} in this space</span>
        <Chevron size={15} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-brand-text/55" />
      </button>
      {open && (
        <ul className="glass-strong mt-1.5 max-h-64 overflow-y-auto rounded-lg p-1.5 text-sm text-brand-text">
          <li className="flex items-center gap-2 rounded-sm px-2 py-1.5">
            <InitialDisc name={me?.user.name ?? 'You'} color={ME_COLOR} />
            <span className="min-w-0 flex-1 truncate">{me?.user.name ?? 'You'}</span>
            <span className="flex shrink-0 items-center gap-1">
              {me && hands[me.user.id] && (
                <HandMark
                  raised
                  onLower={canModerate ? () => sendHandLower(me.user.id) : undefined}
                />
              )}
              <span className="text-xs text-brand-text/40">you</span>
            </span>
          </li>
          {others.map((p) => (
            <li key={p.userId} className="flex items-center gap-1 rounded-sm px-2 py-1 hover:bg-line/8">
              <button
                onClick={() => useChatStore.getState().openDm(p.userId, p.name)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <InitialDisc name={p.name} color={OTHER_COLOR} />
                <span className="truncate">{p.name}</span>
              </button>
              <span className="flex shrink-0 items-center gap-0.5">
                {hands[p.userId] && (
                  <HandMark
                    raised
                    onLower={canModerate ? () => sendHandLower(p.userId) : undefined}
                  />
                )}
                <Tooltip label={`Message ${p.name}`}>
                  <IconButton
                    icon={MessageCircle}
                    aria-label={`Message ${p.name}`}
                    size="sm"
                    onClick={() => useChatStore.getState().openDm(p.userId, p.name)}
                  />
                </Tooltip>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The raised-hand indicator. For moderators it's a button that lowers the
 * hand; for everyone else it's a static glyph.
 */
function HandMark({ raised, onLower }: { raised: boolean; onLower?: () => void }) {
  if (!raised) return null;
  if (!onLower) {
    return (
      <Tooltip label="Hand raised">
        <span className="grid h-6 w-6 place-items-center text-warning">
          <Hand size={14} strokeWidth={1.75} aria-hidden="true" />
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip label="Lower hand">
      <IconButton
        icon={Hand}
        aria-label="Lower hand"
        size="sm"
        className="!text-warning"
        onClick={onLower}
      />
    </Tooltip>
  );
}

/** Initial-letter avatar disc (the roster's identity mark). */
function InitialDisc({ name, color }: { name: string; color: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
