import type { ReactNode } from 'react';

export default function Chip({
  active = false,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-md border transition-colors ${
        active
          ? 'bg-brand-50 border-brand-200 text-brand-800 font-medium'
          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:border-slate-600'
      }`}
    >
      {children}
    </button>
  );
}
