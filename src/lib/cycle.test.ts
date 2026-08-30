import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../db/schema';
import { generateTimes, cycleStats, deleteCycle } from './cycle';
import { cycleScope } from './entry';

describe('generateTimes', () => {
  it('生成等间隔时间点', () => {
    expect(generateTimes('08:00', 30, 3)).toEqual(['08:00', '08:30', '09:00']);
  });

  it('跨小时', () => {
    expect(generateTimes('09:30', 30, 3)).toEqual(['09:30', '10:00', '10:30']);
  });

  it('跨午夜取模', () => {
    expect(generateTimes('23:30', 30, 3)).toEqual(['23:30', '00:00', '00:30']);
  });
});

describe('cycleStats', () => {
  it('基本统计：起始、最低、最高', () => {
    const times = ['08:00', '08:30', '09:00', '09:30'];
    const values = [39, 30, 20, 11];
    const s = cycleStats(times, values);
    expect(s.start).toBe(39);
    expect(s.min).toBe(11);
    expect(s.max).toBe(39);
  });

  it('降到目标值用时', () => {
    const times = ['08:00', '08:30', '09:00', '09:30'];
    const values = [39, 30, 20, 11];
    const s = cycleStats(times, values, 25);
    // 首次 <= 25 是 09:00 的 20，用时 60 分钟
    expect(s.timeToTarget).toBe(60);
  });

  it('有缺失值时跳过', () => {
    const times = ['08:00', '08:30', '09:00'];
    const values = [39, null, 20];
    const s = cycleStats(times, values);
    expect(s.start).toBe(39);
    expect(s.min).toBe(20);
    expect(s.max).toBe(39);
  });

  it('全空返回 null', () => {
    const s = cycleStats(['08:00', '08:30'], [null, null]);
    expect(s.start).toBeNull();
    expect(s.min).toBeNull();
  });

  it('未达到目标返回 null', () => {
    const s = cycleStats(['08:00', '08:30'], [39, 30], 10);
    expect(s.timeToTarget).toBeNull();
  });
});

describe('deleteCycle', () => {
  beforeEach(async () => {
    for (const t of db.tables) await t.clear();
  });

  it('删除周期及其测量、默认值、阶段标记，不影响其他周期', async () => {
    const indicatorId = await db.indicators.add({
      name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
      defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
    });
    const reactorId = await db.reactors.add({
      code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
    });

    const cycleId = await db.cycles.add({
      date: '2026-08-05', name: '周期A', startTime: '08:00', intervalMinutes: 30,
      count: 3, reactorIds: [reactorId], note: '',
    });
    const otherCycleId = await db.cycles.add({
      date: '2026-08-06', name: '周期B', startTime: '08:00', intervalMinutes: 30,
      count: 3, reactorIds: [reactorId], note: '',
    });

    const measurement = (cycleRunId: number, sampleAbs: number, value: number) => ({
      scene: 'cycle' as const, date: '2026-08-05', cycleRunId, time: '08:00',
      phase: null as const, reactorId, indicatorId, inputType: 'absorbance' as const,
      sampleAbs, blankAbs: 0.012, dilution: 10, value, curveId: null,
      blankOverridden: false, dilutionOverridden: false, note: '',
    });

    await db.measurements.add(measurement(cycleId, 0.284, 5.73));
    await db.defaults.add({ scopeKey: cycleScope(cycleId), indicatorId, blankAbs: 0.012, dilution: 10 });
    await db.settings.put({ key: `cycle:${cycleId}:phases`, value: { '08:00': 'oxic' } });
    // 其他周期数据
    await db.measurements.add(measurement(otherCycleId, 0.5, 10));

    await deleteCycle(cycleId);

    expect(await db.cycles.get(cycleId)).toBeUndefined();
    expect(await db.measurements.where('cycleRunId').equals(cycleId).count()).toBe(0);
    expect(await db.defaults.where('scopeKey').equals(cycleScope(cycleId)).count()).toBe(0);
    expect(await db.settings.get(`cycle:${cycleId}:phases`)).toBeUndefined();
    // 其他周期保留
    expect(await db.measurements.where('cycleRunId').equals(otherCycleId).count()).toBe(1);
    expect(await db.cycles.get(otherCycleId)).toBeTruthy();
  });
});
