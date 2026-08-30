import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { ensureCert, readCert } from './scripts/cert.mjs';

export default defineConfig(async () => {
  // 启动/构建前自动生成或更新自签证书（IP 变化会重新生成）
  await ensureCert();
  const https = readCert();
  const httpsOptions = https ? { key: https.key, cert: https.cert } : undefined;

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'AGS 数据台',
          short_name: 'AGS数据台',
          description: '好氧颗粒污泥 AOA 系统数据管理',
          lang: 'zh-CN',
          theme_color: '#0f6e56',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: './',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        },
      }),
    ],
    server: {
      host: true,
      https: httpsOptions,
    },
    preview: {
      host: true,
      port: 4173,
      https: httpsOptions,
    },
    build: {
      emptyOutDir: false,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.test.{ts,tsx}'],
      pool: 'threads',
      poolOptions: {
        threads: {
          minThreads: 1,
          maxThreads: 4,
        },
      },
    },
  };
});
