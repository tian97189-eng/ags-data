import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

/** 一个渲染时必定抛错的组件 */
function Boom({ msg = 'boom' }: { msg?: string }) {
  throw new Error(msg);
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('子组件正常时不拦截，直接渲染', () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('正常内容')).toBeTruthy();
  });

  it('子组件抛错 → 显示错误卡片而不是白屏', () => {
    // React 会把错误打到 console，静音避免噪音
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom msg="测试崩溃信息" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('这个页面出错了')).toBeTruthy();
    expect(screen.getByText(/测试崩溃信息/)).toBeTruthy();
  });

  it('错误卡片有「返回数据录入」按钮，点了能跳回首页（避免卡死）', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const btn = screen.getByText('返回数据录入');
    fireEvent.click(btn);
    expect(window.location.hash).toBe('#/entry');
  });

  it('点「重试」后重新渲染子组件', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function Maybe() {
      if (shouldThrow) throw new Error('第一次崩');
      return <div>恢复成功</div>;
    }
    render(
      <ErrorBoundary>
        <Maybe />
      </ErrorBoundary>,
    );
    expect(screen.getByText('这个页面出错了')).toBeTruthy();

    // 让子组件下次不再抛错，再点重试
    shouldThrow = false;
    fireEvent.click(screen.getByText('重试'));
    expect(screen.getByText('恢复成功')).toBeTruthy();
  });

  it('提示用户数据不会丢失', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/数据都已经保存在本地/)).toBeTruthy();
  });
});
