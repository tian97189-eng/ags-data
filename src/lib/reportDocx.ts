/**
 * Word 实验报告 —— docx 文档组装。
 * 输入：collectReportData 的统计结果 + renderTrendCharts 的趋势图；
 * 输出：{ base64, filename }，供电脑下载 / 手机保存分享。
 * 不依赖 ECharts/DOM 渲染，可在 jsdom 下直接单测。
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ITableBordersOptions,
} from 'docx';
import type { ChartImage, ReportData } from './report';

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '9CA3AF' } as const;
const TABLE_BORDERS: ITableBordersOptions = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
  insideHorizontal: BORDER,
  insideVertical: BORDER,
};
const HEADER_BG = 'E8F0EC';

function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v == null) return '—';
  return v.toFixed(digits);
}

function cell(
  text: string,
  opts: { bold?: boolean; bg?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
): TableCell {
  const align = opts.align ?? (opts.bold ? AlignmentType.CENTER : AlignmentType.LEFT);
  return new TableCell({
    borders: TABLE_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.bg ? { type: ShadingType.CLEAR, fill: opts.bg, color: 'auto' } : undefined,
    children: [
      new Paragraph({
        alignment: align,
        children: [new TextRun({ text, bold: opts.bold, size: 18 })],
      }),
    ],
  });
}

function makeTable(headers: string[], rows: (string | null)[][]): Table {
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map((h) => cell(h, { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER })),
  });
  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: r.map((v) => cell(v ?? '—', { align: AlignmentType.CENTER })),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headRow, ...bodyRows],
  });
}

/** 把统计结果 + 趋势图组装成 Word 文档，返回 base64 与文件名 */
export async function buildDocx(
  data: ReportData,
  charts: (ChartImage | null)[],
): Promise<{ base64: string; filename: string }> {
  const children: (Paragraph | Table)[] = [];

  // —— 标题 ——
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: data.title, bold: true, size: 44 })],
    }),
  );

  // —— 概述 ——
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: '一、报告概述' })],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: `统计区间：${data.dateFrom} 至 ${data.dateTo}` })],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: `统计范围：日常数据（每天一次），共 ${data.dailyCount} 条` })],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: `涉及反应器：${data.reactorCodes.join('、')}` })],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: `涉及指标：${data.indicatorNames.join('、')}` })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: `生成时间：${data.generatedDate}` })],
    }),
  );

  // —— 各指标统计 + 趋势图 ——
  data.sections.forEach((sec, idx) => {
    const numCn = '一二三四五六七八九十'[idx] ?? String(idx + 1);
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: `${numCn}、${sec.indicatorName}（${sec.unit}）` })],
      }),
    );

    // 统计表
    const header = ['反应器', '数据条数', '平均值', '标准差', '最小值', '最大值', '平均去除率（%）'];
    const rows = sec.stats.map((s) => [
      s.reactorCode,
      String(s.count),
      fmtNum(s.mean),
      fmtNum(s.stdev),
      fmtNum(s.min),
      fmtNum(s.max),
      s.removalRate == null ? '—' : fmtNum(s.removalRate),
    ]);
    if (sec.stats.length > 0) {
      children.push(makeTable(header, rows));
    } else {
      children.push(new Paragraph({ children: [new TextRun({ text: '该时间段内没有数据。' })] }));
    }

    // 趋势图
    const chart = charts[idx];
    if (chart) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 160, after: 120 },
          children: [
            new ImageRun({
              type: 'png',
              data: chart.data,
              transformation: { width: chart.width, height: chart.height },
            }),
          ],
        }),
      );
    }
  });

  // —— 亚硝积累率 ——
  if (data.narRows.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: `${'一二三四五六七八九十'[data.sections.length] ?? String(data.sections.length + 1)}、亚硝积累率 NAR` })],
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: 'NAR(%) = NO₂⁻-N ÷ (NO₂⁻-N + NO₃⁻-N) × 100，取统计区间内逐日平均值；当天缺任一指标或分母为 0 时不计算。',
          }),
        ],
      }),
    );
    const rows = data.narRows.map((r) => [r.reactorCode, r.nar == null ? '—' : fmtNum(r.nar)]);
    children.push(makeTable(['反应器', '平均亚硝积累率（%）'], rows));
  }

  const doc = new Document({
    creator: 'AGS 数据台',
    title: data.title,
    description: '好氧颗粒污泥 AOA 系统数据实验报告',
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  const base64 = await blobToBase64(blob);
  const filename = `AGS实验报告-${data.dateFrom}~${data.dateTo}.docx`;
  return { base64, filename };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
