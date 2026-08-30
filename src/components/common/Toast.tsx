import { useAppStore } from '../../store/useAppStore';

const TYPE_STYLE: Record<string, string> = {
  info: 'bg-slate-700',
  success: 'bg-teal-600',
  warning: 'bg-amber-600',
  error: 'bg-red-600',
};

export default function Toast() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);

  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`${TYPE_STYLE[t.type]} text-white text-xs rounded-lg px-3 py-2 shadow-sm max-w-xs text-left`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
