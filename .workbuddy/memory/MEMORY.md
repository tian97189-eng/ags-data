# 项目：好氧颗粒污泥 AOA 系统数据管理 App

## 用户背景
研究生，做 AOA 工艺好氧颗粒污泥，养几罐（数量可变，常见 R1/R2/R3）。
编程小白 —— 用词要避开技术黑话，方案优先选零运维的。

## 已确认的核心规则（不要再问，直接遵守）
1. **标曲**：氨氮、硝态氮、亚硝态氮、总P 每次测定都做多点标准曲线。
   每个指标独立维护一条「当前生效」曲线，管一段时间；重做只影响生效日之后的新数据，
   历史数据永远按旧曲线算。
2. **计算式**：浓度 = (A样 − A空 − b) / k × 稀释倍数。
3. **稀释倍数**：每个指标有默认值（可整行改），某次不同可单格覆盖，只影响该格。
4. **COD 是特例**：仪器直读浓度，手工录入，不走吸光度换算，不需要标曲。
5. **进水两种模式并存，可切换**：
   - 几罐共用一桶进水（常规）
   - 每罐各自进水（高氯酸盐梯度实验特例，各罐浓度不同，去除率按罐分别算）
6. **存储**：纯本地，不联网、不登录、无云数据库。数据在浏览器本地库里，刷新/关机不丢。
   **2026-08-31 变更**：用户主动要求升级为「可选云同步」（实时互通）——默认仍纯本地；
   在设置页填 CloudBase 环境 ID 并启用后，数据实时同步到云端，手机/电脑互通。
7. **手机端**：~~PWA~~ → **2026-08-31 改为原生 APK**（用户放弃证书方案）。电脑与手机数据互通走
   CloudBase 云同步；离线时仍可本地使用，联网自动补传。不做实时云同步的降级方案是备份文件搬运。
8. 公式/标曲设置归入「模块六 · 系统设置 → 参数管理」（用户曾口误称"模块7"）。
9. **工作流约定（2026-09-01 用户明确要求，必须遵守）**：每次修改/开发完成后：
   ① 立即 `git add -A` + 中文说明提交（提交信息写清做了什么、测试数）；
   ② 把本次开发记录追加到 `.workbuddy/memory/YYYY-MM-DD.md`（当天日志），有长期价值的内容才写，
   不记临时信息。`.workbuddy/memory/` 已纳入 git 跟踪，与代码一起提交。

## 页面布局（已确认的草图方案）
- 整体：左侧 118px 固定导航（数据录入 / 全周期 / 查询整理 / 可视化 / 统计分析 / 系统设置）
- 模块一 日常录入：行=罐，列=指标；顶部两行分别设「本次空白吸光度」和「默认稀释倍数」；
  每个指标两列（吸光度输入 / 自动算出的浓度，浓度列用绿色表示只读）
- 模块二 全周期：顶部指标切换 tab（避免列爆炸）；行=时间点，列=罐（吸光度/浓度两列）；
  有阶段标记列（厌氧/好氧/缺氧，选填）；支持从 Excel 整块 Ctrl+V；底部四张统计卡
- 模块四 可视化：左侧筛选面板（数据类型/日期/罐/指标/对比方式）+ 右侧图表；
  三种对比：按罐分线、按指标分线、双轴叠加；支持周期叠周期
- 模块六 标曲管理：二级 tab（反应器/标准曲线/自定义指标/备份与导出）；
  指标 tab 中 COD 置灰标注"仪器直读"；左侧标液表 + 右侧拟合散点图与 k/b/R²/批号；
  下方历史曲线列表，停用项显示"仍算着 N 条旧数据"

## 暂缓（第一版不做）
登录/联网/云同步 · 原生 App · 仪器自动读数 · 动力学拟合 · 自动剔除异常值 ·
高氯酸盐专属分析模块（先当普通自定义指标）

## 假设（用户已点头）
罐数量不限可随时加 · 全周期默认不跨天、默认 30 分钟一点 · 单位统一 mg/L ·
AOA 阶段标记选填不强制

## 技术选型（已定，2026-08-30）
React 18 + TypeScript + Vite + Tailwind + Dexie(IndexedDB) + ECharts + SheetJS(xlsx)
+ Zustand + vite-plugin-pwa。npm 管理包（本机无 pnpm）。npm 源切 npmmirror。
无后端、无数据库软件，数据全在浏览器 IndexedDB。

## 两个已识别的技术坑
1. **PWA 安装必须 HTTPS**：局域网 http 下 Service Worker 注册不了 → 手机装不了 PWA。
   主选自签证书 https；备选退化成书签（数据仍存手机本地，只是断网打不开）。
2. **Windows bat 遇中文路径乱码**：start.bat 内容保持全英文，路径用 `%~dp0` 相对定位。

## 关键文件
- `PRD.md` —— 需求文档 v1.0（数据模型、计算规则、六模块验收标准）
- `DEV_PLAN.md` —— 开发计划 v1.0（P0~P9 阶段、数据库 Schema、核心算法签名、保真测试）

## 进度
- 2026-08-30：需求澄清 → 第一版范围 → 4 张页面布局草图 → PRD.md → DEV_PLAN.md
- 2026-08-30 下午：OQ-1 已答复 —— **先测完所有罐的氨氮（指标优先，罐次之）**。
  因此日常录入表方向 = **行=指标，列=罐**；布局改为「每个指标一张卡片，卡内按罐分列，
  空白/稀释放在各指标卡内」（此前草图的"顶部共用行"改为"指标卡内共用行"）。
- 开始按 DEV_PLAN 连续开发（P0→P9，每阶段加测试并跑通）。

## 开发完成（2026-08-30，全部 9 阶段交付）
P0 地基 → P9 收尾全部完成，**104 个测试通过**，git 存档点 P0~P9 齐全。
- 技术栈：React18+TS+Vite5+Tailwind+Dexie(IndexedDB)+ECharts+SheetJS+Zustand+vite-plugin-pwa
- 测试框架：Vitest + fake-indexeddb + Testing Library；测试文件 15 个、104 用例
- 数据模型落地：9 张 Dexie 表，measurements 冗余 curveId 追溯标曲
- 交付文件：`start.bat`（双击启动）、`README.md`（使用说明）

### 开发中踩过的坑（下次注意）
1. **沙箱 safe-delete 干扰 npm/vite**：WorkBuddy 沙箱把 rm 换成"回收站"操作，失败时导致
   npm 解包丢 .js 文件、vite build 清 dist 失败。对策：npm install/build 用
   `dangerouslyDisableSandbox`；vite build 设 `emptyOutDir:false`。
2. **vitest 默认按 CPU 核数开 worker 导致 OOM**（本机 16 核、空余 3.3GB）。对策：限制
   `poolOptions.threads.maxThreads=4`。
3. **Dexie 复合索引不能含 null**：influents 的 [date+indicatorId+reactorId] 在 shared 模式
   reactorId=null 时 fake-indexeddb 抛错。对策：去掉复合索引，用 where('date')+filter。
4. **Dexie clear 不重置自增主键**：测试里硬编码 id 会因跨用例错位。对策：seed 函数返回真实 id。

### 遗留待定项（不影响使用，后续可补）
- OQ-2 全周期单指标切换（已按方案①实现，未再单独确认）
- ~~OQ-4 手机端 HTTPS 方案~~（**已实现** 2026-08-30：scripts/cert.mjs 自签证书 + Vite HTTPS + start.bat 自动 HTTPS，手机首次信任一次即可装 PWA 图标）
- OQ-5 标曲吸光度是否已减空白（当前公式统一由软件在测样时减）
- OQ-6 检出限（已做成指标设置里的选填字段）
- OQ-7 高氯酸盐记法（当前进水 perReactor 模式可记各罐投加浓度）

### 部署/交付相关踩坑
5. **start.bat 假设装了 Node.js**：用户的电脑 PATH 里没有 node/npm，
   裸跑 `npm` 直接报"'npm' 不是内部或外部命令"。对策：start.bat 头部加
   `where node` / `where npm` 检测，缺失时打印 Node.js 下载链接并 pause 退出；
   README 顶部加「前置条件」小节。
6. **Node.js 安装程序依赖 Windows Installer 服务**：用户电脑该服务不可用
   （"The Windows Installer Service could not be accessed"），Node.js Setup Wizard
   直接提前终止。**保底方案**（无需安装器、不依赖该服务）：
   - 从 https://nodejs.org/dist/ 下载 `node-vXX-win-x64.zip`（选 LTS）
   - 解压到例如 `C:\nodejs\`
   - Win 键搜"环境变量" → "编辑系统环境变量" → 环境变量 → 找系统变量 `Path` → 编辑 → 新建 → `C:\nodejs` → 确定
   - 重开 cmd，输入 `node -v` 和 `npm -v` 验证
   - 然后双击 `start.bat` 即可
7. **双击 .bat 启动的 cmd 进程读不到用户级 PATH**：用户手动 `node -v` 能跑
   （PATH 在用户手动开的 cmd 里认到），但 `start.bat` 双击时 `where node` 失败。
   原因是 explorer 启动的子进程有时不继承用户级 PATH，只看系统 PATH。
   对策：start.bat **主动在常见位置找 node.exe**（`C:\nodejs`、
   `C:\Program Files\nodejs`、`%LOCALAPPDATA%\Programs\nodejs`、scoop），找到后
   把它的目录临时 `set PATH=...;%PATH%`，**不依赖系统环境变量**。

### 用户当前环境（2026-08-30 验证后）
- Windows 10.0.26200
- Node.js **v26.8.1** / npm 11.19.0（**最新版，历史上未做广泛兼容性测试**）
- Vite 5 + esbuild 0.21 等可能要求 Node ≤22 或 ≤24，Node 26 存在 build 失败风险
  （esbuild native binary 不匹配 / Vite 内部 Node API 校验）。对策：若 build 报
  "esbuild failed" / "EBADENGINE" / 找不到模块等，让用户降级到 Node 22 LTS
  （用 https://nodejs.org/dist/v22.11.0/node-v22.11.0-win-x64.zip 绿色版覆盖安装目录）。

### GitHub 远程仓库（2026-08-30 配置）
- 远程地址：`https://github.com/tian97189-eng/ags-data.git`（已 `git remote add origin`，本地已保存）
- 本地分支 `master`，首次推送有 26 个提交
- **首次 push 必须由用户在自己的 cmd 里执行** `git push -u origin master`：
  我的 Bash 环境无 tty（报 `/dev/tty: No such device or address` + `could not read Username`），
  PowerShell 工具也触发不到 GCM 的 GUI 授权弹窗到用户桌面，**无法代跑 push**。
- 认证：Windows 凭据管理器（GCM）会弹浏览器/窗口让用户登录 GitHub，无需手动配 token
- 上传内容仅代码（83 个文件 <1MB），`.gitignore` 已排除 node_modules / dist；
  **实验数据在浏览器 IndexedDB，不会上传**，无隐私风险
- 后续同步：用户改完代码后 `git add -A && git commit -m "说明" && git push`，
  或用 GitHub Desktop 点 Commit → Push origin
