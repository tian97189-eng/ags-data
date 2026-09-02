import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom 不实现 URL.createObjectURL/revokeObjectURL（文件下载场景需要）
if (typeof URL.createObjectURL !== 'function') {
  // @ts-expect-error 测试环境 polyfill
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  // @ts-expect-error 测试环境 polyfill
  URL.revokeObjectURL = vi.fn();
}

// jsdom 不实现 matchMedia（深色模式系统偏好需要）
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => cleanup());

// jsdom 没内置 fetch：默认 mock 成 200 + 空 JSON（各测试可单独覆盖）
if (typeof globalThis.fetch !== 'function') {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  }) as typeof fetch;
}

