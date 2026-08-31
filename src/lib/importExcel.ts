/**
 * Excel 数据导入识别
 *
 * 模板列（固定 4 列 + 1 备注列）：
 *   A: 日期 (YYYY-MM-DD 或 Excel 日期序列号)
 *   B: 罐编号 (如 R1)
 *   C: 指标名 (如 氨氮)
 *   D: 浓度 (mg/L)
 *   E: 备注 (可选)
 *
 * 第 1 行是表头（"日期"/"日期"等可识别）。解析后返回"行候选"数组，
 *   每行带 status: 'ok' | 'unknown_indicator' | 'unknown_reactor' | 'invalid_date' | 'invalid_value'
 *   让用户确认后再写入数据库。
 */
import * as XLSX from 'xlsx';

export interface ImportedRow {
  /** 1-based Excel 行号（含表头），方便错误提示 */
  excelRow: number;
  date: string | null;
  reactorCode: string | null;
  indicatorName: string | null;
  value: number | null;
  note: string;
  status: 'ok' | 'unknown_indicator' | 'unknown_reactor' | 'invalid_date' | 'invalid_value';
  statusDetail?: string;
}

export interface ImportPreview {
  rows: ImportedRow[];
  totalRows: number;
  okCount: number;
  unknownReactorCodes: string[];
  unknownIndicatorNames: string[];
}

/** 把 Excel 序列号日期转成 YYYY-MM-DD */
function excelDateToString(v: unknown): string | null {
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    // 已经看起来是 YYYY-MM-DD 或 YYYY/MM/DD
    const m1 = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m1) {
      const y = m1[1], mo = String(m1[2]).padStart(2, '0'), d = String(m1[3]).padStart(2, '0');
      return `${y}-${mo}-${d}`;
    }
    // 试 Date 解析
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }
    return null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel epoch 是 1900-01-00（有 1900 闰年 bug，但 xlsx 库自动处理）
    // 用 xlsx 的内部转换
    const dt = XLSX.SSF?.parse_date_code?.(v);
    if (dt) {
        const y = dt.y, mo = String(dt.m).padStart(2, '0'), d = String(dt.d).padStart(2, '0');
        return `${y}-${mo}-${d}`;
    }
    // 备选：用 epoch 计算
    const ms = (v - 25569) * 86400 * 1000; // 25569 = 1900-01-01 到 1970-01-01 的天数
    const dt2 = new Date(ms);
    if (!isNaN(dt2.getTime())) {
      return `${dt2.getFullYear()}-${String(dt2.getMonth() + 1).padStart(2, '0')}-${String(dt2.getDate()).padStart(2, '0')}`;
    }
  }
  return null;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/** 把 ArrayBuffer/Blob/Uint8Array 解析成预览（不写库） */
export async function parseImportFile(file: File | Blob | ArrayBuffer | Uint8Array): Promise<ImportPreview> {
  const buf =
    file instanceof ArrayBuffer
      ? file
      : file instanceof Uint8Array
      ? file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
      : await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { rows: [], totalRows: 0, okCount: 0, unknownIndicatorNames: [], unknownReactorCodes: [] };
  const sheet = wb.Sheets[sheetName];
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });

  // 找表头行（第一个包含"日期"或"罐"或"指标"的行）
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, aoa.length); i++) {
    const row = (aoa[i] || []).map((c) => String(c ?? '').trim());
    if (row.some((c) => /日期|date/i.test(c)) || row.some((c) => /指标/i.test(c))) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx < 0) {
    return {
      rows: [],
      totalRows: aoa.length,
      okCount: 0,
      unknownIndicatorNames: [],
      unknownReactorCodes: [],
    };
  }

  // 识别列：日期/罐/指标/浓度/备注（按表头关键字）
  const colMap = { date: -1, reactor: -1, indicator: -1, value: -1, note: -1 };
  const header = (aoa[headerRowIdx] || []).map((c) => String(c ?? '').trim());
  for (let i = 0; i < header.length; i++) {
    const h = header[i].toLowerCase();
    if (/日期/.test(h) || /date/i.test(h)) colMap.date = i;
    else if (/罐/.test(h) || /reactor/i.test(h)) colMap.reactor = i;
    else if (/指标/.test(h) || /indicator/i.test(h)) colMap.indicator = i;
    else if (/浓度/.test(h) || /value/i.test(h) || /\bmg/.i.test(h)) colMap.value = i;
    else if (/备注/.test(h) || /note/i.test(h)) colMap.note = i;
  }

  // 查 db 中已知的罐/指标名
  const reactors = await (await import('../db/schema')).db.reactors.toArray();
  const indicators = await (await import('../db/schema')).db.indicators.toArray();
  const reactorByCode = new Map(reactors.map((r) => [r.code, r]));
  const indicatorByName = new Map(indicators.map((i) => [i.name, i]));

  const rows: ImportedRow[] = [];
  const unknownReactorCodes = new Set<string>();
  const unknownIndicatorNames = new Set<string>();
  let okCount = 0;

  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] || [];
    const date = colMap.date >= 0 ? excelDateToString(row[colMap.date]) : null;
    const reactorCode = colMap.reactor >= 0 ? String(row[colMap.reactor] ?? '').trim() : null;
    const indicatorName = colMap.indicator >= 0 ? String(row[colMap.indicator] ?? '').trim() : null;
    const value = colMap.value >= 0 ? num(row[colMap.value]) : null;
    const note = colMap.note >= 0 ? String(row[colMap.note] ?? '').trim() : '';

    let status: ImportedRow['status'] = 'ok';
    let statusDetail: string | undefined;
    if (!date) {
      status = 'invalid_date';
      statusDetail = `无法解析日期: ${row[colMap.date]}`;
    } else if (!reactorCode) {
      status = 'unknown_reactor';
      statusDetail = '缺罐编号';
    } else if (!indicatorName) {
      status = 'unknown_indicator';
      statusDetail = '缺指标名';
    } else if (value == null) {
      status = 'invalid_value';
      statusDetail = `无法解析浓度: ${row[colMap.value]}`;
    } else {
      const ind = indicatorByName.get(indicatorName);
      const r = reactorByCode.get(reactorCode);
      if (!ind) {
        status = 'unknown_indicator';
        statusDetail = `指标「${indicatorName}」未定义`;
        unknownIndicatorNames.add(indicatorName);
      } else if (!r) {
        status = 'unknown_reactor';
        statusDetail = `罐「${reactorCode}」未定义`;
        unknownReactorCodes.add(reactorCode);
      }
    }
    if (status === 'ok') okCount++;
    rows.push({
      excelRow: i + 1,
      date,
      reactorCode: reactorCode || null,
      indicatorName: indicatorName || null,
      value,
      note,
      status,
      statusDetail,
    });
  }

  return {
    rows,
    totalRows: rows.length,
    okCount,
    unknownIndicatorNames: Array.from(unknownIndicatorNames),
    unknownReactorCodes: Array.from(unknownReactorCodes),
  };
}

/** 生成 Excel 导入模板（多 sheet：使用说明 + 数据 + 示例） */
export function buildImportTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // sheet 1：使用说明
  const intro = XLSX.utils.aoa_to_sheet([
    ['AGS 数据导入模板 · 使用说明'],
    [''],
    ['本模板用于把实验数据批量导入到 AGS 数据台。打开"数据"sheet 填写测量记录，保存后回到软件点"选择 Excel 文件"上传即可。'],
    [''],
    ['1. 模板列说明（"数据" sheet 第 1 行表头）'],
    ['列名', '必填', '格式 / 示例', '说明'],
    ['日期', '是', '2026-09-01（YYYY-MM-DD）', '同一天的多个测量可写多行（同一罐同一指标）'],
    ['罐', '是', 'R1（与系统反应器 code 完全一致）', '必须是系统里已存在的反应器，否则该行会被跳过并在预览里提示'],
    ['指标', '是', '氨氮（与系统指标名完全一致）', '必须是系统里已存在的指标（如"氨氮/硝态氮/COD/总氮/自定义名..."）'],
    ['浓度(mg/L)', '是', '13.6（数字）', '浓度值，带吸光度的指标也直接填算好的浓度'],
    ['备注', '否', '仪器直读/复测...', '可选说明'],
    [''],
    ['2. 使用步骤'],
    ['(1) 在系统设置里创建好"罐"（如 R1/R2）和"指标"（如 氨氮/总氮/自定义指标）'],
    ['(2) 切换到"数据" sheet，从第 2 行开始填测量值'],
    ['(3) 罐编号/指标名必须与系统里完全一致（含大小写、空格）'],
    ['(4) 日期统一用 YYYY-MM-DD 格式'],
    ['(5) 保存为 .xlsx，回到软件"系统设置 → 备份与导出 → 导入 Excel"，选这个文件'],
    ['(6) 预览对话框会显示每行解析结果，未识别的罐/指标会标记为"罐未定义/指标未定义"（跳过不导入）'],
    ['(7) 确认"导入"后写入本地数据库（不影响云端，要云同步请同时配置云同步）'],
    [''],
    ['3. 常见问题'],
    ['Q: 提示"罐 R99 未定义" → 系统里没建 R99，先到"系统设置 → 反应器"添加'],
    ['Q: 提示"指标 EPS 未定义" → 系统里没建 EPS 指标，先到"自定义指标"添加并启用'],
    ['Q: 提示"日期无效" → 日期列必须是 YYYY-MM-DD 格式（如 2026-09-01）'],
    ['Q: 能不能不填浓度？ → 不能，浓度必填'],
    ['Q: 能不能填吸光度？ → 不能，模板只接收算好的浓度值（吸光度→浓度在软件里通过标曲自动算）'],
    [''],
    ['4. 示例（见"数据" sheet 的第 2-4 行）'],
  ]);
  XLSX.utils.book_append_sheet(wb, intro, '使用说明');

  // sheet 2：数据（用户填写区域）
  const dataWs = XLSX.utils.aoa_to_sheet([
    ['日期', '罐', '指标', '浓度(mg/L)', '备注'],
    ['2026-09-01', 'R1', '氨氮', 13.6, ''],
    ['2026-09-01', 'R1', 'COD', 35, '仪器直读'],
    ['2026-09-01', 'R2', '氨氮', 12.8, '同 1 复测'],
    ['2026-09-01', 'R2', '硝态氮', 4.5, ''],
    ['2026-09-01', 'R2', '总氮', 17.3, '=三氮之和'],
    ['2026-09-02', 'R1', '氨氮', 12.1, ''],
    ['2026-09-02', 'R1', 'COD', 38, ''],
  ]);
  XLSX.utils.book_append_sheet(wb, dataWs, '数据');

  // sheet 3：示例（更多场景）
  const sampleWs = XLSX.utils.aoa_to_sheet([
    ['场景示例'],
    [''],
    ['【场景 1】三个罐每天测氨氮 COD'],
    ['日期', '罐', '指标', '浓度(mg/L)', '备注'],
    ['2026-09-01', 'R1', '氨氮', 13.6, ''],
    ['2026-09-01', 'R1', 'COD', 35, ''],
    ['2026-09-01', 'R2', '氨氮', 12.8, ''],
    ['2026-09-01', 'R3', '氨氮', 14.0, ''],
    [''],
    ['【场景 2】周期性数据（每天测多指标）'],
    ['日期', '罐', '指标', '浓度(mg/L)', '备注'],
    ['2026-09-01', 'R1', '氨氮', 13.6, ''],
    ['2026-09-01', 'R1', '硝态氮', 4.5, ''],
    ['2026-09-01', 'R1', '亚硝态氮', 0.3, ''],
    ['2026-09-01', 'R1', '总P', 2.1, ''],
    ['2026-09-01', 'R1', 'COD', 35, ''],
    [''],
    ['【场景 3】自定义指标（要先在系统里添加）'],
    ['日期', '罐', '指标', '浓度(mg/L)', '备注'],
    ['2026-09-01', 'R1', 'MLSS', 2.5, '污泥浓度（直读）'],
    ['2026-09-01', 'R1', 'SVI', 85, '污泥体积指数（直读）'],
    [''],
    ['【注意】所有行会按"日期+罐+指标"作为一条测量记录。'],
    ['  同一天同一罐同一指标多次测量 → 会在历史里产生多条记录（保留所有）。'],
  ]);
  XLSX.utils.book_append_sheet(wb, sampleWs, '示例场景');

  return wb;
}