/** 剪贴板文本 → 二维表格。自动识别 Excel 的制表符（TSV）与逗号（CSV） */
export function parseClipboardTable(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  return lines.map((line) => line.split(delimiter));
}

export interface PasteMapResult {
  cells: { r: number; c: number; raw: string }[];
  overflowRows: number;
  overflowCols: number;
}

/** 把粘贴内容从 (startRow, startCol) 起映射到网格，统计超出的行列 */
export function mapPasteToGrid(
  grid: string[][],
  opts: { startRow: number; startCol: number; maxRows: number; maxCols: number },
): PasteMapResult {
  const cells: PasteMapResult['cells'] = [];
  let overflowRows = 0;
  let overflowCols = 0;

  for (let r = 0; r < grid.length; r++) {
    const targetRow = opts.startRow + r;
    if (targetRow >= opts.maxRows) {
      overflowRows += grid.length - r;
      break;
    }
    for (let c = 0; c < grid[r].length; c++) {
      const targetCol = opts.startCol + c;
      if (targetCol >= opts.maxCols) {
        overflowCols += grid[r].length - c;
        break;
      }
      cells.push({ r: targetRow, c: targetCol, raw: grid[r][c].trim() });
    }
  }

  return { cells, overflowRows, overflowCols };
}
