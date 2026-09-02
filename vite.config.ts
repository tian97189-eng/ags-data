import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';
import { ensureCert, readCert } from './scripts/cert.mjs';

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig(async () => {
  // 启动/构建前自动生成或更新自签证书（IP 变化会重新生成）
  await ensureCert();
  const https = readCert();
  const httpsOptions = https ? { key: https.key, cert: https.cert } : undefined;

  return {
    plugins: [
      react(),
      // Capacitor（安卓 APK）加载本地 file:///android_asset/public/ 时，
      // 绝对路径 /assets/... 会指向 file:///assets/... 找不到；改成相对路径
      {
        name: 'fix-absolute-paths-for-capacitor',
        apply: 'build',
        closeBundle() {
          const htmlPath = path.resolve('dist/index.html');
          if (!fs.existsSync(htmlPath)) return;
          let html = fs.readFileSync(htmlPath, 'utf8');
          html = html.replace(/src="\//g, 'src="./').replace(/href="\//g, 'href="./');
          fs.writeFileSync(htmlPath, html);
        },
      },
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
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
      }),
    ],
    server: {
      host: true,
      https: httpsOptions,
    },
    preview: {
      host: true,
      port: 5173,
      // Explicitly false - vite preview INHERITS server.https by default (which is our
      // self-signed cert for LAN HTTPS). Override to plain HTTP so the user does
      // not see the "NET::ERR_CERT_AUTHORITY_INVALID" warning.
      https: false,
    },
    build: {
      emptyOutDir: false,
      // base 用相对路径 './'：电脑浏览器/PWA/Capacitor 本地三种环境都能正确解析
      // （绝对路径 /assets/... 在 Capacitor 加载 file:// 时会指向 file:///assets/...，找不到）
      base: './',
    },
    // 跳过 docx 预构建：docx 包有几兆，esbuild optimizeDeps 在 Windows 上容易崩溃
    // (dev 服务器进程被 esbuild 干掉，浏览器 ERR_EMPTY_RESPONSE)。
    // 排除后 docx 走运行时 transform，首次加载略慢但不崩。
    optimizeDeps: {
      exclude: ['docx'],
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
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
          maxThreads: 2,
        },
      },
    },
  };
});
