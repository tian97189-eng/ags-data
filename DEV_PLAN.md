# AGS 数据台 · 开发计划

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.0 |
| 编写日期 | 2026-08-30 |
| 依据 | `PRD.md` v1.0 |
| 目标 | 从零做出第一版可日常使用的 AGS 数据管理工具 |

> **这份计划怎么用**
> 按 P0 → P9 顺序执行，每个阶段结束后**停下来交付给用户验收**，通过再进下一阶段。
> 每阶段都有"完成判据"，是可以自己动手验的具体操作，不是感觉。
>
> **标记约定**
> - 【判据】该阶段做完的验收动作，必须逐条实操通过
> - 【风险】已知坑，提前给对策
> - 【TBD】需用户拍板后才能定稿的技术选择

---

## 1. 技术选型

### 1.1 已确认的环境

| 项 | 现状 | 处理 |
|---|---|---|
| Node.js | v22.22.2 | 满足要求 |
| npm | 10.9.7 | 满足要求 |
| git | 2.55.0 | 会用来做代码版本管理 |
| npm 源 | registry.npmjs.org（官方，国内慢） | **切换为 `https://registry.npmmirror.com`** |
| pnpm | 未安装 | 不用，统一用 npm |

### 1.2 技术栈

| 用途 | 选型 | 为什么选它（大白话） |
|---|---|---|
| 界面框架 | React 18 | 用的人最多，出问题网上一搜就有答案 |
| 语言 | TypeScript | 你的数据字段特别多，类型能在写错字段名时立刻报错，防止"张冠李戴" |
| 构建工具 | Vite | 启动快，改一行代码页面立刻更新 |
| 样式 | Tailwind CSS | 不用单独写 CSS 文件，改界面快 |
| 本地数据库 | Dexie.js（包装 IndexedDB） | 浏览器自带的数据库太难用，Dexie 把它变成几行人话 |
| 图表 | Apache ECharts | 科研绘图最强，双 Y 轴、框选放大、导出图片全是现成的 |
| Excel 读写 | SheetJS (xlsx) | 导出 Excel、读备份文件都靠它 |
| 状态管理 | Zustand | 比 Redux 简单得多，够用 |
| PWA | vite-plugin-pwa | 一键生成"添加到主屏幕"和离线需要的文件 |

### 1.3 不用什么

- **不用后端服务器**：数据全部在浏览器本地，没有服务端
- **不用数据库软件**：不装 MySQL / SQLite，用浏览器自带的 IndexedDB
- **不用登录系统**：单人本机

---

## 2. 环境准备

### 2.1 一次性准备（P0 阶段执行）

```bash
# 1. 切换国内镜像（否则装包会很慢甚至超时）
npm config set registry https://registry.npmmirror.com

# 2. 在项目目录初始化 git（重要：改坏了能回退）
cd "C:/Users/sky/Desktop/数据APP"
git init
git config user.name "sky"
git config user.email "sky@local"
```

**为什么要 git**：这个项目你会用很久，我会不断改代码。每次阶段完成打一个"存档点"，哪次改出问题能一键退回去。对你而言就是个后悔药，不用学命令，我会代劳。

### 2.2 项目依赖清单

```jsonc
// 生产依赖
"react", "react-dom", "react-router-dom",
"dexie", "dexie-react-hooks",
"echarts", "echarts-for-react",
"xlsx", "zustand", "date-fns"

// 开发依赖
"vite", "@vitejs/plugin-react",
"typescript", "@types/react", "@types/react-dom",
"tailwindcss", "postcss", "autoprefixer",
"vite-plugin-pwa"
```

---

## 3. 项目结构

```
数据APP/
├─ PRD.md                   需求文档
├─ DEV_PLAN.md              本文件
├─ package.json
├─ vite.config.ts
├─ tailwind.config.js
├─ tsconfig.json
├─ index.html
├─ start.bat                双击启动（内容全英文，避免中文编码问题）
├─ public/icons/            PWA 图标
└─ src/
   ├─ main.tsx
   ├─ App.tsx
   ├─ db/
   │   ├─ schema.ts         Dexie 表定义（PRD 4 节的落地）
   │   ├─ seed.ts           内置五个指标 + 默认反应器初始化
   │   └─ queries.ts        常用查询封装
   ├─ lib/
   │   ├─ calibration.ts    ★ 标曲拟合、生效查找、浓度换算
   │   ├─ stats.ts          去除率、NAR、均值、标准差、相关系数
   │   ├─ paste.ts          Excel 粘贴解析
   │   ├─ excel.ts          Excel 导出
   │   ├─ backup.ts         备份导出 / 导入
   │   └─ format.ts         数字格式化、异常状态判定
   ├─ store/
   │   └─ useAppStore.ts    全局状态（当前日期、当前周期等）
   ├─ components/
   │   ├─ layout/           Sidebar / BottomNav / PageHeader
   │   ├─ common/           MetricCard / Chip / ConfirmDialog / Toast / EmptyState
   │   └─ table/            EditableCell / ReadonlyCell / GroupHeader
   └─ pages/
       ├─ Entry/            模块一 数据录入
       ├─ Cycle/            模块二 全周期
       ├─ Query/            模块三 查询整理
       ├─ Chart/            模块四 可视化
       ├─ Stats/            模块五 统计分析
       └─ Settings/         模块六（反应器 / 标曲 / 指标 / 备份）
```

**为什么把算法集中在 `lib/`**：换算公式、标曲查找这些是全局最要命的逻辑，集中放一处，改的时候只改一个文件，也方便单独测试。

---

## 4. 数据库 Schema（可直接落代码）

`src/db/schema.ts`：

```ts
import Dexie, { type Table } from 'dexie';

export class AgsDB extends Dexie {
  reactors!: Table<Reactor, number>;
  indicators!: Table<Indicator, number>;
  curves!: Table<CalibrationCurve, number>;
  cycles!: Table<CycleRun, number>;
  measurements!: Table<Measurement, number>;
  influents!: Table<Influent, number>;
  defaults!: Table<DailyDefault, number>;
  customRecords!: Table<CustomRecord, number>;
  settings!: Table<SettingKV, string>;

  constructor() {
    super('ags-data');
    this.version(1).stores({
      reactors:      '++id, code, active, sortOrder',
      indicators:    '++id, name, category, method, active, sortOrder',
      curves:        '++id, indicatorId, effectiveFrom, [indicatorId+effectiveFrom]',
      cycles:        '++id, date',
      measurements:  '++id, scene, date, reactorId, indicatorId, cycleRunId, [date+scene], [reactorId+indicatorId+date]',
      influents:     '++id, date, mode, reactorId, [date+indicatorId]',
      defaults:      '++id, &[scopeKey+indicatorId]',
      customRecords: '++id, date, reactorId, indicatorId',
      settings:      'key'
    });
  }
}
export const db = new AgsDB();
```

### 4.1 关键设计说明

| 设计 | 理由 |
|---|---|
| `measurements` 用长表（一条 = 一次测量） | 加指标、加罐都不用改表结构 |
| `measurements` 冗余存 `curveId` | **PRD 5.2 硬性要求**，旧标曲停用后仍能追溯 |
| `defaults` 用 `scopeKey` 而非 `date + cycleRunId` | 日常用 `"daily:2026-08-30"`，周期用 `"cycle:17"`，统一成字符串避免空值索引问题 |
| `settings` 用 key-value | 存检出限、默认间隔、进水模式等零散配置 |
| 所有金额/浓度用 `number` 存原始值 | 显示时才格式化，避免精度丢失 |

### 4.2 内置数据初始化（seed）

首次启动时写入：
- 4 个 absorbance 指标：氨氮、硝态氮、亚硝态氮、总P
- 1 个 direct 指标：COD
- 默认反应器 R1、R2、R3（用户可改）
- 默认设置：`intervalMinutes=30`、`influentMode=shared`

---

## 5. 核心算法（先写先测，后面全靠它）

### 5.1 `lib/calibration.ts`

```ts
/** 最小二乘拟合，返回 k(斜率)、b(截距)、r2(决定系数) */
export function linearRegression(points: { concentration: number; absorbance: number }[]):
  { k: number; b: number; r2: number } | null;
// 边界：点数 < 2 返回 null；所有 x 相同返回 null

/** 按日期查找该指标生效的标曲 */
export function resolveCurve(indicatorId: number, date: string): Promise<CalibrationCurve | null>;
// 规则：effectiveFrom <= date 且 (effectiveTo 为空 或 effectiveTo >= date)
// 若有多条命中取 effectiveFrom 最大的一条；无命中返回 null

/** 核心换算 */
export function computeConcentration(p: {
  sampleAbs: number;      // 水样吸光度
  blankAbs: number;       // 空白吸光度
  dilution: number;       // 稀释倍数
  curve: CalibrationCurve | null;
  lod?: number | null;    // 检出限，可选
}): {
  value: number | null;
  status: 'ok' | 'noCurve' | 'belowLOD' | 'negative';
};
// value = (sampleAbs - blankAbs - curve.b) / curve.k * dilution
// 无标曲 → status='noCurve', value=null（界面显示"—"，严禁填 0）
// 结果 < 0        → status='negative', 保留负值，界面标黄
// 结果 < lod      → status='belowLOD', 界面显示"未检出"
```

### 5.2 `lib/stats.ts`

```ts
export function removalRate(influent: number | null, effluent: number | null): number | null;
// 任一为 null → 返回 null（严禁按 0 计算）

export function nar(no2: number | null, no3: number | null): number | null;
// no2 / (no2 + no3) * 100；分母为 0 → null

export function mean(xs: number[]): number | null;
export function stdev(xs: number[]): number | null;      // 样本标准差，n-1
export function pearson(xs: number[], ys: number[]): number | null;  // 长度不等或 <3 → null
export function attainmentRate(values: number[], threshold: number | null,
                               direction: 'below' | 'above'): number | null;
// 空数组或 threshold 为 null → null
```

### 5.3 `lib/paste.ts`（全周期录入的命脉）

```ts
/** 剪贴板文本 → 二维表格。自动识别 Excel 的 TSV 和 CSV 的逗号 */
export function parseClipboardTable(text: string): string[][];

/** 把粘贴内容映射到录入网格，返回逐格赋值结果和无法对位的单元格数量 */
export function mapPasteToGrid(grid: string[][], opts: {
  startRow: number; startCol: number; maxRows: number; maxCols: number;
}): { cells: { r: number; c: number; raw: string }[]; overflowRows: number; overflowCols: number };
// 溢出行列不静默丢弃，必须提示用户"有 N 行 M 列超出范围未被粘贴"
```

### 5.4 `lib/backup.ts`

```ts
export interface BackupFile {
  format: 'ags-backup';
  version: 1;
  exportedAt: string;
  data: {
    reactors: Reactor[]; indicators: Indicator[]; curves: CalibrationCurve[];
    cycles: CycleRun[]; measurements: Measurement[]; influents: Influent[];
    defaults: DailyDefault[]; customRecords: CustomRecord[]; settings: SettingKV[];
  };
}
export function exportBackup(): Promise<Blob>;
export function importBackup(file: File, mode: 'merge' | 'overwrite'): Promise<ImportReport>;
// merge：按业务键去重（measurements 按 date+scene+reactorId+indicatorId+time）
// overwrite：清空后全量写入。两种模式执行前都要求用户在界面上二次确认
```

---

## 6. 分阶段开发计划

### P0 · 项目地基

**目标**：能跑起来一个带左侧导航的空壳，数据库表建好，内置指标初始化好。

| # | 任务 | 产出 |
|---|---|---|
| T0.1 | 切 npm 镜像、git init | `.git/` |
| T0.2 | 创建 Vite + React + TS 项目，装齐依赖 | `package.json` 等 |
| T0.3 | 配置 Tailwind、路由、全局样式 | `tailwind.config.js` |
| T0.4 | 写 Dexie Schema | `src/db/schema.ts` |
| T0.5 | 写 seed 初始化（五个指标 + R1/R2/R3） | `src/db/seed.ts` |
| T0.6 | 实现左侧导航布局 + 六个空页面 + 底部导航（窄屏） | `src/components/layout/` |
| T0.7 | 通用组件：MetricCard / Chip / ConfirmDialog / Toast / EmptyState | `src/components/common/` |

**【判据】**
1. `npm run dev` 能启动，浏览器打开不报错
2. 左侧六个导航项能点，页面能切换
3. 把浏览器窗口拖窄，左侧导航变成底部图标栏
4. 打开浏览器开发者工具 → Application → IndexedDB，能看到 `ags-data` 库和 9 张表
5. 指标表里有 5 条内置数据

---

### P1 · 系统设置核心（反应器 / 指标 / 标曲）

**目标**：先把"会变的东西"管起来。标曲必须在录入之前可用，否则算不出浓度。

| # | 任务 | 产出 |
|---|---|---|
| T1.1 | 二级 tab 框架（反应器 / 标准曲线 / 自定义指标 / 备份与导出） | `pages/Settings/` |
| T1.2 | 反应器管理：增删改、启用停用、排序、备注 | |
| T1.3 | 指标管理：列表、停用、改默认稀释倍数、改参考范围 | |
| T1.4 | 标曲管理：指标 tab（COD 置灰标注"仪器直读"） | |
| T1.5 | 标液录入表：加行/删行、点数不限 | |
| T1.6 | `linearRegression` 接入，实时显示 k / b / R² | `lib/calibration.ts` |
| T1.7 | 拟合散点图（ECharts 散点 + 拟合直线） | |
| T1.8 | 新建标曲：设生效日期、试剂批号、备注 | |
| T1.9 | 生效区间冲突检测与提示 | |
| T1.10 | 历史曲线列表：显示状态 + "仍算着 N 条旧数据" | |

**【判据】**
1. 新建一条氨氮标曲，填 6 个点，k/b/R² 立刻显示，散点图画出拟合直线
2. 手算验证：用计算器算一遍斜率，跟软件显示的 k 一致（小数点后 3 位内）
3. 再建一条生效日期更早的曲线，系统提示区间冲突
4. COD 的指标 tab 是灰的，点不动，旁边写着"仪器直读，不用标曲"
5. 停用一条标曲，它变成"停用"状态，不消失

---

### P2 · 模块一 日常录入（核心中的核心）

**依赖**：P0、P1

| # | 任务 | 产出 |
|---|---|---|
| T2.1 | 日期选择器，切换日期自动带出已有数据 | |
| T2.2 | 进水模式切换（共享 / 分罐），按模式渲染 1 行或 N 行 | |
| T2.3 | 当次共用行：空白吸光度、默认稀释倍数，默认沿用上次 | `db.defaults` |
| T2.4 | 录入表格：行=罐，列=指标（分组表头） | `components/table/` |
| T2.5 | 吸光度格可编辑，浓度格只读绿色字 | |
| T2.6 | 实时换算：输入吸光度立即出浓度 | |
| T2.7 | 单格覆盖空白 / 稀释倍数，橙色角标标记 | |
| T2.8 | 异常状态：负值标黄、低于检出限显示"未检出"、无标曲显示"—" | |
| T2.9 | 保存按钮 + 写入 IndexedDB + Toast 反馈 | |
| T2.10 | 停用的罐不出现在录入表 | |

**【判据】**
1. 选今天，把 R1 的氨氮吸光度填 0.284，浓度列立刻显示 13.6（跟草图示例一致）
2. 改 R2 的稀释倍数为 ×20，那一格出现橙色角标，R1 不受影响
3. 删掉某指标的标曲后，该指标浓度列显示"—"而不是 0
4. 填一个很小的吸光度使结果为负，该格标黄并显示负值
5. **保存 → 关闭浏览器 → 重新打开 → 选回今天，数据一条不少**
6. 切到 3 天前，录入数据，再切回今天，今天的数据还在

---

### P3 · 模块二 全周期

**依赖**：P0、P1、P2

| # | 任务 | 产出 |
|---|---|---|
| T3.1 | 新建周期实验：日期、名称、起始时间、间隔、参与反应器 | |
| T3.2 | 自动生成时间点行（起始 + 间隔 × 点数） | |
| T3.3 | 指标切换 tab（氨氮 / 硝态氮 / 亚硝态氮 / 总P / COD） | |
| T3.4 | 录入表：行=时间点，列=罐（吸光度 / 浓度两列） | |
| T3.5 | 阶段标记列（厌氧 / 好氧 / 缺氧，选填） | |
| T3.6 | **Excel 粘贴**：整块 Ctrl+V 自动对位 | `lib/paste.ts` |
| T3.7 | 周期统计四卡：起始浓度、最低值、降到目标值用时、阶段速率 | |
| T3.8 | 周期列表：查看 / 重命名 / 删除（删除需二次确认并告知条数） | |

**【判据】**
1. 新建周期：今天 08:00 起，间隔 30 分钟，13 个点 —— 表格自动生成 13 行
2. 在 Excel 里复制 13 行 × 3 列的吸光度，在表格第一格 Ctrl+V，数据正确落位
3. 故意复制 20 行进去，弹出提示"有 7 行超出范围未被粘贴"，且不会盖掉别的
4. 切到"硝态氮" tab，刚才录的氨氮数据还在（切回去能看到）
5. 底部四张卡片出现数字，手算核对"最低值"对得上

> 【风险】OQ-1（填写顺序）与 OQ-2（是否接受单指标切换）未定稿。**T3.3 的实现方式等用户答复后再定**，若改为"一屏看全"则改成分罐分组宽表 + 横向滚动。P3 开工前必须先解决 OQ-1/OQ-2。

---

### P4 · 模块三 查询整理

**依赖**：P2

| # | 任务 | 产出 |
|---|---|---|
| T4.1 | 组合筛选：日期范围 × 罐 × 指标 × 数据类型 × 阶段 | |
| T4.2 | 排序、备注关键词搜索 | |
| T4.3 | 结果表格内直接编辑 | |
| T4.4 | 批量选中删除 + 二次确认（显示影响条数） | |
| T4.5 | 单条数据追溯：当时用的哪条标曲、空白多少、稀释多少 | |
| T4.6 | 筛选结果导出 Excel | `lib/excel.ts` |

**【判据】**
1. 筛"8月 + R1 + 氨氮 + 日常"，结果条数跟手动数的一致
2. 点开某条数据的详情，能看到"标曲：08-20 生效那条，空白 0.012，稀释 ×10"
3. 导出 Excel，打开看列名和数据对得上

---

### P5 · 模块四 可视化

**依赖**：P2、P3

| # | 任务 | 产出 |
|---|---|---|
| T5.1 | 左侧筛选面板（数据类型 / 日期 / 罐 / 指标 / 对比方式） | |
| T5.2 | 日常趋势图（按罐分线） | |
| T5.3 | 周期曲线图（多罐叠加） | |
| T5.4 | 周期叠周期（同罐不同批次） | |
| T5.5 | 按指标分线 / 双轴叠加 | |
| T5.6 | 图例点击隐藏、悬停显示数值、图例显示均值 | |
| T5.7 | 框选放大（ECharts dataZoom） | |
| T5.8 | 导出 PNG | |

**【判据】**
1. 选 R1/R2/R3 + 氨氮 + 近 30 天，出三条不同颜色的线
2. 点图例上的 R2，那条线消失，再点回来
3. 鼠标停在线上某点，显示"08-14　R1　2.4 mg/L"
4. 按住拖一段，X 轴放大到那一段
5. 导出 PNG，图片清晰，白底，能直接贴进 PPT

---

### P6 · 模块五 统计分析

**依赖**：P2、P4

| # | 任务 | 产出 |
|---|---|---|
| T6.1 | 去除率（按进水模式取进水值，缺失显示"—"） | `lib/stats.ts` |
| T6.2 | 亚硝积累率 NAR | |
| T6.3 | 时段统计：均值、标准差、最大、最小、达标率 | |
| T6.4 | 相关性分析：任选两指标出散点图 + 相关系数 | |
| T6.5 | 按罐分组汇总（高氯酸盐梯度对比） | |
| T6.6 | 统计结果导出 Excel | |

**【判据】**
1. 进水 40、出水 13.6 → 去除率显示 66.0%
2. 某天没填进水 → 去除率那一格显示"—"，不是 0%，也不是报错
3. 亚硝 4.9、硝态 16.1 → NAR 显示 23.3%
4. 选"粒径 vs EPS"两个自定义指标，出散点图和相关系数 r
5. 手算一组 5 个数的标准差，跟软件一致

---

### P7 · 备份、导出与报告

**依赖**：P2–P6

| # | 任务 | 产出 |
|---|---|---|
| T7.1 | 全量导出 Excel（含标曲追溯字段） | |
| T7.2 | 备份文件导出（单文件，便于传到手机） | `lib/backup.ts` |
| T7.3 | 备份文件导入，区分"合并 / 覆盖"，默认合并，覆盖需二次确认 | |
| T7.4 | 报告生成：选时间段+罐+指标，生成汇总报告 | |
| T7.5 | 报告导出 Excel / 浏览器打印为 PDF（@media print 样式） | |
| T7.6 | 首次使用与定期的备份提醒 | |

**【判据】**
1. 点"导出备份"，得到一个文件；手动删掉浏览器数据后导入它，数据完全恢复
2. 导入时选"合并"，已有的数据不被重复插入
3. 生成一份 8 月的报告，含图有表，打印成 PDF 能看
4. **数据保真测试（最重要，见第 8 节）全部通过**

---

### P8 · 手机端 PWA 与响应式

**依赖**：P7

| # | 任务 | 产出 |
|---|---|---|
| T8.1 | 全站响应式适配：窄屏布局、表格横向滑动、按钮触控尺寸 | |
| T8.2 | 底部导航在窄屏生效 | |
| T8.3 | 配置 vite-plugin-pwa：manifest、图标、Service Worker | |
| T8.4 | 离线可用性验证 | |
| T8.5 | "添加到主屏幕"引导提示 | |

> 【风险】**PWA 安装必须 HTTPS**。手机通过局域网 `http://192.168.x.x` 访问时，浏览器不会注册 Service Worker，也就是装不了 PWA、断网打不开。
> **对策（按优先级）**
> 1. **主选**：给 dev server 配自签 HTTPS 证书（vite 的 `server.https`），手机首次访问手动信任一次，之后即可正常安装、离线可用。数据仍存手机本地。
> 2. **备选**：不做 PWA 安装，手机浏览器当书签用，数据照样存手机本地（IndexedDB 在 http 局域网下可用），唯一代价是断网时打不开页面。
> 3. 若以上都不接受，再讨论托管方案（会引入联网，与"不联网"要求冲突）。
>
> 【TBD-1】请用户在开工前对以上三选一（建议选 1 或 2）

**【判据】**
1. 手机浏览器打开，界面不溢出、能正常录入一条数据
2. 手机上录入的数据，关掉浏览器再打开还在
3. （若选方案 1）能"添加到主屏幕"，断网后图标仍能打开

---

### P9 · 收尾、启动脚本与交付

| # | 任务 | 产出 |
|---|---|---|
| T9.1 | `start.bat`：一键启动并自动打开浏览器（内容全英文，路径用 `%~dp0` 相对定位，绕开中文路径编码问题） | `start.bat` |
| T9.2 | 应用内帮助页：每个模块一句话说明 + 计算公式出处 | |
| T9.3 | 首屏空状态引导：还没数据时提示"先去设置里建反应器和标曲" | |
| T9.4 | 全套回归自测（按 PRD 验收标准逐条走一遍） | |
| T9.5 | 每个阶段打一个 git 存档点 | |
| T9.6 | 写一份给用户的《使用说明》（说人话，带截图位） | |

**【判据】**
1. 双击 `start.bat`，浏览器自动打开，不用敲任何命令
2. 把整个流程（建标曲 → 录数据 → 画图 → 导出备份 → 导入恢复）从头走一遍无报错
3. `git log` 里能看到每个阶段的存档点

---

## 7. 关键交互的实现要点

### 7.1 单格覆盖（PRD 5.3）

- 表格每格维护 `{ value, overridden }` 两个状态
- 顶部共用行改值时：**只更新 `defaults` 表**，不批量改写已有 measurement
- 单格改值时：写该条 measurement 的 `blankAbs` / `dilution` 并置 `overridden = true`，渲染橙色角标
- 界面上"重置为默认值"按钮可清除 overridden 状态

### 7.2 标曲生效查找（PRD 5.2）

- 所有写入 measurement 的操作，都必须先调 `resolveCurve(indicatorId, date)` 拿到曲线，并把 `curve.id` **一并写入** measurement
- **禁止**在任何地方用"当前生效曲线"直接覆盖历史数据的 `value`
- 提供一次性"重算"工具（放在设置里，默认不自动执行）：按当前标曲重新计算指定日期范围，**执行前弹窗警告并强制先导出备份**

### 7.3 Excel 粘贴（全周期）

- 监听 `paste` 事件，取 `event.clipboardData.getData('text/plain')`
- 先按 `\r\n` 切行，再按 `\t` 切列；若无 `\t` 则回退按 `,` 切列
- 起点为当前聚焦单元格；溢出的行列**统计数量并提示**，不静默丢弃
- 粘贴后逐格走一遍 `computeConcentration`，异常格标黄

### 7.4 数据保存时机

- 录入页为**显式保存**（PRD 1.9）：点"保存"才落库，避免误触写入
- 保存前做一次全表校验，把异常格的数量汇总提示，不阻断保存

---

## 8. 测试计划

### 8.1 数据保真测试（最高优先级，每次大改动后必跑）

| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | 建标曲 A（氨氮，生效 2026-08-01 起，k=0.3785, b=0.0102） | — |
| 2 | 录入 8/01–8/10 共 10 天 × 3 罐的氨氮数据 | 浓度全部正确 |
| 3 | **记录** 8/05 R1 的浓度值，记在纸上 | 比如 12.34 |
| 4 | 新建标曲 B（氨氮，生效 2026-08-11 起，k、b 不同） | 提示"将影响 8/11 之后的数据" |
| 5 | 回到 8/05，查看 R1 氨氮浓度 | **必须还是 12.34，一个数字都不能变** |
| 6 | 导出备份文件 | 得到一个文件 |
| 7 | 清空浏览器全部数据 | 应用回到初始状态 |
| 8 | 导入刚才的备份 | 数据条数、每个数值与备份前完全一致 |
| 9 | 关闭浏览器 → 重开 → 查 8/05 R1 | 仍是 12.34 |

### 8.2 边界测试清单

- [ ] 标曲只有 1 个点 → 提示"至少需要 2 个点"，不崩溃
- [ ] 某指标从未建标曲 → 浓度列显示"—"，可以正常保存吸光度
- [ ] 进水模式从 shared 切到 perReactor → 已录的共享进水不被清空，界面提示
- [ ] 停用某个罐 → 录入页不出现，查询页仍能查到它的历史
- [ ] 删除有历史数据的罐 → 二次确认并显示"将影响 N 条数据"
- [ ] 粘贴 0 行 / 粘贴纯文本 / 粘贴含空行 → 不崩溃，给出明确提示
- [ ] 稀释倍数填 0 或负数 → 提示不合法，拒绝保存该格
- [ ] 日期选到未来 → 允许（可能有预计划），但不参与统计

### 8.3 回归测试

每次阶段完成后，重跑 8.1 全部步骤 + 8.2 清单，确保新功能没破坏老功能。

---

## 9. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| **npm 装包慢/失败** | 卡在 P0 | 已切国内镜像；仍失败则改用 CDN 引入关键库 |
| **IndexedDB 被浏览器清理** | 数据丢失 | 定期提醒备份；提供一键导出；在帮助页写明"清浏览器缓存会清掉数据，请常备份" |
| **PWA 需要 HTTPS** | 手机端装不了 | 见 P8 风险段。【TBD-1】 |
| **中文路径导致 bat 脚本乱码** | 启动脚本失效 | bat 内容全英文、路径用 `%~dp0`；不硬编码中文 |
| **OQ-1/OQ-2 未定稿就开工 P3** | 全周期表格要推倒重来 | **P3 开工前必须先解决**，否则跳过 P3 先做 P4/P5 |
| **ECharts 体积大** | 首屏慢 | 按需引入（只 import 用到的图表类型和组件） |
| **xlsx 社区版功能限制** | 导出格式受限 | 第一版够用；如不够再评估 exceljs |

---

## 10. 里程碑

| 阶段 | 内容 | 可交付状态 |
|---|---|---|
| P0 | 地基 | 空壳能跑 |
| P1 | 设置核心 | 能建反应器、建标曲 |
| **P2** | **日常录入** | **能录能算能存 —— 最小可用** |
| P3 | 全周期 | 能处理密集数据 |
| P4 | 查询整理 | 能查能导 |
| P5 | 可视化 | 能出图 |
| P6 | 统计分析 | 能出结论 |
| P7 | 备份与报告 | 数据有保险 |
| P8 | 手机端 | 移动可用 |
| P9 | 收尾 | 正式交付 |

> **P2 完成即可日常使用**。P3 之后的功能都是增强，可以边用边做，不阻塞。

---

## 11. 待用户确认的技术决策

开工前需要拍板的（前两项是 PRD 遗留的 OQ，会直接改变界面结构）：

| # | 决策点 | 选项 | 建议 |
|---|---|---|---|
| **TBD-1** | 手机端 PWA 方案（见 P8） | ① 自签 HTTPS ② 不做 PWA 只当书签 ③ 托管（需联网） | 选 ①，体验最好；嫌麻烦选 ② |
| **TBD-2** | 填写顺序：先测完一个罐的所有指标，还是先测完所有罐的氨氮？（PRD OQ-1） | 决定日常录入表"按罐分行"还是"按指标分行" | **必须先答，否则 P2 做完后可能要返工** |
| **TBD-3** | 全周期是否接受一次只录一个指标？（PRD OQ-2） | ① 单指标切换 ② 一屏看全（宽表横滚） | 数据量大时 ① 更好用 |
| **TBD-4** | 检出限怎么定？（PRD OQ-6） | ① 指标设置里手工填固定值 ② 跟随标曲自动算 | 选 ①，简单可控 |
| **TBD-5** | 高氯酸盐是只记进水投加量，还是也测出水？（PRD OQ-7） | 影响进水表结构 | 若也测出水，需按普通指标处理 |
| **TBD-6** | 标曲的标液吸光度是否已减过空白？（PRD OQ-5） | 影响 b 的含义 | 建议统一由软件在测样时减，标曲只存原始读数 |

---

## 12. 变更记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v1.0 | 2026-08-30 | 首版。依据 PRD v1.0 编写，环境已实测确认 |
