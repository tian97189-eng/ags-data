import { beforeEach, describe, it, expect } from 'vitest';
import { db } from './schema';

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

describe('AgsDB schema', () => {
  beforeEach(clearAll);

  it('包含 14 张表（9 业务表 + 5 其他指标表）', () => {
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'curves',
        'customRecords',
        'cycles',
        'defaults',
        'epsRecords',
        'indicators',
        'influents',
        'measurements',
        'mlssRecords',
        'particleSizeRanges',
        'particleSizeRecords',
        'reactors',
        'settings',
        'sviRecords',
      ].sort(),
    );
  });

  it('能写入并读取反应器', async () => {
    const id = await db.reactors.add({
      code: 'R1',
      name: 'R1',
      note: '',
      active: true,
      sortOrder: 1,
      createdAt: 'x',
    });
    const r = await db.reactors.get(id);
    expect(r?.code).toBe('R1');
  });

  it('settings 用 key 作主键，重复写入覆盖', async () => {
    await db.settings.put({ key: 'a', value: 1 });
    await db.settings.put({ key: 'a', value: 2 });
    expect(await db.settings.count()).toBe(1);
    expect((await db.settings.get('a'))?.value).toBe(2);
  });

  it('measurements 能存一条完整记录', async () => {
    const id = await db.measurements.add({
      scene: 'daily',
      date: '2026-08-30',
      phase: null,
      reactorId: 1,
      indicatorId: 1,
      inputType: 'absorbance',
      sampleAbs: 0.284,
      blankAbs: 0.012,
      dilution: 10,
      value: 13.6,
      curveId: 7,
      blankOverridden: false,
      dilutionOverridden: false,
      note: '',
    });
    const m = await db.measurements.get(id);
    expect(m?.value).toBe(13.6);
    expect(m?.curveId).toBe(7);
  });
});
