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
    await db.indicators.bulkAdd(BUILTIN_INDICATORS);
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
