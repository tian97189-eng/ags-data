import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../../db/schema';
import EntryPage from './index';
import { today } from '../../lib/format';
import { saveDraft, loadDraft, clearDraft } from '../../lib/draft';

async function clearAll() {
  for (const t of db.tables) await t.clear();
  localStorage.clear();
}

/** 建一个直读指标 + R1 */
async function seedBasic() {
  const indId = await db.indicators.add({
    name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
    defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
  });
  const rId = await db.reactors.add({
    code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
  });
  return { indId, rId };
}

describe('录入草稿自动保存与恢复', () => {
  beforeEach(clearAll);

  it('当日无已存数据且有草稿 → 显示「恢复草稿」提示', async () => {
    const { indId, rId } = await seedBasic();
    // 预置草稿（今天，无 DB 数据）
    saveDraft({
      date: today(),
      defaults: { [indId]: { blank: '0.012', dilution: '10' } },
      cells: { [`${indId}:${rId}`]: { sample: '0.284', dilution: '10', dilutionOverridden: false } },
    });

    render(<EntryPage />);
    // 提示条出现
    expect(await screen.findByText(/未保存草稿/)).toBeTruthy();
  });

  it('点「恢复草稿」把吸光度与空白带回输入框', async () => {
    const { indId, rId } = await seedBasic();
    saveDraft({
      date: today(),
      defaults: { [indId]: { blank: '0.012', dilution: '10' } },
      cells: { [`${indId}:${rId}`]: { sample: '0.284', dilution: '10', dilutionOverridden: false } },
    });

    render(<EntryPage />);
    await screen.findByText(/未保存草稿/);
    fireEvent.click(screen.getByText('恢复草稿'));

    await waitFor(() => {
      const sample = screen.getByLabelText('R1 吸光度');
      expect((sample as HTMLInputElement).value).toBe('0.284');
    });
    // 提示条消失
    expect(screen.queryByText(/未保存草稿/)).toBeNull();
  });

  it('点「丢弃」清掉草稿并关闭提示', async () => {
    const { indId, rId } = await seedBasic();
    saveDraft({
      date: today(),
      defaults: { [indId]: { blank: '', dilution: '10' } },
      cells: { [`${indId}:${rId}`]: { sample: '0.5', dilution: '10', dilutionOverridden: false } },
    });

    render(<EntryPage />);
    await screen.findByText(/未保存草稿/);
    fireEvent.click(screen.getByText('丢弃'));

    await waitFor(() => {
      expect(screen.queryByText(/未保存草稿/)).toBeNull();
    });
    expect(loadDraft()).toBeNull();
  });

  it('当日已有已存数据时不提示恢复（避免覆盖）', async () => {
    const { indId, rId } = await seedBasic();
    // 今天已有数据
    await db.measurements.add({
      scene: 'daily', date: today(), phase: null, reactorId: rId, indicatorId: indId,
      inputType: 'absorbance', sampleAbs: 0.2, blankAbs: 0.01, dilution: 10,
      value: 3, curveId: null, blankOverridden: false, dilutionOverridden: false,
      note: '', createdAt: '',
    });
    saveDraft({
      date: today(),
      defaults: { [indId]: { blank: '0.012', dilution: '10' } },
      cells: { [`${indId}:${rId}`]: { sample: '0.284', dilution: '10', dilutionOverridden: false } },
    });

    render(<EntryPage />);
    await waitFor(() => expect(screen.queryByText(/未保存草稿/)).toBeNull());
  });

  it('草稿是别的日期（录一半隔天再开）也提示，点恢复自动切到草稿日期并填回', async () => {
    const { indId, rId } = await seedBasic();
    const otherDay = today() === '2026-09-02' ? '2026-09-01' : '2026-09-02';
    saveDraft({
      date: otherDay,
      defaults: { [indId]: { blank: '', dilution: '10' } },
      cells: { [`${indId}:${rId}`]: { sample: '0.1', dilution: '10', dilutionOverridden: false } },
    });

    render(<EntryPage />);
    // 跨日期也提示，且 banner 显示草稿日期
    await screen.findByText(/未保存草稿/, undefined, { timeout: 3000 });
    expect(screen.getByText(new RegExp(otherDay))).toBeTruthy();

    // 点恢复 → 自动切到草稿日期并填回吸光度
    fireEvent.click(screen.getByText('恢复草稿'));
    await waitFor(
      () => {
        expect((screen.getByLabelText('R1 吸光度') as HTMLInputElement).value).toBe('0.1');
      },
      { timeout: 4000 },
    );
  });

  it('手机端 banner 位于 PageHeader 之后、日期行之前（不会被表单挤压看不见）', async () => {
    await saveDraft({
      date: '2026-09-02',
      defaults: { 1: { blank: '', dilution: '10' } },
      cells: { '1:1': { sample: '0.123', dilution: '10', dilutionOverridden: false } },
    });
    render(<EntryPage />);
    const banner = await screen.findByText(/未保存草稿/, undefined, { timeout: 3000 });
    // 父级 div 应在 PageHeader（h1 "数据录入"）之后；banner 元素 nextElementSibling 的兄弟链中应能找到「复制昨天」
    const pageTitle = screen.getByRole('heading', { name: /数据录入/ });
    // 沿 DOM 顺序确认 banner 在 pageTitle 之后、在日期行（DatePicker / 复制昨天 按钮）之前
    const all = Array.from(document.body.querySelectorAll('*'));
    const idxTitle = all.indexOf(pageTitle);
    const idxBanner = all.indexOf(banner.closest('div.border-amber-300')!);
    const copyBtn = screen.getByText('复制昨天');
    const idxCopy = all.indexOf(copyBtn);
    expect(idxTitle).toBeLessThan(idxBanner);
    expect(idxBanner).toBeLessThan(idxCopy);
  });
});

describe('录入草稿立即同步写盘（问题：手机端输入立即被关丢草稿）', () => {
  beforeEach(clearAll);

  it('输入吸光度后立即（同步）写入 localStorage，不依赖防抖', async () => {
    const { indId, rId } = await seedBasic();
    render(<EntryPage />);
    // 等数据加载完成（loading=false）：通过吸光度输入框出现 + 等一帧让 setDefaults/setCells 完成
    await screen.findByLabelText('R1 吸光度', undefined, { timeout: 3000 });
    await waitFor(() => {
      // loading=false 后，稀释行预填 indicator.defaultDilution='10'
      // 通过「氨氮」标题旁的 toolbar 稀释输入验证
      const numInputs = [...document.querySelectorAll<HTMLInputElement>('input[type="number"]')];
      expect(numInputs.length).toBeGreaterThan(0);
    });
    // 再让 effect 跑过 idle 一帧（确保 useEffect 的 persist 触发）
    await new Promise((r) => setTimeout(r, 50));
    // 改变吸光度 → 应同步立即写盘
    const sampleInput = screen.getByLabelText('R1 吸光度') as HTMLInputElement;
    fireEvent.change(sampleInput, { target: { value: '0.284' } });
    // 不 await timer（不再有防抖）：紧接着读 localStorage 应有值
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect((draft!.cells[`${indId}:${rId}`] as { sample?: string }).sample).toBe('0.284');
  });

  it('空白与稀释修改后也立即同步写盘', async () => {
    const { indId } = await seedBasic();
    render(<EntryPage />);
    await screen.findByLabelText('空白', undefined, { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 100));
    const blankInput = screen.getByLabelText('空白') as HTMLInputElement;
    fireEvent.change(blankInput, { target: { value: '0.015' } });
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect((draft!.defaults[indId!] as { blank?: string }).blank).toBe('0.015');
  });
});

describe('录入草稿：只填进水不填出水也能存（问题：手机端进水浓度先填不存草稿）', () => {
  beforeEach(clearAll);

  it('只在进水检测样输入 → 草稿立即写入（含进水 samples，出水为空也能存）', async () => {
    await seedBasic();
    render(<EntryPage />);
    // 等进水面板渲染出检测样输入
    const input = (await screen.findByLabelText('氨氮 进水检测样', undefined, { timeout: 3000 })) as HTMLInputElement;
    await new Promise((r) => setTimeout(r, 100));
    fireEvent.change(input, { target: { value: '0.284' } });
    const draft = loadDraft();
    expect(draft).not.toBeNull();
    expect(
      Object.values((draft?.influent?.samples ?? {}) as Record<string, string>).some((v) => v === '0.284'),
    ).toBe(true);
  });
});
