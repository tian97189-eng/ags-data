import { beforeEach, describe, it, expect } from 'vitest';
import { db } from './schema';
import { seedIfEmpty } from './seed';

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

describe('seedIfEmpty', () => {
  beforeEach(clearAll);

  it('首次初始化 6 个指标（含总氮）和 3 个反应器', async () => {
    await seedIfEmpty();
    expect(await db.indicators.count()).toBe(6);
    expect(await db.reactors.count()).toBe(3);
  });

  it('幂等：重复调用不重复插入', async () => {
    await seedIfEmpty();
    await seedIfEmpty();
    await seedIfEmpty();
    expect(await db.indicators.count()).toBe(6);
    expect(await db.reactors.count()).toBe(3);
  });

  it('内置指标计量方式正确：氨氮为吸光度，COD 为直读', async () => {
    await seedIfEmpty();
    const all = await db.indicators.toArray();
    expect(all.find((i) => i.name === '氨氮')?.method).toBe('absorbance');
    expect(all.find((i) => i.name === 'COD')?.method).toBe('direct');
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
});
