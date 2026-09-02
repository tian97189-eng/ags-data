import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveDraft,
  saveDraftFor,
  loadDraft,
  loadDraftFor,
  clearDraft,
  clearDraftFor,
  isDraftEmpty,
  shouldOfferRestore,
  type Draft,
} from './draft';

describe('draft 存取', () => {
  beforeEach(() => localStorage.clear());

  it('save 后可 load，含 savedAt', () => {
    saveDraft({ date: '2026-09-02', defaults: { 1: { blank: '0.012', dilution: '10' } }, cells: {} });
    const d = loadDraft();
    expect(d).not.toBeNull();
    expect(d!.date).toBe('2026-09-02');
    expect(d!.defaults[1]).toEqual({ blank: '0.012', dilution: '10' });
    expect(typeof d!.savedAt).toBe('number');
  });

  it('clear 后 load 为 null', () => {
    saveDraft({ date: '2026-09-02', defaults: {}, cells: {} });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('脏数据（非对象/缺字段）load 返回 null', () => {
    localStorage.setItem('ags-entry-draft', 'not-json');
    expect(loadDraft()).toBeNull();
    localStorage.setItem('ags-entry-draft', JSON.stringify({ foo: 1 }));
    expect(loadDraft()).toBeNull();
  });
});

describe('isDraftEmpty', () => {
  it('全空返回 true', () => {
    expect(isDraftEmpty({ defaults: {}, cells: {} })).toBe(true);
    expect(
      isDraftEmpty({
        defaults: { 1: { blank: '', dilution: '' } },
        cells: {},
        influent: { dilution: {}, samples: {} },
      }),
    ).toBe(true);
  });

  it('任一输入非空返回 false', () => {
    expect(
      isDraftEmpty({ defaults: { 1: { blank: '', dilution: '10' } }, cells: {} }),
    ).toBe(true); // 默认稀释预填不算用户输入
    expect(
      isDraftEmpty({ defaults: { 1: { blank: '0.05', dilution: '' } }, cells: {} }),
    ).toBe(false);
    expect(
      isDraftEmpty({ defaults: {}, cells: { '1:2': { sample: '0.5', dilution: '', dilutionOverridden: false } } }),
    ).toBe(false);
    expect(
      isDraftEmpty({ defaults: {}, cells: { '1:2': { sample: '', dilution: '20', dilutionOverridden: true } } }),
    ).toBe(false);
    expect(
      isDraftEmpty({ defaults: {}, cells: {}, influent: { dilution: {}, samples: { '1:shared': '0.3' } } }),
    ).toBe(false);
  });
});

describe('shouldOfferRestore', () => {
  const mk = (date: string): Draft => ({ date, savedAt: Date.now(), defaults: {}, cells: {} });

  it('草稿日期匹配且无 DB 数据时提示', () => {
    expect(shouldOfferRestore(mk('2026-09-02'), '2026-09-02', false)).toBe(true);
  });

  it('无草稿 / 日期不匹配 / 已有 DB 数据时不提示', () => {
    expect(shouldOfferRestore(null, '2026-09-02', false)).toBe(false);
    expect(shouldOfferRestore(mk('2026-09-01'), '2026-09-02', false)).toBe(false);
    expect(shouldOfferRestore(mk('2026-09-02'), '2026-09-02', true)).toBe(false);
  });
});

describe('saveDraftFor 泛化 API（多页面隔离）', () => {
  beforeEach(() => localStorage.clear());

  it('不同 key 互不干扰（一个存一个取不串）', () => {
    saveDraftFor('page-a', { date: '2026-09-01', defaults: {}, cells: { '1:2': { sample: '0.5', dilution: '10', dilutionOverridden: false } } });
    saveDraftFor('page-b', { date: '2026-09-02', defaults: {}, cells: { '3:4': { sample: '0.3', dilution: '20', dilutionOverridden: false } } });
    const a = loadDraftFor('page-a');
    const b = loadDraftFor('page-b');
    expect(a?.date).toBe('2026-09-01');
    expect(a?.cells['1:2']?.sample).toBe('0.5');
    expect(b?.date).toBe('2026-09-02');
    expect(b?.cells['3:4']?.sample).toBe('0.3');
    // 不串 key
    expect(a?.cells['3:4']).toBeUndefined();
    expect(b?.cells['1:2']).toBeUndefined();
  });

  it('clearDraftFor 只清自己的 key', () => {
    saveDraftFor('a', { date: '2026-09-01', defaults: {}, cells: {} });
    saveDraftFor('b', { date: '2026-09-01', defaults: {}, cells: {} });
    clearDraftFor('a');
    expect(loadDraftFor('a')).toBeNull();
    expect(loadDraftFor('b')).not.toBeNull();
  });

  it('旧 API（无 key）仍指向固定 KEY，与 For API 不串', () => {
    saveDraft({ date: '2026-09-01', defaults: {}, cells: {} });
    expect(loadDraft()?.date).toBe('2026-09-01');
    saveDraftFor('ags-entry-draft', { date: '2026-09-15', defaults: {}, cells: {} });
    // 旧 API 与 For API 用同一 KEY（兼容）
    expect(loadDraft()?.date).toBe('2026-09-15');
  });
});

describe('saveDraftFor 泛化 API（多页面隔离）', () => {
  beforeEach(() => localStorage.clear());

  it('不同 key 互不干扰（一个存一个取不串）', () => {
    saveDraftFor('page-a', { date: '2026-09-01', defaults: {}, cells: { '1:2': { sample: '0.5', dilution: '10', dilutionOverridden: false } } });
    saveDraftFor('page-b', { date: '2026-09-02', defaults: {}, cells: { '3:4': { sample: '0.3', dilution: '20', dilutionOverridden: false } } });
    const a = loadDraftFor('page-a');
    const b = loadDraftFor('page-b');
    expect(a?.date).toBe('2026-09-01');
    expect(a?.cells['1:2']?.sample).toBe('0.5');
    expect(b?.date).toBe('2026-09-02');
    expect(b?.cells['3:4']?.sample).toBe('0.3');
    // 不串 key
    expect(a?.cells['3:4']).toBeUndefined();
    expect(b?.cells['1:2']).toBeUndefined();
  });

  it('clearDraftFor 只清自己的 key', () => {
    saveDraftFor('a', { date: '2026-09-01', defaults: {}, cells: {} });
    saveDraftFor('b', { date: '2026-09-01', defaults: {}, cells: {} });
    clearDraftFor('a');
    expect(loadDraftFor('a')).toBeNull();
    expect(loadDraftFor('b')).not.toBeNull();
  });

  it('旧 API（无 key）仍指向固定 KEY，与 For API 不串', () => {
    saveDraft({ date: '2026-09-01', defaults: {}, cells: {} });
    expect(loadDraft()?.date).toBe('2026-09-01');
    saveDraftFor('ags-entry-draft', { date: '2026-09-15', defaults: {}, cells: {} });
    // 旧 API 与 For API 用同一 KEY（兼容）
    expect(loadDraft()?.date).toBe('2026-09-15');
  });
});
