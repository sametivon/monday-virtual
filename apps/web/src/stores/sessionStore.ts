import { create } from 'zustand';
import type { MeResponse } from '@mvs/shared';

type SessionStatus = 'idle' | 'authenticating' | 'ready' | 'error';

interface SessionState {
  status: SessionStatus;
  error: string | null;
  me: MeResponse | null;
  setStatus: (status: SessionStatus, error?: string | null) => void;
  setMe: (me: MeResponse) => void;
  patchUser: (partial: Partial<MeResponse['user']>) => void;
  patchBranding: (branding: MeResponse['tenant']['branding']) => void;
  hasPermission: (perm: string) => boolean;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'idle',
  error: null,
  me: null,
  setStatus: (status, error = null) => set({ status, error }),
  setMe: (me) => set({ me, status: 'ready' }),
  patchUser: (partial) =>
    set((s) => (s.me ? { me: { ...s.me, user: { ...s.me.user, ...partial } } } : s)),
  patchBranding: (branding) =>
    set((s) => (s.me ? { me: { ...s.me, tenant: { ...s.me.tenant, branding } } } : s)),
  hasPermission: (perm) => get().me?.permissions.includes(perm) ?? false,
}));
