export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确定',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl p-5 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-medium">{title}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs rounded-md text-white ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
