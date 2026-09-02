import type { ReactNode } from 'react';

export default function PageHeader({
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
      <div>
        <h1 className="text-lg font-medium flex items-center gap-2">
          <span className="inline-block w-1 h-4 rounded-full bg-brand-600"></span>
          {title}
        </h1>
        {desc && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
