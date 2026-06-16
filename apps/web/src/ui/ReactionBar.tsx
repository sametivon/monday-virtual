'use client';

import { sendHandRaise, sendReaction } from '@/realtime/useSpaceSocket';
import { usePresenceStore } from '@/stores/presenceStore';
import { useSessionStore } from '@/stores/sessionStore';

const EMOJIS = ['👏', '❤️', '😂', '🎉', '👍'];

/**
 * Raise-hand toggle + emoji reaction quick bar (Phase 2, auditorium-first but
 * available everywhere). The server echoes both events back to the sender, so
 * local state comes from presenceStore like everyone else's.
 */
export function ReactionBar() {
  const me = useSessionStore((s) => s.me);
  const raised = usePresenceStore((s) => (me ? Boolean(s.hands[me.user.id]) : false));

  if (!me) return null;

  return (
    <div className="absolute bottom-16 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-black/50 px-2 py-1.5 backdrop-blur">
      <button
        onClick={() => sendHandRaise(!raised)}
        title={raised ? 'Lower hand' : 'Raise hand'}
        className={`rounded-lg px-2.5 py-1 text-lg transition ${
          raised ? 'bg-brand-primary' : 'hover:bg-white/10'
        }`}
      >
        ✋
      </button>
      <div className="h-5 w-px bg-white/15" />
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => sendReaction(emoji)}
          title="React"
          className="rounded-lg px-2 py-1 text-lg transition hover:bg-white/10"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
