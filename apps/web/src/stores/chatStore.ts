import { create } from 'zustand';
import { ChatScope, type ChatMessageBroadcast } from '@mvs/shared';

/**
 * Conversation key: 'GLOBAL', `ROOM:<spaceId>`, or `DM:<otherUserId>` —
 * messages, unread counts, and the active tab are all keyed by it.
 */
export type ConversationKey = string;

export function conversationKeyFor(message: ChatMessageBroadcast, myUserId: string): ConversationKey {
  if (message.scope === ChatScope.GLOBAL) return 'GLOBAL';
  if (message.scope === ChatScope.ROOM) return `ROOM:${message.spaceId}`;
  const other = message.fromUserId === myUserId ? message.toUserId : message.fromUserId;
  return `DM:${other}`;
}

interface ChatState {
  open: boolean;
  activeKey: ConversationKey;
  /** Display names for DM conversations (key → other user's name). */
  dmNames: Record<string, string>;
  messages: Record<ConversationKey, ChatMessageBroadcast[]>;
  unread: Record<ConversationKey, number>;
  /** Keys whose history has been fetched (avoid refetch on tab switch). */
  loaded: Record<ConversationKey, boolean>;
  /** Bumped when the local user is @mentioned or DM'd while not looking. */
  pingVersion: number;

  setOpen: (open: boolean) => void;
  setActive: (key: ConversationKey) => void;
  openDm: (userId: string, name: string) => void;
  receive: (message: ChatMessageBroadcast, myUserId: string) => void;
  prependHistory: (key: ConversationKey, history: ChatMessageBroadcast[]) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  open: false,
  activeKey: 'GLOBAL',
  dmNames: {},
  messages: {},
  unread: {},
  loaded: {},
  pingVersion: 0,

  setOpen: (open) =>
    set((s) => ({
      open,
      unread: open ? { ...s.unread, [s.activeKey]: 0 } : s.unread,
    })),

  setActive: (key) => set((s) => ({ activeKey: key, unread: { ...s.unread, [key]: 0 } })),

  openDm: (userId, name) => {
    const key = `DM:${userId}`;
    set((s) => ({
      open: true,
      activeKey: key,
      dmNames: { ...s.dmNames, [key]: name },
      unread: { ...s.unread, [key]: 0 },
    }));
  },

  receive: (message, myUserId) => {
    const key = conversationKeyFor(message, myUserId);
    const s = get();
    const isVisible = s.open && s.activeKey === key;
    const mine = message.fromUserId === myUserId;
    const mentioned = (message.mentions ?? []).includes(myUserId);
    const isDm = message.scope === ChatScope.DIRECT;

    set((state) => ({
      messages: { ...state.messages, [key]: [...(state.messages[key] ?? []), message] },
      unread: isVisible || mine ? state.unread : { ...state.unread, [key]: (state.unread[key] ?? 0) + 1 },
      dmNames:
        isDm && !mine
          ? { ...state.dmNames, [key]: message.fromName }
          : state.dmNames,
      pingVersion: !mine && !isVisible && (mentioned || isDm) ? state.pingVersion + 1 : state.pingVersion,
    }));
  },

  prependHistory: (key, history) =>
    set((s) => {
      const existing = s.messages[key] ?? [];
      const known = new Set(existing.map((m) => m.id));
      const fresh = history.filter((m) => !known.has(m.id));
      return {
        messages: { ...s.messages, [key]: [...fresh, ...existing] },
        loaded: { ...s.loaded, [key]: true },
      };
    }),

  reset: () =>
    set({ open: false, activeKey: 'GLOBAL', messages: {}, unread: {}, loaded: {}, dmNames: {} }),
}));
