import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../../db/schema';
import ReactorSettings from './ReactorSettings';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

describe('ReactorSettings', () => {
  beforeEach(clearAll);

  it('渲染反应器列表并支持停用', async () => {
    const id = await db.reactors.add({
      code: 'R1', name: 'R1', note: '', active: true, sortOrder: 1, createdAt: '',
    });
    render(<ReactorSettings />);
    await screen.findByText('停用');

    await userEvent.click(screen.getByText('停用'));
    await waitFor(async () => {
      expect((await db.reactors.get(id))?.active).toBe(false);
    });
  });

  it('新增反应器写入数据库', async () => {
    render(<ReactorSettings />);
    await screen.findByText('新增反应器');
    await userEvent.click(screen.getByText('新增反应器'));

    const inputs = document.querySelectorAll('input');
    await userEvent.type(inputs[0], 'R4');
    await userEvent.click(screen.getByText('保存'));

    await waitFor(async () => {
      const r = await db.reactors.where('code').equals('R4').first();
      expect(r).toBeTruthy();
      expect(r?.name).toBe('R4');
    });
  });

  it('编号为空时不允许保存', async () => {
    render(<ReactorSettings />);
    await screen.findByText('新增反应器');
    await userEvent.click(screen.getByText('新增反应器'));
    await userEvent.click(screen.getByText('保存'));

    expect(await db.reactors.count()).toBe(0);
  });

  it('表格窄屏适配：表格有 min-w + 父容器可横向滚动（避免手机端列被挤成单字）', async () => {
    await db.reactors.add({
      code: 'R1', name: 'R1', note: '好氧罐', active: true, sortOrder: 1, createdAt: '',
    });
    render(<ReactorSettings />);
    await screen.findByText('好氧罐');

    const table = document.querySelector('table');
    expect(table).not.toBeNull();
    // 表格设了 min-w-[640px]，避免被压扁
    expect(table!.className).toMatch(/min-w-\[640px\]/);
    // 父容器 overflow-x-auto 提供横向滚动
    expect(table!.parentElement!.className).toMatch(/overflow-x-auto/);
    // 关键列有最小宽度与 nowrap（防止"亚硝态氮""吸光度换算"被压成竖排）
    const ths = table!.querySelectorAll('thead th');
    const thClasses = Array.from(ths).map((th) => th.className).join(' | ');
    expect(thClasses).toMatch(/min-w-\[6rem\]/); // 显示名
    expect(thClasses).toMatch(/min-w-\[8rem\]/); // 备注
    expect(thClasses).toMatch(/min-w-\[7\.5rem\]/); // 操作
    expect(thClasses).toMatch(/whitespace-nowrap/);
  });
});
