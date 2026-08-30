import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

describe('PWA 配置与资源', () => {
  const root = process.cwd();

  it('manifest 图标文件存在', () => {
    expect(existsSync(path.join(root, 'public', 'pwa-192.png'))).toBe(true);
    expect(existsSync(path.join(root, 'public', 'pwa-512.png'))).toBe(true);
    expect(existsSync(path.join(root, 'public', 'icon.svg'))).toBe(true);
  });

  it('index.html 设置了主题色和视口', () => {
    const html = readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).toContain('theme-color');
    expect(html).toContain('viewport');
  });

  it('vite 配置启用了 PWA 插件', () => {
    const cfg = readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
    expect(cfg).toContain('vite-plugin-pwa');
    expect(cfg).toContain("name: 'AGS 数据台'");
  });
});
