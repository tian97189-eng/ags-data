import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { db } from '../../db/schema';
import AppearanceSettings from './AppearanceSettings';
import { useAppStore } from '../../store/useAppStore';

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

describe('AppearanceSettings 外观切换', () => {
  beforeEach(async () => {
    await clearAll();
    useAppStore.setState({ theme: 'system' });
  });

  it('三选一都显示（浅色/深色/跟随系统）', () => {
    render(<AppearanceSettings />);
    expect(screen.getByText('浅色')).toBeTruthy();
    expect(screen.getByText('深色')).toBeTruthy();
    expect(screen.getByText('跟随系统')).toBeTruthy();
  });

  it('选深色 → store.theme 变为 dark 且单选选中', () => {
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByText('深色'));
    expect(useAppStore.getState().theme).toBe('dark');
    expect((screen.getByRole('radio', { name: /跟随系统/ }) as HTMLInputElement).checked).toBe(false);
    const darkRadio = screen.getByRole('radio', { name: /深色/ });
    expect((darkRadio as HTMLInputElement).checked).toBe(true);
  });

  it('选浅色/跟随系统都更新 store', () => {
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByText('浅色'));
    expect(useAppStore.getState().theme).toBe('light');
    fireEvent.click(screen.getByText('跟随系统'));
    expect(useAppStore.getState().theme).toBe('system');
  });
});
