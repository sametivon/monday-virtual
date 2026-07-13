import { create } from 'zustand';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

interface ConnectionState {
  status: ConnectionStatus;
  /** Reconnect attempt counter (resets on connect). */
  attempt: number;
  /** True when the server told us it's restarting (deploy) before dropping. */
  serverRestarting: boolean;
  set: (patch: Partial<Omit<ConnectionState, 'set'>>) => void;
}

/**
 * Realtime connection lifecycle, driven by useSpaceSocket. The UI reads this
 * to show the reconnect banner — outages (Render cold starts can take ~45s)
 * must never be silent.
 */
export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'connecting',
  attempt: 0,
  serverRestarting: false,
  set: (patch) => set(patch),
}));
