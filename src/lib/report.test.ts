import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../db/schema';
import { seedIfEmpty } from '../db/seed';
import { collectReportData, dataUrlToUint8 } from './report';
import { buildDocx } from './reportDocx';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

/** 按名称找指标 id */
async function indId(name: string): Promise<number> {
  const i = await db.indicators.where('name').equals(name).first();
  if (!i?.id) throw new Error(`指标 ${name} 不存在`);
  return i.id;
}

/** 按编号找罐 id */
async function rId(code: string): Promise<number> {
  const r = await db.reactors.where('code').equals(code).first();
  if (!r?.id) throw new Error(`罐 ${code} 不存在`);
  return r.id;
}

async function addMeasurement(p: {
  date: string;
  reactorId: number;
  indicatorId: number;
  value: number;
  scene?: 'daily' | 'cycle';
}) {
  await db.measurements.add({
    scene: p.scene ?? 'daily',
    date: p.date,
    phase: null,
    reactorId: p.reactorId,
    indicatorId: p.indicatorId,
    inputType: 'direct',
    sampleAbs: null,
    blankAbs: null,
    dilution: null,
    value: p.value,
    curveId: null,
    blankOverridden: false,
    dilutionOverridden: false,
    note: '',
  });
}

describe('collectReportData', () => {
  beforeEach(async () => {
    await clearAll();
    await seedIfEmpty();
  });

  it('基础统计：条数/均值/标准差/最值正确', async () => {
    const [nh4, r1, r2] = [await indId('氨氮'), await rId('R1'), await rId('R2')];
    await addMeasurement({ date: '2026-08-01', reactorId: r1, indicatorId: nh4, value: 10 });
    await addMeasurement({ date: '2026-08-02', reactorId: r1, indicatorId: nh4, value: 12 });
    await addMeasurement({ date: '2026-08-03', reactorId: r1, indicatorId: nh4, value: 14 });
    await addMeasurement({ date: '2026-08-01', reactorId: r2, indicatorId: nh4, value: 20 });
    await addMeasurement({ date: '2026-08-02', reactorId: r2, indicatorId: nh4, value: 24 });

    const data = await collectReportData({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-03',
      reactorIds: [r1, r2],
      indicatorIds: [nh4],
    });

    expect(data.dailyCount).toBe(5);
    expect(data.reactorCodes).toEqual(['R1', 'R2']);
    const sec = data.sections[0];
    expect(sec.indicatorName).toBe('氨氮');
    const s1 = sec.stats.find((s) => s.reactorCode === 'R1')!;
    expect(s1.count).toBe(3);
    expect(s1.mean).toBe(12);
    expect(s1.stdev).toBe(2);
    expect(s1.min).toBe(10);
    expect(s1.max).toBe(14);
    const s2 = sec.stats.find((s) => s.reactorCode === 'R2')!;
    expect(s2.count).toBe(2);
    expect(s2.mean).toBe(22);
  });

  it('shared 进水：逐日去除率平均；缺进水的那天不算', async () => {
    const [nh4, r1] = [await indId('氨氮'), await rId('R1')];
    // shared 进水：reactorId = null
    await db.influents.add({
      date: '2026-08-01', mode: 'shared', reactorId: null, indicatorId: nh4,
      inputType: 'direct', sampleAbs: null, blankAbs: null, dilution: null,
      value: 100, curveId: null,
    });
    await db.influents.add({
      date: '2026-08-02', mode: 'shared', reactorId: null, indicatorId: nh4,
      inputType: 'direct', sampleAbs: null, blankAbs: null, dilution: null,
      value: 80, curveId: null,
    });
    // 出水：8-01 有进水；8-02 有进水；8-03 无进水
    await addMeasurement({ date: '2026-08-01', reactorId: r1, indicatorId: nh4, value: 20 });
    await addMeasurement({ date: '2026-08-02', reactorId: r1, indicatorId: nh4, value: 16 });
    await addMeasurement({ date: '2026-08-03', reactorId: r1, indicatorId: nh4, value: 8 });

    const data = await collectReportData({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-03',
      reactorIds: [r1],
      indicatorIds: [nh4],
    });
    const s = data.sections[0].stats[0];
    // (100-20)/100=80%；(80-16)/80=80%；8-03 无进水不算 → 平均 80
    expect(s.removalRate).toBe(80);
  });

  it('进水缺失：removalRate 为 null（不按 0 计）', async () => {
    const [nh4, r1] = [await indId('氨氮'), await rId('R1')];
    await addMeasurement({ date: '2026-08-01', reactorId: r1, indicatorId: nh4, value: 20 });
    const data = await collectReportData({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-01',
      reactorIds: [r1],
      indicatorIds: [nh4],
    });
    expect(data.sections[0].stats[0].removalRate).toBeNull();
  });

  it('perReactor 进水：各罐按各自进水算去除率', async () => {
    const [nh4, r1, r2] = [await indId('氨氮'), await rId('R1'), await rId('R2')];
    await db.influents.add({
      date: '2026-08-01', mode: 'perReactor', reactorId: r1, indicatorId: nh4,
      inputType: 'direct', sampleAbs: null, blankAbs: null, dilution: null,
      value: 100, curveId: null,
    });
    await db.influents.add({
      date: '2026-08-01', mode: 'perReactor', reactorId: r2, indicatorId: nh4,
      inputType: 'direct', sampleAbs: null, blankAbs: null, dilution: null,
      value: 50, curveId: null,
    });
    await addMeasurement({ date: '2026-08-01', reactorId: r1, indicatorId: nh4, value: 20 });
    await addMeasurement({ date: '2026-08-01', reactorId: r2, indicatorId: nh4, value: 20 });

    const data = await collectReportData({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-01',
      reactorIds: [r1, r2],
      indicatorIds: [nh4],
    });
    const s1 = data.sections[0].stats.find((s) => s.reactorCode === 'R1')!;
    const s2 = data.sections[0].stats.find((s) => s.reactorCode === 'R2')!;
    expect(s1.removalRate).toBe(80); // (100-20)/100
    expect(s2.removalRate).toBe(60); // (50-20)/50
  });

  it('NAR：亚硝态氮/(亚硝态氮+硝态氮)，同一天两者都有才算', async () => {
    const [no2, no3, r1] = [await indId('亚硝态氮'), await indId('硝态氮'), await rId('R1')];
    await addMeasurement({ date: '2026-08-01', reactorId: r1, indicatorId: no2, value: 30 });
    await addMeasurement({ date: '2026-08-01', reactorId: r1, indicatorId: no3, value: 20 });
    await addMeasurement({ date: '2026-08-02', reactorId: r1, indicatorId: no2, value: 60 });
    await addMeasurement({ date: '2026-08-02', reactorId: r1, indicatorId: no3, value: 40 });
    // 8-03 只有亚硝态氮 → 不算
    await addMeasurement({ date: '2026-08-03', reactorId: r1, indicatorId: no2, value: 100 });

    const data = await collectReportData({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-03',
      reactorIds: [r1],
      indicatorIds: [no2, no3],
    });
    // 30/(30+20)=60%；60/(60+40)=60% → 平均 60
    expect(data.narRows).toHaveLength(1);
    expect(data.narRows[0].reactorCode).toBe('R1');
    expect(data.narRows[0].nar).toBe(60);
  });

  it('未选亚硝态氮+硝态氮时没有 NAR 段', async () => {
    const [no2, r1] = [await indId('亚硝态氮'), await rId('R1')];
    await addMeasurement({ date: '2026-08-01', reactorId: r1, indicatorId: no2, value: 30 });
    const data = await collectReportData({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-01',
      reactorIds: [r1],
      indicatorIds: [no2],
    });
    expect(data.narRows).toHaveLength(0);
  });

  it('只统计日常数据，全周期数据不混入', async () => {
    const [nh4, r1] = [await indId('氨氮'), await rId('R1')];
    await addMeasurement({ date: '2026-08-01', reactorId: r1, indicatorId: nh4, value: 10 });
    await addMeasurement({ date: '2026-08-01', reactorId: r1, indicatorId: nh4, value: 99, scene: 'cycle' });

    const data = await collectReportData({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-01',
      reactorIds: [r1],
      indicatorIds: [nh4],
    });
    expect(data.dailyCount).toBe(1);
    expect(data.sections[0].stats[0].count).toBe(1);
  });

  it('罐/日期过滤：只统计选中的罐和区间内日期', async () => {
    const [nh4, r1, r2] = [await indId('氨氮'), await rId('R1'), await rId('R2')];
    await addMeasurement({ date: '2026-07-31', reactorId: r1, indicatorId: nh4, value: 1 });
    await addMeasurement({ date: '2026-08-01', reactorId: r1, indicatorId: nh4, value: 10 });
    await addMeasurement({ date: '2026-08-02', reactorId: r1, indicatorId: nh4, value: 12 });
    await addMeasurement({ date: '2026-08-02', reactorId: r2, indicatorId: nh4, value: 30 });

    const data = await collectReportData({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-02',
      reactorIds: [r1],
      indicatorIds: [nh4],
    });
    expect(data.reactorCodes).toEqual(['R1']);
    const s = data.sections[0].stats[0];
    expect(s.count).toBe(2);
    expect(s.mean).toBe(11);
  });

  it('无数据时统计为空值', async () => {
    const [nh4, r1] = [await indId('氨氮'), await rId('R1')];
    const data = await collectReportData({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-02',
      reactorIds: [r1],
      indicatorIds: [nh4],
    });
    const s = data.sections[0].stats[0];
    expect(s.count).toBe(0);
    expect(s.mean).toBeNull();
    expect(s.stdev).toBeNull();
    expect(s.removalRate).toBeNull();
  });
});

describe('buildDocx', () => {
  beforeEach(clearAll);

  const mockData = {
    title: 'AGS 数据实验报告',
    generatedAt: '2026-08-31T10:00:00.000Z',
    generatedDate: '2026-08-31',
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
    reactorCodes: ['R1', 'R2'],
    indicatorNames: ['氨氮', '总氮'],
    dailyCount: 3,
    sections: [
      {
        indicatorId: 1,
        indicatorName: '氨氮',
        unit: 'mg/L',
        method: 'absorbance' as const,
        composite: false,
        stats: [
          { reactorCode: 'R1', count: 2, mean: 11, stdev: 1.4, min: 10, max: 12, removalRate: 80 },
          { reactorCode: 'R2', count: 1, mean: 20, stdev: null, min: 20, max: 20, removalRate: null },
        ],
      },
    ],
    narRows: [{ reactorCode: 'R1', nar: 60 }],
  };

  it('生成合法 docx（zip 魔数 UEsD）+ 正确文件名', async () => {
    const { base64, filename } = await buildDocx(mockData, []);
    expect(base64.slice(0, 4)).toBe('UEsD'); // PK\x03\x04
    expect(base64.length).toBeGreaterThan(1000);
    expect(filename).toBe('AGS实验报告-2026-08-01~2026-08-31.docx');
  });

  it('带趋势图图片也能生成', async () => {
    // 1x1 PNG
    const data = dataUrlToUint8(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    );
    const { base64 } = await buildDocx(mockData, [{ data, width: 560, height: 252 }]);
    expect(base64.slice(0, 4)).toBe('UEsD');
  });
});

describe('dataUrlToUint8', () => {
  it('dataURL 转回原始字节', () => {
    const raw = 'aGVsbG8='; // "hello"
    const out = dataUrlToUint8(`data:image/png;base64,${raw}`);
    expect(out).toHaveLength(5);
    expect(String.fromCharCode(...out)).toBe('hello');
  });

  it('无前缀的纯 base64 也能解析', () => {
    const out = dataUrlToUint8('aGVsbG8=');
    expect(String.fromCharCode(...out)).toBe('hello');
  });
});
