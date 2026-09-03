import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { db } from '../../db/schema';
import InfluentPanel from './InfluentPanel';

// 模拟进水数据异步加载很慢（400ms 未返回）——复现手机端"进水先填草稿丢失"竞态
vi.mock('../../lib/entry', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getInfluents: vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 400));
      return [];
    }),
  };
});

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

async function seed() {
  const nh4Id = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  await db.curves.add({
    indicatorId: nh4Id, effectiveFrom: '2026-08-01', effectiveTo: null,
    k: 0.3, b: 0.1, r2: 0.999, points: [], batchNo: '', note: '', createdAt: '',
  });
  await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
  });
  return { nh4Id };
}

describe('InfluentPanel 进水草稿竞态（进水先填不存草稿——异步回填覆盖）', () => {
  beforeEach(clearAll);

  it('进水加载慢时提前输入：不被 db 空回填覆盖，且输入即刻回调 onStateChange', async () => {
    const { nh4Id } = await seed();
    let lastSnap: { dilution: Record<number, string>; samples: Record<string, string> } | null = null;
    render(
      <InfluentPanel
        date="2026-08-05"
        blankByIndicator={{ [nh4Id]: '0.062' }}
        onStateChange={(s) => {
          lastSnap = s;
        }}
      />,
    );
    // 指标已渲染出输入框（getInfluents 仍在慢加载中）
    const sampleInput = (await screen.findByLabelText('氨氮 进水检测样', undefined, { timeout: 3000 })) as HTMLInputElement;
    fireEvent.change(sampleInput, { target: { value: '0.284' } });
    // 修复后：输入即刻对外回调（不再被 hydrated 门控吞掉）
    await waitFor(
      () => {
        expect(lastSnap?.samples[`${nh4Id}:shared`]).toBe('0.284');
      },
      { timeout: 2000 },
    );
    // 等慢加载（空数据）完成后：用户输入不被覆盖
    await new Promise((r) => setTimeout(r, 700));
    expect((screen.getByLabelText('氨氮 进水检测样') as HTMLInputElement).value).toBe('0.284');
    expect(lastSnap?.samples[`${nh4Id}:shared`]).toBe('0.284');
  });
});
