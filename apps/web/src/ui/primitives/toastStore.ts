import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastKind, message: string, duration?: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message, duration = 6000) =>
    set((s) => ({
      // Dedupe identical back-to-back messages (reconnect loops etc.).
      toasts: s.toasts.some((t) => t.message === message && t.kind === kind)
        ? s.toasts
        : [...s.toasts.slice(-3), { id: nextId++, kind, message, duration }],
    })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative API — usable from stores/controllers, not just components. */
export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().push('success', message, duration),
  error: (message: string, duration?: number) =>
    useToastStore.getState().push('error', message, duration),
  info: (message: string, duration?: number) =>
    useToastStore.getState().push('info', message, duration),
};
