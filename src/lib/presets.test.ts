import { beforeEach, describe, it, expect } from 'vitest';
import { loadPresets, savePreset, deletePreset, type QueryFilter } from './presets';

const KEY = 'query.presets.v1';

function filter(partial: Partial<QueryFilter> = {}): QueryFilter {
  return {
    dateFrom: '',
    dateTo: '',
    reactorIds: [],
    indicatorIds: [],
    scene: 'all',
    phase: '',
    keyword: '',
    ...partial,
  };
}

beforeEach(() => localStorage.clear());

describe('presets（快捷筛选）', () => {
  it('空 localStorage 返回空列表', () => {
    expect(loadPresets()).toEqual([]);
  });

  it('保存后可读取；同名覆盖旧值', () => {
    savePreset('近7天R1', filter({ dateFrom: '2026-08-25', dateTo: '2026-09-01', reactorIds: [1] }));
    savePreset('氨氮', filter({ indicatorIds: [2] }));
    let list = loadPresets();
    expect(list).toHaveLength(2);

    savePreset('氨氮', filter({ indicatorIds: [2, 3], scene: 'daily' })); // 覆盖
    list = loadPresets();
    expect(list).toHaveLength(2);
    const nh3 = list.find((p) => p.name === '氨氮')!;
    expect(nh3.f.indicatorIds).toEqual([2, 3]);
    expect(nh3.f.scene).toBe('daily');
  });

  it('删除预设', () => {
    savePreset('A', filter());
    savePreset('B', filter());
    const list = deletePreset('A');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('B');
  });

  it('localStorage 数据损坏时安全返回空列表', () => {
    localStorage.setItem(KEY, '{broken json');
    expect(loadPresets()).toEqual([]);
  });
});
