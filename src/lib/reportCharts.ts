/**
 * Word 实验报告 —— 趋势图渲染。
 * 用 ECharts 把每个指标的日常数据画成折线图（横轴日期、每条线一个罐），
 * 输出 PNG 二进制 + 插入 Word 的显示尺寸。
 * 依赖浏览器 canvas，测试环境用 vi.mock 替代；生产环境由 UI 层调用。
 */
import type { ReportData, ChartImage } from './report';

/** 渲染尺寸（像素）与插入 Word 的显示尺寸（像素，@96dpi ≈ Word 磅） */
const RENDER_WIDTH = 800;
const RENDER_HEIGHT = 360;
const DISPLAY_WIDTH = 560; // A4 内容宽约 6.3in = 604px，留边距取 560
const DISPLAY_HEIGHT = Math.round((DISPLAY_WIDTH * RENDER_HEIGHT) / RENDER_WIDTH);

/**
 * 每个指标一张趋势图。返回的数组顺序与 data.sections 一致（无数据时该位为 null）。
 */
export async function renderTrendCharts(data: ReportData): Promise<(ChartImage | null)[]> {
  const echarts = await import('echarts');
  const { db } = await import('../db/schema');
  const { dataUrlToUint8 } = await import('./report');

  const reactors = await db.reactors.toArray();
  const rByCode = new Map(reactors.map((r) => [r.code, r.id!]));
  const rIds = data.reactorCodes.map((c) => rByCode.get(c)).filter((x): x is number => x != null);

  // 一次读取全部需要的日常测量，逐指标复用
  const allMs = (await db.measurements.toArray()).filter(
    (m) =>
      m.scene === 'daily' &&
      m.value != null &&
      m.date >= data.dateFrom &&
      m.date <= data.dateTo &&
      rIds.includes(m.reactorId) &&
      data.sections.some((s) => s.indicatorId === m.indicatorId),
  );

  const results: (ChartImage | null)[] = [];
  for (const sec of data.sections) {
    const ms = allMs.filter((m) => m.indicatorId === sec.indicatorId);
    if (ms.length === 0) {
      results.push(null);
      continue;
    }

    const dates = [...new Set(ms.map((m) => m.date))].sort();
    const series = data.reactorCodes.map((code) => {
      const rid = rByCode.get(code);
      const byDate = new Map<string, number>();
      for (const m of ms) {
        if (m.reactorId === rid) byDate.set(m.date, m.value!);
      }
      return {
        name: code,
        type: 'line' as const,
        connectNulls: false,
        symbolSize: 4,
        lineStyle: { width: 2 },
        data: dates.map((d) => byDate.get(d) ?? null),
      };
    });

    const dom = document.createElement('div');
    dom.style.width = `${RENDER_WIDTH}px`;
    dom.style.height = `${RENDER_HEIGHT}px`;
    dom.style.position = 'absolute';
    dom.style.left = '-99999px';
    document.body.appendChild(dom);

    const chart = echarts.init(dom, undefined, { renderer: 'canvas' });
    chart.setOption({
      title: { text: `${sec.indicatorName} 趋势（${data.dateFrom} ~ ${data.dateTo}）`, left: 'center', textStyle: { fontSize: 14 } },
      tooltip: { trigger: 'axis' },
      legend: { data: data.reactorCodes, bottom: 0, textStyle: { fontSize: 12 } },
      grid: { left: 56, right: 24, top: 44, bottom: 36 },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value', name: sec.unit, nameTextStyle: { fontSize: 11 }, scale: true, axisLabel: { fontSize: 11 } },
      series,
    });

    const dataUrl = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
    chart.dispose();
    dom.remove();

    results.push({
      data: dataUrlToUint8(dataUrl),
      width: DISPLAY_WIDTH,
      height: DISPLAY_HEIGHT,
    });
  }

  return results;
}
