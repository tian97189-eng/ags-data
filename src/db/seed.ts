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
  {
    name: 'DO',
    category: 'basic',
    method: 'direct',
    unit: 'mg/L',
    defaultDilution: 1,
    refLow: null,
    refHigh: null,
    lod: null,
    active: true,
    sortOrder: 6,
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

/** 「其他指标」里 EPS 的 PS/PN 浓度指标：走标准曲线吸光度换算。
 * category='extras'：不出现在日常录入/全周期，只在「标准曲线」里建标曲，
 * EPS 页据此把吸光度换算成浓度。 */
const EXTRAS_INDICATORS: Omit<Indicator, 'id'>[] = [
  {
    name: 'PS（多糖）',
    category: 'extras',
    method: 'absorbance',
    unit: 'mg/L',
    defaultDilution: 1,
    refLow: null,
    refHigh: null,
    lod: null,
    active: true,
    sortOrder: 100,
  },
  {
    name: 'PN（蛋白质）',
    category: 'extras',
    method: 'absorbance',
    unit: 'mg/L',
    defaultDilution: 1,
    refLow: null,
    refHigh: null,
    lod: null,
    active: true,
    sortOrder: 101,
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

/**
 * 启动时同步内置数据 —— 不只在空时初始化，已存在的数据库也会"补齐缺失"。
 * 这样新增的内置指标（如下午加的"总氮"）对老用户自动可见。
 * 幂等：重复调用不会重复插入。
 */
export async function seedIfEmpty(): Promise<void> {
  const now = new Date().toISOString();

  // 1) 反应器：缺失的补齐（不删已有的）
  for (const r of DEFAULT_REACTORS) {
    const exists = await db.reactors.where('code').equals(r.code).first();
    if (!exists) await db.reactors.add({ ...r, createdAt: now });
  }

  // 2) 基础指标：缺失的补齐（用 name 判断）
  for (const ind of BUILTIN_INDICATORS) {
    const exists = await db.indicators.where('name').equals(ind.name).first();
    if (!exists) await db.indicators.add(ind);
  }

  // 3) 复合公式型内置指标（如总氮）：依赖其他指标 id，缺失的补齐
  for (const composite of BUILTIN_COMPOSITE_INDICATORS) {
    const exists = await db.indicators.where('name').equals(composite.name).first();
    if (exists) continue;
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

  // 3.5) 「其他指标」的吸光度指标（PS/PN）：缺失的补齐
  for (const ind of EXTRAS_INDICATORS) {
    const exists = await db.indicators.where('name').equals(ind.name).first();
    if (!exists) await db.indicators.add(ind);
  }

  // 4) 默认 settings
  for (const s of DEFAULT_SETTINGS) {
    if (!(await db.settings.get(s.key))) {
      await db.settings.put(s);
    }
  }
}
