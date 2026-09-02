import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { db } from '../../db/schema';
import ExperimentPage from './index';
import { loadAnyDraft } from '../../lib/draft';

const DRAFT_KEY = 'ags-experiment-draft';

async function clearAll() {
  for (const t of db.tables) await t.clear();
  localStorage.clear();
}

describe('Experiment 草稿（问题：实验记录误关可恢复）', () => {
  beforeEach(clearAll);

  it('有草稿且表单为空 → 出现恢复条，点恢复把标题/正文填回', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        date: '2026-09-02',
        title: '记录标题',
        content: '正文内容',
        checkedInd: {},
        savedAt: Date.now(),
      }),
    );
    render(<ExperimentPage />);
    await screen.findByText('恢复草稿', undefined, { timeout: 3000 });
    fireEvent.click(screen.getByText('恢复草稿'));
    const title = (await screen.findByDisplayValue('记录标题', undefined, { timeout: 3000 })) as HTMLInputElement;
    expect(title).toBeTruthy();
    const body = screen.getByDisplayValue('正文内容') as HTMLTextAreaElement;
    expect(body).toBeTruthy();
  });

  it('输入标题后（防抖）→ 草稿写入 localStorage（含标题与日期）', async () => {
    render(<ExperimentPage />);
    // 新增表单的标题输入：页面第一个 type=text 的 input
    for (let i = 0; i < 40; i++) {
      const inp = [...document.querySelectorAll<HTMLInputElement>('input')].find((x) => x.type === 'text');
      if (inp) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const title = [...document.querySelectorAll<HTMLInputElement>('input')].find((x) => x.type === 'text')!;
    fireEvent.change(title, { target: { value: '草稿标题' } });
    let draft = null;
    for (let i = 0; i < 40; i++) {
      draft = loadAnyDraft(DRAFT_KEY);
      if (draft?.title === '草稿标题') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(draft?.title).toBe('草稿标题');
    expect(typeof draft?.date).toBe('string');
  });

  it('点「丢弃」→ 草稿清除、恢复条消失', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        date: '2026-09-02', title: '记录标题', content: '', checkedInd: {}, savedAt: Date.now(),
      }),
    );
    render(<ExperimentPage />);
    await screen.findByText('恢复草稿', undefined, { timeout: 3000 });
    fireEvent.click(screen.getByText('丢弃'));
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.queryByText('恢复草稿')).toBeNull();
  });
});
