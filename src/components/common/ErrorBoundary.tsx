import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * 全局错误边界：任一页面组件抛错时，不再整页白屏卡死，
 * 而是显示错误详情 + 「返回数据录入」「重试」两个按钮，让用户能继续用其他页面。
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; info: string }
> {
  state = { error: null as Error | null, info: '' };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 控制台留痕，方便排查
    // eslint-disable-next-line no-console
    console.error('[AGS] 页面崩溃：', error, info.componentStack);
    this.setState({ info: info.componentStack ?? '' });
  }

  private handleReset = () => {
    this.setState({ error: null, info: '' });
  };

  private handleGoHome = () => {
    window.location.hash = '#/entry';
    this.setState({ error: null, info: '' });
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="p-6 max-w-2xl">
        <div className="border border-red-200 rounded-lg p-5 bg-red-50">
          <h2 className="text-sm font-medium text-red-800 mb-2">这个页面出错了</h2>
          <p className="text-xs text-red-700 mb-3">
            数据都已经保存在本地，不会丢失。你可以返回其他页面继续工作，把下面的错误信息发给我来修复。
          </p>
          <pre className="text-[11px] bg-white border border-red-200 rounded p-3 overflow-x-auto whitespace-pre-wrap text-slate-700">
            {error.message || String(error)}
            {info ? `\n\n${info.split('\n').slice(0, 6).join('\n')}` : ''}
          </pre>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-3 py-1.5 text-xs rounded-md border border-red-300 text-red-700 hover:bg-red-100"
            >
              重试
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700"
            >
              返回数据录入
            </button>
          </div>
        </div>
      </div>
    );
  }
}
