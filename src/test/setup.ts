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

afterEach(() => cleanup());

