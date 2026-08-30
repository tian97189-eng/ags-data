import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../db/schema';
import { exportBackupData, backupToJson, jsonToBackup, importBackupData } from './backup';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

async function seedData() {
  const rid = await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
  });
  const iid = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  const cid = await db.curves.add({
    indicatorId: iid, effectiveFrom: '2026-08-01', effectiveTo: null,
    k: 0.3, b: 0.1, r2: 0.999, points: [], batchNo: '', note: '', createdAt: '',
  });
  const mid = await db.measurements.add({
    scene: 'daily', date: '2026-08-05', phase: null, reactorId: rid, indicatorId: iid,
    inputType: 'absorbance', sampleAbs: 0.284, blankAbs: 0.012, dilution: 10,
    value: 13.6, curveId: cid, blankOverridden: false, dilutionOverridden: false, note: '',
  });
  await db.settings.put({ key: 'intervalMinutes', value: 30 });
  return { rid, iid, cid, mid };
}

describe('backup', () => {
  beforeEach(clearAll);

  it('exportBackupData 包含所有表', async () => {
    await seedData();
    const b = await exportBackupData();
    expect(b.format).toBe('ags-backup');
    expect(b.data.reactors).toHaveLength(1);
    expect(b.data.measurements).toHaveLength(1);
    expect(b.data.settings).toHaveLength(1);
  });

  it('backupToJson / jsonToBackup round-trip', async () => {
    const b = await exportBackupData();
    const json = backupToJson(b);
    const parsed = jsonToBackup(json);
    expect(parsed.format).toBe('ags-backup');
    expect(parsed.data.reactors).toHaveLength(b.data.reactors.length);
  });

  it('jsonToBackup 拒绝非法文件', () => {
    expect(() => jsonToBackup('{"foo":1}')).toThrow();
    expect(() => jsonToBackup('not json')).toThrow();
  });

  it('覆盖导入后数据完全一致（数据保真）', async () => {
    const { cid } = await seedData();
    const backup = await exportBackupData();
    const before = await db.measurements.toArray();

    for (const t of db.tables) await t.clear();
    expect(await db.measurements.count()).toBe(0);

    const report = await importBackupData(backup, 'overwrite');
    expect(report.overwritten).toBe(true);

    const after = await db.measurements.toArray();
    expect(after).toHaveLength(before.length);
    expect(after[0].value).toBe(13.6);
    expect(after[0].curveId).toBe(cid);
    expect(after[0].sampleAbs).toBe(0.284);
  });

  it('合并导入只新增不重复', async () => {
    const { rid, iid, cid } = await seedData();
    const backup = await exportBackupData();

    backup.data.reactors.push({
      code: 'R2', name: 'R2', note: '', active: true, sortOrder: 2, createdAt: '',
    });
    backup.data.measurements.push({
      scene: 'daily', date: '2026-08-06', phase: null, reactorId: rid, indicatorId: iid,
      inputType: 'absorbance', sampleAbs: 0.5, blankAbs: 0.012, dilution: 10,
      value: 24.4, curveId: cid, blankOverridden: false, dilutionOverridden: false, note: '',
    });

    const report = await importBackupData(backup, 'merge');
    expect(report.overwritten).toBe(false);

    const reactors = await db.reactors.toArray();
    expect(reactors.some((r) => r.code === 'R2')).toBe(true);
    // R1 不重复
    expect(reactors.filter((r) => r.code === 'R1')).toHaveLength(1);
    // 8-05 不重复，8-06 新增
    expect(await db.measurements.where('date').equals('2026-08-05').count()).toBe(1);
    expect(await db.measurements.where('date').equals('2026-08-06').count()).toBe(1);
  });
});
