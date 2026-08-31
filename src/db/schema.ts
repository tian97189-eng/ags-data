import Dexie, { type Table } from 'dexie';

// —— 枚举（与 PRD 附录 A 对齐）——
export type IndicatorCategory = 'basic' | 'custom';
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
    });
  }
}

export const db = new AgsDB();
