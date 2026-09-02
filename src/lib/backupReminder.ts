/**
 * 定期备份提醒：数据纯本地，每周首次打开提醒导出一份备份。
 * - markBackupDone(): 用户导出备份后记录当天
 * - maybePromptBackup(): 距上次备份 ≥7 天且今天未提醒过 → true（并记录今天已提醒）
 */
const KEY_DONE = 'backup.lastDoneAt';
const KEY_PROMPT = 'backup.lastPromptAt';
const INTERVAL_DAYS = 7;

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function diffDays(a: string, b: string): number {
  const ta = new Date(a + 'T00:00:00').getTime();
  const tb = new Date(b + 'T00:00:00').getTime();
  return Math.round((tb - ta) / 86_400_000);
}

export function markBackupDone(): void {
  localStorage.setItem(KEY_DONE, todayStr());
}

/** 是否需要弹一次备份提醒（会消耗当天的提醒配额） */
export function maybePromptBackup(now = new Date()): boolean {
  const done = localStorage.getItem(KEY_DONE);
  if (!done) return false; // 从未备份过：不打扰，等用户自己上手
  const today = todayStr();
  if (localStorage.getItem(KEY_PROMPT) === today) return false;
  if (diffDays(done, today) >= INTERVAL_DAYS) {
    localStorage.setItem(KEY_PROMPT, today);
    return true;
  }
  return false;
}
