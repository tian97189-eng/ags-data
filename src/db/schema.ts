import Dexie, { type Table } from 'dexie';

// —— 枚举（与 PRD 附录 A 对齐）——
export type IndicatorCategory = 'basic' | 'custom' | 'extras';
export type IndicatorMethod = 'absorbance' | 'direct';
export type Scene = 'daily' | 'cycle';
export type InputType = 'absorbance' | 'direct';
export type Phase = 'anaerobic' | 'oxic' | 'anoxic' | null;
export type InfluentMode = 'shared' | 'perReactor';

/** 复合公式类型：指标的值由其他指标的 value 计算而来 */
export type CompositeType = 'sumOf' | null;

// —— 实体（与 PRD 第 4 节对齐）——
export interface Reactor {
  id?: number;
  code: string;
  name: string;
  note: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Indicator {
  id?: number;
  name: string;
  category: IndicatorCategory;
  method: IndicatorMethod;
  unit: string;
  defaultDilution: number;
  refLow: number | null;
  refHigh: number | null;
  lod: number | null;
  active: boolean;
  sortOrder: number;
  /** 复合公式类型：sumOf = 由 compositeRefs 中指标的 value 求和得到（如总氮=氨氮+亚硝+硝态） */
  compositeType?: CompositeType;
  /** 复合公式所依赖的其他指标 id 列表 */
  compositeRefs?: number[];
}

export interface CalibrationPoint {
  concentration: number;
  absorbance: number;
}

export type CurveType = 'fit' | 'formula';

export interface CalibrationCurve {
  id?: number;
  indicatorId: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null; // null = 至今
  k: number;
  b: number;
  r2: number;
  points: CalibrationPoint[];
  batchNo: string;
  note: string;
  createdAt: string;
  /** 标曲类型：fit = 多点拟合（默认），formula = 手动公式 */
  formulaType?: CurveType;
  /** 手动公式字符串（formulaType === 'formula' 时使用） */
  formula?: string | null;
}

export interface CycleRun {
  id?: number;
  date: string;
  name: string;
  startTime: string; // HH:mm
  intervalMinutes: number;
  count: number; // 采样点数
  reactorIds: number[];
  note: string;
}

export interface Measurement {
  id?: number;
  scene: Scene;
  date: string;
  cycleRunId?: number;
  time?: string; // HH:mm
  phase: Phase;
  reactorId: number;
  indicatorId: number;
  inputType: InputType;
  sampleAbs: number | null;
  blankAbs: number | null;
  dilution: number | null;
  value: number | null;
  curveId: number | null;
  blankOverridden: boolean;
  dilutionOverridden: boolean;
  note: string;
}

export interface Influent {
  id?: number;
  date: string;
  cycleRunId?: number;
  mode: InfluentMode;
  reactorId: number | null;
  indicatorId: number;
  inputType: InputType;
  sampleAbs: number | null;
  blankAbs: number | null;
  dilution: number | null;
  value: number;
  curveId: number | null;
}

export interface DailyDefault {
  id?: number;
  scopeKey: string; // 'daily:2026-08-30' 或 'cycle:17'
  indicatorId: number;
  blankAbs: number | null;
  dilution: number;
}

export interface CustomRecord {
  id?: number;
  date: string;
  reactorId: number | null;
  indicatorId: number;
  value: number;
  note: string;
}

export interface SettingKV {
  key: string;
  value: unknown;
}

// —— 「其他指标」功能区：污泥浓度/筛分粒径/EPS 等自建计算工作表 ——

/** 污泥浓度（MLSS / MLVSS）记录
 * 用户填：M1 滤纸重、M2 滤纸+泥、M3 坩埚、M4 坩埚+灼烧残渣、V 取样体积
 * 自动算：MLSS = (M2-M1)/V；MLVSS = (M2+M3-M4)/V
 */
export interface MLSSRecord {
  id?: number;
  date: string;
  reactorId: number | null;
  paperNo: string; // 滤纸编号
  m1: number | null;
  m2: number | null;
  m3: number | null;
  m4: number | null;
  v: number | null;
  mlss: number | null; // 自动算
  mlvss: number | null; // 自动算
  note: string;
  createdAt: string;
}

/** 筛分粒径范围配置（用户可自行添加/编辑） */
export interface ParticleSizeRange {
  id?: number;
  /** 粒径下限 μm（含） */
  from: number;
  /** 粒径上限 μm（不含；最后一段如 ">500" 用 Number=∞ 表示无上限） */
  to: number;
  /** 中位径 = (from + to) / 2，最后一段 (>500) 等手动给一个代表值 */
  mid: number;
  sortOrder: number;
}

/** 筛分粒径记录 */
export interface ParticleSizeRecord {
  id?: number;
  date: string;
  reactorId: number | null;
  /** 滤纸重 M1 */
  paperWeight: number | null;
  /** 滤纸+泥重 M2 */
  sampleWeight: number | null;
  /** 泥重 = M2 - M1（自动算） */
  dryWeight: number | null;
  /** 占总重的比例 %（自动算） */
  percent: number | null;
  /** 中位径贡献 = percent% × mid（自动算） */
  contribution: number | null;
  /** 所属粒径范围 id（选填，记录的是哪一段的泥重） */
  rangeId: number | null;
  note: string;
  createdAt: string;
}

/** EPS 胞外聚合物（PS 多糖 / PN 蛋白质）记录
 * PS / PN 浓度走标准曲线：用户填吸光度（样/空/稀释），自动用该指标的生效标曲算浓度，
 * 再结合 VSS 算出每克污泥的含量。psConc/pnConc 为换算后的浓度（冗余存，供追溯）。
 */
export interface EPSRecord {
  id?: number;
  date: string;
  reactorId: number | null;
  sampleCode: string; // 样品编号
  vssMg: number | null; // VSS 质量 mg
  // PS 吸光度三要素
  psSampleAbs: number | null;
  psBlankAbs: number | null;
  psDilution: number | null;
  psCurveId: number | null;
  // PN 吸光度三要素
  pnSampleAbs: number | null;
  pnBlankAbs: number | null;
  pnDilution: number | null;
  pnCurveId: number | null;
  psConc: number | null; // PS 浓度 mg/L（自动算）
  pnConc: number | null; // PN 浓度 mg/L（自动算）
  extractVolume: number | null; // 提取液体积 mL
  psContent: number | null; // mg/g VSS（自动算）
  pnContent: number | null; // mg/g VSS（自动算）
  pnPsRatio: number | null; // PN/PS 比（自动算）
  note: string;
  createdAt: string;
}

/** 污泥沉降性（SV / SVI）记录
 * 用户填：量筒体积、5min/30min 污泥层刻度读数、MLSS
 * 自动算：SV5/SV30(%) 和 SVI5/SVI30(mL/g)
 */
export interface SVIRecord {
  id?: number;
  date: string;
  reactorId: number | null;
  sampleCode: string; // 样品编号
  cylinderVolumeMl: number | null; // 量筒总体积 mL
  v5Ml: number | null; // 5min 污泥层体积 mL
  v30Ml: number | null; // 30min 污泥层体积 mL
  mlss: number | null; // MLSS g/L
  sv5: number | null; // % 自动算
  sv30: number | null; // % 自动算
  svi5: number | null; // mL/g 自动算
  svi30: number | null; // mL/g 自动算
  note: string;
  createdAt: string;
}

// —— 「他人数据」独立空间（帮别人测水质用）——
// 与自己的反应器 / 测量数据完全隔离：自己的数据永不因他人录入受影响。

/** 他人的罐（独立于自己的 reactors） */
export interface OtherReactor {
  id?: number;
  code: string;
  name: string;
  note: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

/** 他人的测量数据（独立于自己的 measurements） */
export interface OtherMeasurement {
  id?: number;
  date: string;
  reactorId: number; // 指向 otherReactors.id
  indicatorId: number;
  inputType: InputType;
  sampleAbs: number | null;
  blankAbs: number | null;
  dilution: number | null;
  value: number | null; // 浓度（自动算或直读）
  curveId: number | null;
  note: string;
  createdAt: string;
}

/** 实验记录（时间线）：记某时间段做了什么、加了什么、测了哪些指标；可附照片 */
export interface ExperimentRecord {
  id?: number;
  date: string; // 记录所属日期
  title: string; // 标题（如"第 3 天：换水 + 加碳源"）
  content: string; // 详细描述
  /** 测了哪些指标（指标名数组，快照存储，避免指标删除后丢失） */
  indicators: string[];
  /** 照片 base64 DataURL 数组（JSON 可序列化，能进备份） */
  photos: string[];
  createdAt: string;
}

// —— 实验方法库（SOP 手册）——
// 每个实验一个文档：试剂、仪器、步骤（每步可配图）、注意事项、附件（图/PDF）。

/** 试剂/药品行 */
export interface MethodReagent {
  name: string; // 试剂名
  conc: string; // 浓度/规格
  dose: string; // 用量
  note: string; // 备注（用途/保存）
}

/** 操作步骤：文字 + 可选配图 + 本步用到的试剂（引用 reagents 下标） */
export interface MethodStep {
  text: string;
  image?: string; // base64 DataURL（每步配图，图文不分离）
  reagentRefs?: number[];
}

/** 附件（图片 / PDF），base64 DataURL 存储 */
export interface MethodAttachment {
  name: string;
  kind: 'image' | 'pdf';
  data: string;
}

/** 实验方法文档 */
export interface MethodDoc {
  id?: number;
  name: string; // 方法名（如"氨氮测定"）
  method: string; // 副标题（如"纳氏试剂法 420nm"）
  category: string; // 类别（水质指标/污泥性状/表征/仪器使用/粒径）
  scope: string; // 适用范围
  reagents: MethodReagent[];
  instruments: string[];
  steps: MethodStep[];
  warnings: string[];
  attachments: MethodAttachment[];
  createdAt: string;
  updatedAt: string;
}

/** 回收站记录：被删数据的 JSON 快照（保原 id），30 天内可恢复 */
export interface TrashRecord {
  id?: number;
  table: string; // 原表名（如 measurements）
  data: string; // 被删记录 JSON 字符串（数组）
  deletedAt: string; // ISO 时间
}

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
  mlssRecords!: Table<MLSSRecord, number>;
  particleSizeRanges!: Table<ParticleSizeRange, number>;
  particleSizeRecords!: Table<ParticleSizeRecord, number>;
  epsRecords!: Table<EPSRecord, number>;
  sviRecords!: Table<SVIRecord, number>;
  otherReactors!: Table<OtherReactor, number>;
  otherMeasurements!: Table<OtherMeasurement, number>;
  experimentRecords!: Table<ExperimentRecord, number>;
  methodDocs!: Table<MethodDoc, number>;
  trashRecords!: Table<TrashRecord, number>;

  constructor() {
    super('ags-data');
    this.version(1).stores({
      reactors: '++id, code, active, sortOrder',
      indicators: '++id, name, category, method, active, sortOrder',
      curves: '++id, indicatorId, effectiveFrom, [indicatorId+effectiveFrom]',
      cycles: '++id, date',
      measurements:
        '++id, scene, date, reactorId, indicatorId, cycleRunId, curveId, [date+scene], [reactorId+indicatorId+date]',
      influents: '++id, date, mode, reactorId, indicatorId',
      defaults: '++id, &[scopeKey+indicatorId]',
      customRecords: '++id, date, reactorId, indicatorId',
      settings: 'key',
      mlssRecords: '++id, date, reactorId',
      particleSizeRanges: '++id, sortOrder',
      particleSizeRecords: '++id, date, reactorId',
      epsRecords: '++id, date, reactorId',
    });
    // v2：新增污泥沉降性 SVI 表
    this.version(2).stores({
      sviRecords: '++id, date, reactorId',
    });
    // v3：他人数据独立空间（帮别人测水质，不碰自己的反应器/测量）
    this.version(3).stores({
      otherReactors: '++id, code, active, sortOrder',
      otherMeasurements: '++id, date, reactorId, indicatorId',
    });
    // v4：实验记录（时间线 + 照片 base64）
    this.version(4).stores({
      experimentRecords: '++id, date',
    });
    // v5：实验方法库（SOP 手册：试剂/仪器/步骤配图/附件）
    this.version(5).stores({
      methodDocs: '++id, category, name, updatedAt',
    });
    // v6：回收站（误删可恢复，30 天自动清理）
    this.version(6).stores({
      trashRecords: '++id, table, deletedAt',
    });
  }
}

export const db = new AgsDB();
