import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../db/schema';
import { getDayNote, setDayNote, getAllDayNotes, dateOfKey } from './dayNotes';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

describe('dayNotes（当日备注）', () => {
  beforeEach(clearAll);

  it('写入后可读回', async () => {
    await setDayNote('2026-09-01', 'R2 曝气故障');
    expect(await getDayNote('2026-09-01')).toBe('R2 曝气故障');
    expect(await getDayNote('2026-09-02')).toBe('');
  });

  it('空内容会删除该条备注', async () => {
    await setDayNote('2026-09-01', 'abc');
    await setDayNote('2026-09-01', '   ');
    expect(await getDayNote('2026-09-01')).toBe('');
    expect(await db.settings.count()).toBe(0);
  });

  it('getAllDayNotes 返回全部（过滤空白）', async () => {
    await setDayNote('2026-09-01', '换水');
    await setDayNote('2026-09-02', '加高氯酸盐');
    const all = await getAllDayNotes();
    expect(all.get('2026-09-01')).toBe('换水');
    expect(all.get('2026-09-02')).toBe('加高氯酸盐');
  });

  it('key 前缀解析正确', () => {
    expect(dateOfKey('dayNote.2026-09-01')).toBe('2026-09-01');
    expect(dateOfKey('updateUrl')).toBeNull();
  });
});
