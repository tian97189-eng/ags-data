import { describe, it, expect } from 'vitest';
import { parseClipboardTable, mapPasteToGrid } from './paste';

describe('parseClipboardTable', () => {
  it('解析 TSV（Excel 复制）', () => {
    const text = '0.792\t0.784\t0.801\n0.611\t0.640\t0.655';
    const grid = parseClipboardTable(text);
    expect(grid).toHaveLength(2);
    expect(grid[0]).toEqual(['0.792', '0.784', '0.801']);
  });

  it('解析 CSV', () => {
    const grid = parseClipboardTable('1,2,3\n4,5,6');
    expect(grid[1]).toEqual(['4', '5', '6']);
  });

  it('去除末尾空行', () => {
    const grid = parseClipboardTable('1\t2\n3\t4\n\n');
    expect(grid).toHaveLength(2);
  });

  it('兼容 Windows 换行 CRLF', () => {
    const grid = parseClipboardTable('1\t2\r\n3\t4');
    expect(grid).toHaveLength(2);
  });

  it('空输入返回空数组', () => {
    expect(parseClipboardTable('')).toEqual([]);
  });
});

describe('mapPasteToGrid', () => {
  it('从起点正常对位', () => {
    const grid = [
      ['0.7', '0.8'],
      ['0.6', '0.5'],
    ];
    const r = mapPasteToGrid(grid, { startRow: 1, startCol: 0, maxRows: 5, maxCols: 3 });
    expect(r.cells).toEqual([
      { r: 1, c: 0, raw: '0.7' },
      { r: 1, c: 1, raw: '0.8' },
      { r: 2, c: 0, raw: '0.6' },
      { r: 2, c: 1, raw: '0.5' },
    ]);
    expect(r.overflowRows).toBe(0);
    expect(r.overflowCols).toBe(0);
  });

  it('统计溢出的行', () => {
    const grid = [['a'], ['b'], ['c']];
    const r = mapPasteToGrid(grid, { startRow: 0, startCol: 0, maxRows: 2, maxCols: 5 });
    expect(r.overflowRows).toBe(1);
    expect(r.cells).toHaveLength(2);
  });

  it('统计溢出的列', () => {
    const grid = [['a', 'b', 'c', 'd']];
    const r = mapPasteToGrid(grid, { startRow: 0, startCol: 0, maxRows: 5, maxCols: 2 });
    expect(r.overflowCols).toBe(2);
    expect(r.cells.map((x) => x.raw)).toEqual(['a', 'b']);
  });

  it('去掉单元格首尾空白', () => {
    const grid = [[' 0.7 ', '\t0.8']];
    const r = mapPasteToGrid(grid, { startRow: 0, startCol: 0, maxRows: 5, maxCols: 5 });
    expect(r.cells[0].raw).toBe('0.7');
  });
});
