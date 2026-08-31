import { db, type Indicator, type Reactor } from './schema';

const BUILTIN_INDICATORS: Omit<Indicator, 'id'>[] = [
  {
    name: '氨氮',
    category: 'basic',
    method: 'absorbance',
    unit: 'mg/L',
    defaultDilution: 10,
    refLow: null,
    refHigh: null,
    lod: null,
    active: true,
    sortOrder: 1,
  },
  {
    name: '硝态氮',
    category: 'basic',
    method: 'absorbance',
    unit: 'mg/L',
    defaultDilution: 5,
    refLow: null,
    refHigh: null,
    lod: null,
    active: true,
    sortOrder: 2,
  },
  {
    name: '亚硝态氮',
    category: 'basic',
    method: 'absorbance',
    unit: 'mg/L',
    defaultDilution: 5,
    refLow: null,
    refHigh: null,
    lod: null,
    active: true,
    sortOrder: 3,
  },
  {
    name: '总P',
    category: 'basic',
    method: 'absorbance',
    unit: 'mg/L',
    defaultDilution: 1,
    refLow: null,
    refHigh: null,
    lod: null,
    active: true,
    sortOrder: 4,
  },
  {
    name: 'COD',
    category: 'basic',
    method: 'direct',
    unit: 'mg/L',
    defaultDilution: 1,
    refLow: null,
    refHigh: null,
    lod: null,
    active: true,
    sortOrder: 5,
  },
];

/** 复合公式型内置指标（依赖其他指标 id，先插入基础指标再插入这些） */
const BUILTIN_COMPOSITE_INDICATORS: Omit<Indicator, 'id' | 'compositeRefs'>[] = [
  // 总氮：氨氮 + 亚硝态氮 + 硝态氮，sortOrder 放在三氮后
  {
    name: '总氮',
    category: 'basic',
    method: 'absorbance',
    unit: 'mg/L',
    defaultDilution: 1,
    refLow: null,
    refHigh: null,
    lod: null,
    active: true,
    sortOrder: 3.5,
  },
];

const DEFAULT_REACTORS: Omit<Reactor, 'id'>[] = [
  { code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '' },
  { code: 'R2', name: 'R2', note: '', active: true, sortOrder: 2, createdAt: '' },
  { code: 'R3', name: 'R3', note: '', active: true, sortOrder: 3, createdAt: '' },
];

const DEFAULT_SETTINGS: { key: string; value: unknown }[] = [
  { key: 'intervalMinutes', value: 30 },
  { key: 'influentMode', value: 'shared' },
  { key: 'targetValue', value: 2 },
];

/** 首次启动时初始化内置数据；幂等，重复调用不会重复插入 */
export async function seedIfEmpty(): Promise<void> {
  if ((await db.indicators.count()) === 0) {
    const now = new Date().toISOString();
    // 先插入基础指标（无 compositeType）
    await db.indicators.bulkAdd(BUILTIN_INDICATORS);

    // 再插入复合公式型指标（如总氮 = 三氮求和）
    for (const composite of BUILTIN_COMPOSITE_INDICATORS) {
      if (composite.name === '总氮') {
        const nh4 = await db.indicators.where('name').equals('氨氮').first();
        const no3 = await db.indicators.where('name').equals('硝态氮').first();
        const no2 = await db.indicators.where('name').equals('亚硝态氮').first();
        if (nh4?.id && no2?.id && no3?.id) {
          await db.indicators.add({
            ...composite,
            compositeType: 'sumOf',
            compositeRefs: [nh4.id, no2.id, no3.id],
          });
        }
      } else {
        await db.indicators.add(composite);
      }
    }

    await db.reactors.bulkAdd(
      DEFAULT_REACTORS.map((r) => ({ ...r, createdAt: now })),
    );
  }

  for (const s of DEFAULT_SETTINGS) {
    if (!(await db.settings.get(s.key))) {
      await db.settings.put(s);
    }
  }
}
