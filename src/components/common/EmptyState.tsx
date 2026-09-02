import type { ReactNode } from 'react';

export default function EmptyState({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
      {desc && <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm">{desc}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
