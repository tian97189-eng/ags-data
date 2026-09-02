/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // —— 字号：只新增 11px 脚注档，不覆盖 Tailwind 默认（xs=12/sm=14/base=16）——
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }], // 脚注 / 图例
      },
      // —— 柔和卡片阴影（层次靠它，不靠粗边框）——
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.06)',
        'card-hover': '0 2px 6px 0 rgba(15, 23, 42, 0.06), 0 4px 12px 0 rgba(15, 23, 42, 0.08)',
      },
      // —— 主色青绿（与 Tailwind teal 对齐，语义别名）——
      colors: {
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
      },
    },
  },
  plugins: [],
};
