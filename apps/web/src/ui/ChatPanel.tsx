'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Globe, MapPin, MessageCircle, MessagesSquare, X } from 'lucide-react';
import { ChatScope, type ChatMessageBroadcast } from '@mvs/shared';
import { api } from '@/lib/api';
import { sendChat } from '@/realtime/useSpaceSocket';
import { useChatStore, type ConversationKey } from '@/stores/chatStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useSessionStore } from '@/stores/sessionStore';
import { Button, EmptyState, IconButton, Panel, Tooltip } from '@/ui/primitives';

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
        className={`absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
          flash
            ? 'animate-pulse bg-brand-primary text-white shadow-e2'
            : 'glass text-brand-text hover:shadow-e2'
        }`}
      >
        <MessageCircle size={15} strokeWidth={1.75} aria-hidden="true" />
        Chat
        {totalUnread > 0 && (
          <span className="rounded-full bg-brand-primary px-2 py-0.5 text-xs font-semibold text-white">
            {totalUnread}
          </span>
        )}
      </button>
    );
  }

  const dmKeys = Object.keys(dmNames);

  return (
    <Panel
      variant="glass-strong"
      padding="none"
      className="absolute bottom-4 left-4 top-20 flex w-[330px] flex-col overflow-hidden"
    >
      <div className="flex items-center gap-1 overflow-x-auto border-b border-line/10 p-2">
        <Tab icon={MapPin} label="Space" k={roomKey} activeKey={activeKey} unread={unread} onSelect={setActive} />
        <Tab icon={Globe} label="Global" k="GLOBAL" activeKey={activeKey} unread={unread} onSelect={setActive} />
        {dmKeys.map((k) => (
          <Tab key={k} label={`@${dmNames[k]}`} k={k} activeKey={activeKey} unread={unread} onSelect={setActive} />
        ))}
        <Tooltip label="Close chat" className="ml-auto">
          <IconButton icon={X} aria-label="Close chat" size="sm" onClick={() => setOpen(false)} />
        </Tooltip>
      </div>

      <MessageList messages={messages[activeKey] ?? []} myUserId={me.user.id} activeKey={activeKey} spaceId={spaceId} />

      <Composer activeKey={activeKey} spaceId={spaceId} />
    </Panel>
  );
}

function Tab({
  icon: Ico,
  label,
  k,
  activeKey,
  unread,
  onSelect,
}: {
  icon?: LucideIcon;
  label: string;
  k: ConversationKey;
  activeKey: ConversationKey;
  unread: Record<string, number>;
  onSelect: (k: ConversationKey) => void;
}) {
  const count = unread[k] ?? 0;
  const active = activeKey === k;
  return (
    <button
      onClick={() => onSelect(k)}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active
          ? 'bg-brand-primary text-white shadow-e1'
          : 'text-brand-text/60 hover:bg-line/8 hover:text-brand-text'
      }`}
    >
      {Ico && <Ico size={14} strokeWidth={1.75} aria-hidden="true" />}
      {label}
      {count > 0 && (
        <span
          className={`rounded-full px-1.5 py-px text-[10px] font-semibold text-white ${
            k.startsWith('DM:') ? 'bg-danger' : 'bg-brand-primary'
          }`}
        >
          {count}
        </span>
      )}
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
        <Button
          variant="subtle"
          size="sm"
          className="mb-2 w-full"
          onClick={() => void fetchHistory(activeKey, spaceId, messages[0]?.createdAt)}
        >
          Load earlier
        </Button>
      )}
      {messages.length === 0 && (
        <EmptyState
          icon={MessagesSquare}
          title="No messages yet"
          body="Say hi — messages in this conversation show up here."
        />
      )}
      {messages.map((m) => (
        <div key={m.id} className="mb-2">
          <span
            className={`text-xs font-semibold ${
              m.fromUserId === myUserId ? 'text-brand-primary' : 'text-success'
            }`}
          >
            {m.fromUserId === myUserId ? 'You' : m.fromName}
          </span>
          <span className="ml-2 text-[10px] text-brand-text/40">
            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <div className="whitespace-pre-wrap break-words text-sm text-brand-text">
            {renderBody(m.body, m.mentions, myUserId)}
          </div>
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
      <span
        key={i}
        className={
          mentionsMe
            ? 'rounded-sm bg-brand-primary/15 px-0.5 font-semibold text-brand-primary'
            : 'font-semibold text-brand-secondary'
        }
      >
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
    <div className="relative border-t border-line/10 p-2">
      {candidates.length > 0 && (
        <div className="glass-strong absolute bottom-full left-2 mb-1 w-56 rounded-md p-1">
          {candidates.map((p) => (
            <button
              key={p.userId}
              onClick={() => insertMention(p.name)}
              className="block w-full rounded-sm px-2 py-1 text-left text-sm text-brand-text hover:bg-line/8"
            >
              @{p.name}
            </button>
          ))}
        </div>
      )}
      <div className="mb-1 flex gap-1">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => setText((t) => t + e)}
            aria-label={`Insert ${e}`}
            className="rounded-sm px-1 transition hover:bg-line/8"
          >
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
          className="min-w-0 flex-1 rounded-md border border-line/15 bg-brand-bg px-3 py-2 text-sm text-brand-text outline-none placeholder:text-brand-text/40 focus:border-brand-primary/40 focus:ring-2 focus:ring-brand-primary/25"
        />
        <Button variant="accent" onClick={send}>
          Send
        </Button>
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
