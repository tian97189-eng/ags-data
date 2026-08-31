import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../../db/schema';
import IndicatorSettings from './IndicatorSettings';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

beforeEach(clearAll);

describe('IndicatorSettings 自定义指标支持公式/标准曲线', () => {
  it('新增自定义指标默认是直读，但能选吸光度换算', async () => {
    render(<IndicatorSettings />);
    await userEvent.click(screen.getByText('新增自定义指标'));
    // 弹出对话框
    const nameInput = screen.getByLabelText('名称') as HTMLInputElement;
    await userEvent.type(nameInput, 'COD-TN');
    // 计量方式下拉默认 direct
    const methodSelect = screen.getByLabelText('计量方式') as HTMLSelectElement;
    expect(methodSelect.value).toBe('direct');
    // 切换为吸光度换算
    await userEvent.selectOptions(methodSelect, 'absorbance');
    // 出现提示
    expect(screen.getByText(/标准曲线/)).toBeInTheDocument();
    // 保存
    await userEvent.click(screen.getByText('保存'));
    // 验证 db 里的 method
    await waitFor(async () => {
      const all = await db.indicators.toArray();
      const newInd = all.find((i) => i.name === 'COD-TN');
      expect(newInd).toBeDefined();
      expect(newInd?.method).toBe('absorbance');
      expect(newInd?.category).toBe('custom');
    });
  });

  it('编辑自定义指标时能改 method（直读 → 吸光度换算）', async () => {
    // 预先插一条直读的自定义指标
    await db.indicators.add({
      name: 'SRT', category: 'custom', method: 'direct', unit: 'd',
      defaultDilution: 1, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 10,
    });

    render(<IndicatorSettings />);
    await screen.findByText('SRT');
    await userEvent.click(screen.getAllByText('编辑')[0]);

    const methodSelect = (await screen.findByLabelText('计量方式')) as HTMLSelectElement;
    expect(methodSelect.value).toBe('direct');
    await userEvent.selectOptions(methodSelect, 'absorbance');
    await userEvent.click(screen.getByText('保存'));

    await waitFor(async () => {
      const srt = await db.indicators.where('name').equals('SRT').first();
      expect(srt?.method).toBe('absorbance');
    });
  });

  it('内置指标 method 不能改（下拉禁用）', async () => {
    await db.indicators.add({
      name: '氨氮', category: 'basic', method: 'absorbance', unit: 'mg/L',
      defaultDilution: 10, refLow: null, refHigh: null, lod: null, active: true, sortOrder: 1,
    });

    render(<IndicatorSettings />);
    await screen.findByText('氨氮');
    const editButtons = screen.getAllByRole('button', { name: '编辑' });
    await userEvent.click(editButtons[0]);

    // 用 id 选择器直接拿（label+htmlFor 关联下 getByLabelText 在 jsdom 也偶尔失灵）
    const methodSelect = (await waitFor(() =>
      document.querySelector('select#ind-method') as HTMLSelectElement | null,
    )) as HTMLSelectElement;
    expect(methodSelect).not.toBeNull();
    expect(methodSelect.disabled).toBe(true);
  });

  it('吸光度换算模式下，稀释倍数输入框可用（不锁）', async () => {
    render(<IndicatorSettings />);
    await userEvent.click(screen.getByText('新增自定义指标'));
    const methodSelect = screen.getByLabelText('计量方式');
    await userEvent.selectOptions(methodSelect, 'absorbance');
    // 默认稀释输入框可用
    const dilutionInput = screen.getByLabelText('默认稀释倍数') as HTMLInputElement;
    expect(dilutionInput.disabled).toBe(false);
    // 切回 direct → 锁定
    await userEvent.selectOptions(methodSelect, 'direct');
    expect(dilutionInput.disabled).toBe(true);
  });
});