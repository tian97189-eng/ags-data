import { beforeEach, describe, it, expect } from 'vitest';
import { db } from './schema';
import { seedIfEmpty } from './seed';

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

describe('seedIfEmpty', () => {
  beforeEach(clearAll);

  it('首次初始化 7 个指标（含总氮、DO）和 3 个反应器', async () => {
    await seedIfEmpty();
    expect(await db.indicators.count()).toBe(7);
    expect(await db.reactors.count()).toBe(3);
  });

  it('幂等：重复调用不重复插入', async () => {
    await seedIfEmpty();
    await seedIfEmpty();
    await seedIfEmpty();
    expect(await db.indicators.count()).toBe(7);
    expect(await db.reactors.count()).toBe(3);
  });

  it('内置指标计量方式正确：氨氮为吸光度，COD/DO 为直读', async () => {
    await seedIfEmpty();
    const all = await db.indicators.toArray();
    expect(all.find((i) => i.name === '氨氮')?.method).toBe('absorbance');
    expect(all.find((i) => i.name === 'COD')?.method).toBe('direct');
    expect(all.find((i) => i.name === 'DO')?.method).toBe('direct');
    expect(
      all.filter((i) => i.method === 'absorbance').map((i) => i.name).sort(),
    ).toEqual(['亚硝态氮', '总P', '总氮', '氨氮', '硝态氮'].sort());
  });

  it('总氮是复合公式型指标，依赖氨氮/亚硝态氮/硝态氮', async () => {
    await seedIfEmpty();
    const total = await db.indicators.where('name').equals('总氮').first();
    expect(total).toBeDefined();
    expect(total?.compositeType).toBe('sumOf');
    expect(total?.compositeRefs).toHaveLength(3);
    const nh4 = await db.indicators.where('name').equals('氨氮').first();
    const no2 = await db.indicators.where('name').equals('亚硝态氮').first();
    const no3 = await db.indicators.where('name').equals('硝态氮').first();
    expect(total?.compositeRefs).toEqual([nh4!.id, no2!.id, no3!.id]);
  });

  it('写入默认设置', async () => {
    await seedIfEmpty();
    expect((await db.settings.get('intervalMinutes'))?.value).toBe(30);
    expect((await db.settings.get('influentMode'))?.value).toBe('shared');
    expect((await db.settings.get('targetValue'))?.value).toBe(2);
  });

  it('【升级场景】已有 5 个基础指标（无总氮/DO）时调 seedIfEmpty → 自动补加总氮和 DO', async () => {
    // 模拟老用户：5 个基础指标，但没总氮、没 DO（升级前装的版本）
    await db.indicators.bulkAdd([
      { name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
        defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1 },
      { name: '硝态氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
        defaultDilution: 5, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 2 },
      { name: '亚硝态氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
        defaultDilution: 5, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 3 },
      { name: '总P', category: 'basic', method: 'absorbance', unit: 'mg/L',
        defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 4 },
      { name: 'COD', category: 'basic', method: 'direct', unit: 'mg/L',
        defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 5 },
    ]);
    expect(await db.indicators.count()).toBe(5); // 起始只有 5 个
    expect(await db.indicators.where('name').equals('总氮').first()).toBeUndefined();
    expect(await db.indicators.where('name').equals('DO').first()).toBeUndefined();

    // 升级：调一次 seed
    await seedIfEmpty();

    // 现在应该有 7 个（补上总氮和 DO）
    expect(await db.indicators.count()).toBe(7);
    const total = await db.indicators.where('name').equals('总氮').first();
    expect(total).toBeDefined();
    expect(total?.compositeType).toBe('sumOf');
    const doInd = await db.indicators.where('name').equals('DO').first();
    expect(doInd).toBeDefined();
    expect(doInd?.method).toBe('direct');
    const nh4 = await db.indicators.where('name').equals('氨氮').first();
    const no2 = await db.indicators.where('name').equals('亚硝态氮').first();
    const no3 = await db.indicators.where('name').equals('硝态氮').first();
    expect(total?.compositeRefs).toEqual([nh4!.id, no2!.id, no3!.id]);
  });

  it('【升级场景】缺反应器时补齐（如新增了第 4 个反应器）', async () => {
    await db.reactors.add({ code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' });
    expect(await db.reactors.count()).toBe(1);

    await seedIfEmpty();

    expect(await db.reactors.count()).toBe(3); // R2 / R3 被补上
    const codes = (await db.reactors.toArray()).map((r) => r.code).sort();
    expect(codes).toEqual(['R1', 'R2', 'R3']);
  });
});
