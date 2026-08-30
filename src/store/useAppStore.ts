import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastMsg {
  id: number;
  type: ToastType;
  text: string;
}

interface AppState {
  toasts: ToastMsg[];
  toast: (text: string, type?: ToastType) => void;
  dismissToast: (id: number) => void;
}

let nextId = 1;

export const useAppStore = create<AppState>((set) => ({
  toasts: [],
  toast: (text, type = 'info') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, type, text }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
