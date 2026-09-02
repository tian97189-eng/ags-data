import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExtrasPage from './index';
import { db } from '../../db/schema';

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

describe('ExtrasPage 打开方法详情（需求4：录入页跳转入口）', () => {
  beforeEach(clearAll);

  it('传入 openMethod=氨氮 → 自动切到实验方法 tab 并打开匹配详情', async () => {
    render(<ExtrasPage openMethod="氨氮" />);

    // 种子方法里有「氨氮测定」，匹配后打开详情
    await waitFor(
      () => {
        expect(screen.getByText(/操作步骤/)).toBeTruthy();
      },
      { timeout: 2500 },
    );
  });

  it('方法详情里有「去录入」按钮，点击跳回录入页', async () => {
    render(<ExtrasPage openMethod="氨氮" />);
    const btn = await waitFor(() => screen.getByText('去录入'), { timeout: 2500 });
    fireEvent.click(btn);
    expect(window.location.hash).toContain('#/entry');
  });
});
