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
});
