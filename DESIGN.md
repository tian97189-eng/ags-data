# AGS 数据台 · 视觉规范 v1.0

> 定位：**实验数据工具**（长时间录入 + 看数据），参照 GraphPad Prism / Notion / Linear。
> 关键词：**清爽、克制、耐看、不累眼**。靠留白和层次说话，不靠花哨。

---

## 0. 一句话原则

**一个主色贯穿 + 暖灰中性底 + 圆角卡片浮起 + 数字等宽右对齐。**

---

## 1. 色彩

### 1.1 主色 · 青绿 teal（贯穿全局）

| 用途 | 色值 | Tailwind 类 |
|------|------|-------------|
| 主按钮 / 强调 / 选中 | `#0d9488` | `bg-brand-600` |
| 主色深（hover / 标题强调） | `#0f766e` | `text-brand-700` |
| 主色更深（图表主系列） | `#115e59` | `text-brand-800` |
| 浅底（选中态 / 提示背景） | `#f0fdfa` | `bg-brand-50` |
| 浅描边 | `#99f6e4` | `border-brand-200` |

**适用范围**（现在只在按钮上，要扩到）：
- 侧边栏选中态、底部导航选中态
- 页面标题左侧的强调（如一条 3px 竖线或色块）
- 图表系列色、统计卡强调数字
- 超范围数据标色、警示色之外的"正常/关注"色

### 1.2 中性底 · 暖灰 slate（不抢戏）

| 用途 | 色值 | Tailwind 类 |
|------|------|-------------|
| 页面背景 | `#f8fafc` | `bg-slate-50` |
| 卡片背景 | `#ffffff` | 白 |
| 分隔线 / 边框 | `#e2e8f0` | `border-slate-200` |
| 次要文字 | `#64748b` | `text-slate-500` |
| 弱化文字 / 占位 | `#94a3b8` | `text-slate-400` |
| 主文字 | `#1e293b` | `text-slate-800` |
| 标题文字 | `#0f172a` | `text-slate-900` |

**原则**：灰只做背景和次要文字。凡是"要让人注意的数字/结论"用 `slate-800/900` 或主色，不用灰。

### 1.3 语义色（警示，克制使用）

| 语义 | 色值 | 用途 |
|------|------|------|
| 危险 / 删除 / 超上限 | `#dc2626`（red-600） | 删除按钮、超范围红标 |
| 警告 / 超下限 | `#d97706`（amber-600） | 接近限值提示 |
| 成功 / 正常 | `#0d9488`（主色） | 与主色一致，不另开绿色 |

**注意**：涨跌红绿是股票约定，本项目**不适用**。数据异常用 red/amber 标"超范围"，正常值不标色。

---

## 2. 字号（解决"太挤"的核心）

现状：`text-xs`（12px）出现 236 次，满屏一个号，没有主次。

| 层级 | 字号 | 行高 | Tailwind | 用在哪 |
|------|------|------|----------|--------|
| 页面标题 | 15px | 22px | `text-lg` | PageHeader 的 h1 |
| 卡片标题 | 14px | 20px | `text-base` | 每个卡片的 `<div>` 标题 |
| 正文 | 13px | 20px | `text-sm` | 表格、表单、说明 |
| 次要 | 12px | 16px | `text-xs` | 表头、辅助标签 |
| 脚注 | 11px | 16px | `text-2xs` | 底部提示、图例 |

**迁移规则**：
1. 现在到处 `text-xs` → 数据表格和表单正文**升到 `text-sm`（13px）**。
2. 卡片标题从 `text-sm` → `text-base`（14px）。
3. 只剩"表头、辅助标签、提示"保留 12px 以下。

---

## 3. 圆角 / 阴影 / 间距

| 元素 | 圆角 | 阴影 | 内边距 |
|------|------|------|--------|
| 卡片 | `rounded-lg`（12px） | `shadow-card` | `p-4`（16px） |
| 小按钮 / 输入框 | `rounded-md`（8px） | 无 | `px-3 py-1.5` |
| 统计大数字卡 | `rounded-lg` | `shadow-card` | `p-4` |
| 弹窗 | `rounded-xl`（16px） | `shadow-card-hover` | `p-5` |

**原则**：卡片用 `bg-white + rounded-lg + shadow-card`，**不要**再用 `border-slate-200` 平铺细框（那是现在"像 Excel"的根源）。边框只在"表格分隔线"和"输入框"上用。

---

## 4. 组件规范

### 4.1 统计卡（Metric Card）
- 灰标签在上（13px `text-slate-500`），大号数字在下（24px `font-medium`，数字用 `tabular-nums`）
- 白底 `rounded-lg shadow-card p-4`，四张一排 `grid-cols-2 md:grid-cols-4 gap-3`
- 需要强调的卡用 `bg-brand-600` 反色（白字 + 浅青标签）

### 4.2 数据表格
- 表头：`bg-slate-50 text-xs text-slate-500 font-medium`
- 正文：`text-sm`（13px），行分隔用 `border-slate-100`（极淡）
- **数字列一律右对齐 + `tabular-nums`**（等宽数字，扫一眼对齐）
- 悬停行 `hover:bg-slate-50`

### 4.3 按钮
- 主按钮：`bg-brand-600 text-white rounded-md hover:bg-brand-700`
- 次按钮：`bg-white border-slate-200 text-slate-600 hover:bg-slate-50`
- 危险：`text-red-600`（文字式，删除用）

### 4.4 输入框
- `border-slate-200 rounded-md px-2 py-1.5 text-sm`（焦点 `focus:ring-brand-300`）
- 标签用 `text-xs text-slate-500`

### 4.5 导航
- 侧边栏选中态：`bg-brand-50 text-brand-800`（替代现在的 `bg-white border-slate-300`）
- 底部导航（手机）选中态：`text-brand-600`

---

## 5. 图表（ECharts）

- **系列色统一用青绿系**，多罐分线时按顺序取：
  - 系列1 `#0d9488`（brand-600）
  - 系列2 `#0f766e`（brand-700）
  - 系列3 `#14b8a6`（brand-500）
  - 系列4 `#115e59`（brand-800）
- **清掉现在的紫色散点 `#534AB7`**（Stats 相关性图），改成 `#0d9488`。
- 坐标轴文字 `#64748b`，网格线 `#f1f5f9`，字号 11px。

---

## 6. 落地顺序（建议按此推进）

1. **字号分级**：正文 12→13px、卡片标题 12→14px（改动最大但最见效）
2. **主色贯穿**：导航选中态 + 图表系列色 + 统计卡强调
3. **卡片浮起**：`border-slate-200` → `shadow-card`
4. **数字等宽右对齐**：表格数字列统一 `tabular-nums`
5. **图表配色统一**：清紫色，全走青绿系

每完成一步跑一次全量测试 + 截图给你验收。

---

## 附：Tailwind 配置已落地（tailwind.config.js）

已新增：
- 字号 `2xs/xs/sm/base/lg`（对应 11/12/13/14/15px）
- 阴影 `shadow-card` / `shadow-card-hover`
- 主色别名 `brand-50~900`（= teal 色板）

后续改组件时可直接用 `text-sm`（13px正文）、`bg-brand-600`、`shadow-card` 这些类。
