import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastMsg {
  id: number;
  type: ToastType;
  text: string;
}

export type Theme = 'light' | 'dark' | 'system';

interface AppState {
  toasts: ToastMsg[];
  toast: (text: string, type?: ToastType) => void;
  dismissToast: (id: number) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const THEME_KEY = 'ags-theme';

function readInitialTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(THEME_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
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
  theme: readInitialTheme(),
  setTheme: (t) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* localStorage 可能不可用（隐私模式），忽略 */
    }
    set({ theme: t });
  },
}));

/** 把 theme 解析为实际是否深色：'dark' 或 'system' 且系统偏好深色 */
export function resolveDark(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
