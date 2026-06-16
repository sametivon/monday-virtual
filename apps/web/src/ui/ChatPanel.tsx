'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatScope, type ChatMessageBroadcast } from '@mvs/shared';
import { api } from '@/lib/api';
import { sendChat } from '@/realtime/useSpaceSocket';
import { useChatStore, type ConversationKey } from '@/stores/chatStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useSessionStore } from '@/stores/sessionStore';

const QUICK_EMOJIS = ['👍', '😀', '🎉', '❤️', '😂', '👋'];

/**
 * Chat (M5): Space / Global tabs + DM conversations (opened from the presence
 * list), history on demand, @mention autocomplete from the live roster,
 * unread badges, Enter to send.
 */
export function ChatPanel({ spaceId }: { spaceId: string }) {
  const { open, setOpen, activeKey, setActive, messages, unread, loaded, dmNames, pingVersion } =
    useChatStore();
  const me = useSessionStore((s) => s.me);
  const roomKey = `ROOM:${spaceId}`;
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const [flash, setFlash] = useState(false);

  // Brief flash on mention/DM while the panel is closed.
  useEffect(() => {
    if (pingVersion === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 2500);
    return () => clearTimeout(t);
  }, [pingVersion]);

  // Lazy-load history when a conversation becomes visible.
  useEffect(() => {
    if (!open || loaded[activeKey]) return;
    void fetchHistory(activeKey, spaceId);
  }, [open, activeKey, loaded, spaceId]);

  if (!me) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`absolute bottom-4 left-4 rounded-xl px-4 py-2 backdrop-blur transition ${
          flash ? 'animate-pulse bg-brand-primary' : 'bg-black/50 hover:bg-black/70'
        }`}
      >
        💬 Chat
        {totalUnread > 0 && (
          <span className="ml-2 rounded-full bg-brand-primary px-2 py-0.5 text-xs">{totalUnread}</span>
        )}
      </button>
    );
  }

  const dmKeys = Object.keys(dmNames);

  return (
    <div className="absolute bottom-4 left-4 top-20 flex w-80 flex-col rounded-xl bg-black/60 backdrop-blur">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 p-2">
        <Tab label="📍 Space" k={roomKey} activeKey={activeKey} unread={unread} onSelect={setActive} />
        <Tab label="🌐 Global" k="GLOBAL" activeKey={activeKey} unread={unread} onSelect={setActive} />
        {dmKeys.map((k) => (
          <Tab key={k} label={`@${dmNames[k]}`} k={k} activeKey={activeKey} unread={unread} onSelect={setActive} />
        ))}
        <button onClick={() => setOpen(false)} className="ml-auto px-2 text-white/60 hover:text-white">
          ✕
        </button>
      </div>

      <MessageList messages={messages[activeKey] ?? []} myUserId={me.user.id} activeKey={activeKey} spaceId={spaceId} />

      <Composer activeKey={activeKey} spaceId={spaceId} />
    </div>
  );
}

function Tab({
  label,
  k,
  activeKey,
  unread,
  onSelect,
}: {
  label: string;
  k: ConversationKey;
  activeKey: ConversationKey;
  unread: Record<string, number>;
  onSelect: (k: ConversationKey) => void;
}) {
  const count = unread[k] ?? 0;
  return (
    <button
      onClick={() => onSelect(k)}
      className={`shrink-0 rounded-lg px-2 py-1 text-xs transition ${
        activeKey === k ? 'bg-brand-primary' : 'bg-white/10 hover:bg-white/20'
      }`}
    >
      {label}
      {count > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5">{count}</span>}
    </button>
  );
}

function MessageList({
  messages,
  myUserId,
  activeKey,
  spaceId,
}: {
  messages: ChatMessageBroadcast[];
  myUserId: string;
  activeKey: ConversationKey;
  spaceId: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
  }, [messages.length, activeKey]);

  return (
    <div className="flex-1 overflow-y-auto p-3">
      {messages.length >= 50 && (
        <button
          onClick={() => void fetchHistory(activeKey, spaceId, messages[0]?.createdAt)}
          className="mb-2 w-full rounded bg-white/10 py-1 text-xs text-white/60 hover:bg-white/20"
        >
          Load earlier
        </button>
      )}
      {messages.length === 0 && (
        <div className="py-8 text-center text-xs text-white/40">No messages yet — say hi 👋</div>
      )}
      {messages.map((m) => (
        <div key={m.id} className="mb-2">
          <span className={`text-xs font-semibold ${m.fromUserId === myUserId ? 'text-brand-primary' : 'text-emerald-300'}`}>
            {m.fromUserId === myUserId ? 'You' : m.fromName}
          </span>
          <span className="ml-2 text-[10px] text-white/30">
            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <div className="whitespace-pre-wrap break-words text-sm">{renderBody(m.body, m.mentions, myUserId)}</div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

/** Highlight @mentions; the local user's mention gets the accent color. */
function renderBody(body: string, mentions: string[] | undefined, myUserId: string) {
  const parts = body.split(/(@[\w][\w .-]*)/g);
  if (parts.length === 1) return body;
  const mentionsMe = (mentions ?? []).includes(myUserId);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className={mentionsMe ? 'rounded bg-brand-primary/40 px-0.5 font-semibold' : 'font-semibold text-brand-secondary'}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function Composer({ activeKey, spaceId }: { activeKey: ConversationKey; spaceId: string }) {
  const [text, setText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const players = usePresenceStore((s) => s.players);
  const roster = useMemo(() => Object.values(players), [players]);

  const candidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return roster.filter((p) => p.name.toLowerCase().startsWith(q)).slice(0, 5);
  }, [mentionQuery, roster]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    // Resolve @Name occurrences against the roster → mentioned userIds.
    const mentions = roster.filter((p) => body.includes(`@${p.name}`)).map((p) => p.userId);

    if (activeKey === 'GLOBAL') {
      sendChat({ scope: ChatScope.GLOBAL, body, mentions });
    } else if (activeKey.startsWith('ROOM:')) {
      sendChat({ scope: ChatScope.ROOM, spaceId, body, mentions });
    } else if (activeKey.startsWith('DM:')) {
      sendChat({ scope: ChatScope.DIRECT, toUserId: activeKey.slice(3), body, mentions });
    }
    setText('');
    setMentionQuery(null);
  };

  const onChange = (value: string) => {
    setText(value);
    const match = /(?:^|\s)@([\w]*)$/.exec(value);
    setMentionQuery(match ? (match[1] ?? '') : null);
  };

  const insertMention = (name: string) => {
    setText((t) => t.replace(/@[\w]*$/, `@${name} `));
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  return (
    <div className="relative border-t border-white/10 p-2">
      {candidates.length > 0 && (
        <div className="absolute bottom-full left-2 mb-1 w-56 rounded-lg bg-black/90 p-1 backdrop-blur">
          {candidates.map((p) => (
            <button
              key={p.userId}
              onClick={() => insertMention(p.name)}
              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-white/10"
            >
              @{p.name}
            </button>
          ))}
        </div>
      )}
      <div className="mb-1 flex gap-1">
        {QUICK_EMOJIS.map((e) => (
          <button key={e} onClick={() => setText((t) => t + e)} className="rounded px-1 hover:bg-white/10">
            {e}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
            e.stopPropagation(); // never leak typing into avatar controls
          }}
          placeholder="Message… (@ to mention)"
          className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:bg-white/15"
        />
        <button onClick={send} className="rounded-lg bg-brand-primary px-3 text-sm transition hover:opacity-90">
          Send
        </button>
      </div>
    </div>
  );
}

async function fetchHistory(key: ConversationKey, spaceId: string, before?: string) {
  try {
    const query = key === 'GLOBAL'
      ? { scope: ChatScope.GLOBAL, before }
      : key.startsWith('ROOM:')
        ? { scope: ChatScope.ROOM, spaceId, before }
        : { scope: ChatScope.DIRECT, withUserId: key.slice(3), before };
    const history = await api.chatHistory(query);
    useChatStore.getState().prependHistory(key, history);
  } catch {
    useChatStore.getState().prependHistory(key, []); // mark loaded; live chat still works
  }
}
