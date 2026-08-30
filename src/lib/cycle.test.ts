import { describe, it, expect } from 'vitest';
import { generateTimes, cycleStats } from './cycle';

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
