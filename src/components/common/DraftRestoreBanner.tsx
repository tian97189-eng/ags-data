/**
 * 草稿恢复条：检测到未完成的录入草稿时提示，用户可「恢复」或「丢弃」。
 * Entry/OtherEntry/Cycle/Experiment 等录入页共用，样式一致。
 */

function fmtSavedAt(savedAt?: number): string {
  if (!savedAt) return '';
  try {
    const d = new Date(savedAt);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return sameDay ? `今天 ${hm}` : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  } catch {
    return '';
  }
}

export default function DraftRestoreBanner({
  note = '录入',
  savedAt,
  onRestore,
  onDiscard,
}: {
  /** 文案提示，如「全周期」「他人数据」 */
  note?: string;
  savedAt?: number;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap rounded-md border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 mb-3 text-[13px]">
      <span className="text-amber-800 dark:text-amber-200">
        检测到未完成的{note}草稿{fmtSavedAt(savedAt) ? `（${fmtSavedAt(savedAt)}）` : ''}，要恢复吗？
      </span>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onRestore}
        className="px-3 py-1 rounded bg-amber-600 text-white hover:bg-amber-700"
      >
        恢复草稿
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="px-3 py-1 rounded border border-amber-300 dark:border-amber-500/50 text-amber-800 dark:text-amber-200"
      >
        丢弃
      </button>
    </div>
  );
}
