import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { db } from '../../db/schema';
import SettingsPage from './index';

// 设置页各 tab 子组件加载真实实现即可，但云同步/软件更新涉及 async 逻辑，
// 只需验证「关于本软件」卡片的出现位置，其它 tab 的副作用不影响断言。
vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="echart" />,
}));

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

describe('SettingsPage 公告位置', () => {
  beforeEach(clearAll);

  it('默认在「反应器」tab 不显示「关于本软件」', async () => {
    render(<SettingsPage />);
    expect(await screen.findByText('反应器')).toBeTruthy();
    expect(screen.queryByText('关于本软件')).toBeNull();
  });

  it('切到「软件更新」tab 显示「关于本软件」及作者 QQ', async () => {
    render(<SettingsPage />);
    await screen.findByText('反应器');
    // 点「软件更新」tab
    const chip = screen.getAllByText('软件更新')[0];
    chip.click();

    expect(await screen.findByText('关于本软件')).toBeTruthy();
    expect(screen.getByText('人无再少年')).toBeTruthy();
    expect(screen.getByText(/2448820735/)).toBeTruthy();
    expect(screen.getByText(/好氧颗粒污泥/)).toBeTruthy();
  });

  it('切到其它 tab（备份与导出）不显示「关于本软件」', async () => {
    render(<SettingsPage />);
    await screen.findByText('反应器');
    screen.getAllByText('备份与导出')[0].click();
    await screen.findByText(/导出备份文件/);
    expect(screen.queryByText('关于本软件')).toBeNull();
  });
});
