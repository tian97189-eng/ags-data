import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db/schema';
import { exportBackupData, backupToJson, importOverwrite } from '../../lib/backup';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

describe('实验记录（ExperimentRecord）', () => {
  beforeEach(clearAll);

  it('保存记录（含指标快照和照片 base64），能读回', async () => {
    const id = await db.experimentRecords.add({
      date: '2026-09-02',
      title: '第 3 天：换水 + 加碳源',
      content: '换了 1L 进水，加了 0.5g 碳源。',
      indicators: ['氨氮', 'COD'],
      photos: ['data:image/jpeg;base64,abc123'],
      createdAt: 'x',
    });
    const r = await db.experimentRecords.get(id);
    expect(r?.title).toBe('第 3 天：换水 + 加碳源');
    expect(r?.indicators).toEqual(['氨氮', 'COD']);
    expect(r?.photos[0]).toContain('data:image/');
  });

  it('照片 base64 可进备份 JSON（可序列化，不会变 {}）', async () => {
    await db.experimentRecords.add({
      date: '2026-09-02',
      title: '带照片记录',
      content: '',
      indicators: [],
      photos: ['data:image/png;base64,iVBORw0KGgo='],
      createdAt: 'x',
    });
    const backup = await exportBackupData();
    const json = backupToJson(backup);
    // base64 字符串原样保留在 JSON 里
    expect(json).toContain('data:image/png;base64,iVBORw0KGgo=');
    expect(json).not.toContain('"photos":[{}]');
  });

  it('备份导入后照片仍在（round-trip）', async () => {
    await db.experimentRecords.add({
      date: '2026-09-01',
      title: '初始',
      content: '',
      indicators: ['SVI30'],
      photos: ['data:image/jpeg;base64,xyz'],
      createdAt: 'x',
    });
    const backup = await exportBackupData();
    const json = backupToJson(backup);
    await importOverwrite(JSON.parse(json) as Parameters<typeof importOverwrite>[0]);
    const all = await db.experimentRecords.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].photos[0]).toBe('data:image/jpeg;base64,xyz');
    expect(all[0].indicators).toEqual(['SVI30']);
  });

  it('按日期倒序读取（时间线用）', async () => {
    await db.experimentRecords.bulkAdd([
      { date: '2026-09-01', title: '早', content: '', indicators: [], photos: [], createdAt: 'a' },
      { date: '2026-09-03', title: '晚', content: '', indicators: [], photos: [], createdAt: 'b' },
    ]);
    const list = await db.experimentRecords.orderBy('date').reverse().toArray();
    expect(list[0].title).toBe('晚');
    expect(list[1].title).toBe('早');
  });
});
