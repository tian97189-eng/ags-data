import { db } from '../db/schema';

/**
 * 当日备注：跟随日期的文字批注（如"R2 曝气故障""下午加高氯酸盐"）。
 * 存在 settings 表（key = `dayNote.<date>`），自动进备份。
 */

const PREFIX = 'dayNote.';

export function keyOf(date: string): string {
  return PREFIX + date;
}

export function dateOfKey(key: string): string | null {
  return key.startsWith(PREFIX) ? key.slice(PREFIX.length) : null;
}

export async function getDayNote(date: string): Promise<string> {
  const s = await db.settings.get(keyOf(date));
  return typeof s?.value === 'string' ? s.value : '';
}

/** 所有备注：date → note（升序） */
export async function getAllDayNotes(): Promise<Map<string, string>> {
  const all = await db.settings.toArray();
  const map = new Map<string, string>();
  for (const s of all) {
    const d = dateOfKey(s.key);
    if (d && typeof s.value === 'string' && s.value.trim()) map.set(d, s.value);
  }
  return map;
}

/** 写入/清空（note 为空则删除该条） */
export async function setDayNote(date: string, note: string): Promise<void> {
  const key = keyOf(date);
  if (!note.trim()) {
    await db.settings.delete(key);
    return;
  }
  await db.settings.put({ key, value: note.trim() });
}
