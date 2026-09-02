import { beforeEach, describe, it, expect } from 'vitest';
import { markBackupDone, maybePromptBackup } from './backupReminder';

beforeEach(() => {
  localStorage.clear();
});

function iso(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

describe('backupReminder（每周备份提醒）', () => {
  it('从未备份过 → 不提醒', () => {
    expect(maybePromptBackup(new Date())).toBe(false);
  });

  it('最近备份过（<7 天）→ 不提醒', () => {
    markBackupDoneAt(iso(3));
    expect(maybePromptBackup(new Date())).toBe(false);
  });

  it('备份超过 7 天 → 提醒一次（当天不重复提醒）', () => {
    markBackupDoneAt(iso(8));
    expect(maybePromptBackup(new Date())).toBe(true);
    expect(maybePromptBackup(new Date())).toBe(false); // 同一天第二次不提醒
  });

  it('提醒后再导出备份 → 重置计时不再提醒', () => {
    markBackupDoneAt(iso(10));
    expect(maybePromptBackup(new Date())).toBe(true);
    markBackupDone(); // 用户导出备份
    expect(maybePromptBackup(new Date())).toBe(false); // 当天已提醒过但已备份 → 不重复
  });
});

// 帮助函数：写入固定日期的 lastDone（绕开内部私有 key）
function markBackupDoneAt(now: Date): void {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  localStorage.setItem('backup.lastDoneAt', fmt(now));
}
