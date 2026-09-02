import { db } from '../db/schema';
import type {
  Reactor,
  Indicator,
  CalibrationCurve,
  CycleRun,
  Measurement,
  Influent,
  DailyDefault,
  CustomRecord,
  SettingKV,
  MLSSRecord,
  ParticleSizeRange,
  ParticleSizeRecord,
  EPSRecord,
  SVIRecord,
  OtherReactor,
  OtherMeasurement,
  ExperimentRecord,
} from '../db/schema';

export interface BackupFile {
  format: 'ags-backup';
  version: 1;
  exportedAt: string;
  data: {
    reactors: Reactor[];
    indicators: Indicator[];
    curves: CalibrationCurve[];
    cycles: CycleRun[];
    measurements: Measurement[];
    influents: Influent[];
    defaults: DailyDefault[];
    customRecords: CustomRecord[];
    settings: SettingKV[];
    mlssRecords: MLSSRecord[];
    particleSizeRanges: ParticleSizeRange[];
    particleSizeRecords: ParticleSizeRecord[];
    epsRecords: EPSRecord[];
    sviRecords: SVIRecord[];
    otherReactors: OtherReactor[];
    otherMeasurements: OtherMeasurement[];
    experimentRecords: ExperimentRecord[];
  };
}

export interface ImportReport {
  imported: number;
  overwritten: boolean;
}

/** 读取全部数据，生成备份对象 */
export async function exportBackupData(): Promise<BackupFile> {
  return {
    format: 'ags-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      reactors: await db.reactors.toArray(),
      indicators: await db.indicators.toArray(),
      curves: await db.curves.toArray(),
      cycles: await db.cycles.toArray(),
      measurements: await db.measurements.toArray(),
      influents: await db.influents.toArray(),
      defaults: await db.defaults.toArray(),
      customRecords: await db.customRecords.toArray(),
      settings: await db.settings.toArray(),
      mlssRecords: await db.mlssRecords.toArray(),
      particleSizeRanges: await db.particleSizeRanges.toArray(),
      particleSizeRecords: await db.particleSizeRecords.toArray(),
      epsRecords: await db.epsRecords.toArray(),
      sviRecords: await db.sviRecords.toArray(),
      otherReactors: await db.otherReactors.toArray(),
      otherMeasurements: await db.otherMeasurements.toArray(),
      experimentRecords: await db.experimentRecords.toArray(),
    },
  };
}

/** 备份对象 → JSON 字符串 */
export function backupToJson(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

/** JSON 字符串 → 备份对象，格式校验 */
export function jsonToBackup(text: string): BackupFile {
  const obj = JSON.parse(text) as BackupFile;
  if (obj?.format !== 'ags-backup') {
    throw new Error('不是有效的 AGS 备份文件');
  }
  if (obj?.data == null) {
    throw new Error('备份文件缺少数据');
  }
  return obj;
}

/** 覆盖导入：清空本地后整体恢复（保留原 id） */
export async function importOverwrite(backup: BackupFile): Promise<ImportReport> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  const d = backup.data;
  await db.reactors.bulkPut(d.reactors ?? []);
  await db.indicators.bulkPut(d.indicators ?? []);
  await db.curves.bulkPut(d.curves ?? []);
  await db.cycles.bulkPut(d.cycles ?? []);
  await db.measurements.bulkPut(d.measurements ?? []);
  await db.influents.bulkPut(d.influents ?? []);
  await db.defaults.bulkPut(d.defaults ?? []);
  await db.customRecords.bulkPut(d.customRecords ?? []);
  await db.settings.bulkPut(d.settings ?? []);
  await db.mlssRecords.bulkPut(d.mlssRecords ?? []);
  await db.particleSizeRanges.bulkPut(d.particleSizeRanges ?? []);
  await db.particleSizeRecords.bulkPut(d.particleSizeRecords ?? []);
  await db.epsRecords.bulkPut(d.epsRecords ?? []);
  await db.sviRecords.bulkPut(d.sviRecords ?? []);
  await db.otherReactors.bulkPut(d.otherReactors ?? []);
  await db.otherMeasurements.bulkPut(d.otherMeasurements ?? []);
  await db.experimentRecords.bulkPut(d.experimentRecords ?? []);
  const total =
    (d.reactors?.length ?? 0) +
    (d.indicators?.length ?? 0) +
    (d.curves?.length ?? 0) +
    (d.cycles?.length ?? 0) +
    (d.measurements?.length ?? 0) +
    (d.influents?.length ?? 0) +
    (d.defaults?.length ?? 0) +
    (d.customRecords?.length ?? 0) +
    (d.settings?.length ?? 0) +
    (d.mlssRecords?.length ?? 0) +
    (d.particleSizeRanges?.length ?? 0) +
    (d.particleSizeRecords?.length ?? 0) +
    (d.epsRecords?.length ?? 0) +
    (d.sviRecords?.length ?? 0) +
    (d.otherReactors?.length ?? 0) +
    (d.otherMeasurements?.length ?? 0) +
    (d.experimentRecords?.length ?? 0);
  return { imported: total, overwritten: true };
}

/** 合并导入：只新增本地没有的记录 */
export async function importMerge(backup: BackupFile): Promise<ImportReport> {
  const d = backup.data;
  let imported = 0;

  const existingCodes = new Set((await db.reactors.toArray()).map((r) => r.code));
  for (const r of d.reactors ?? []) {
    if (!existingCodes.has(r.code)) {
      await db.reactors.add({ ...r, id: undefined });
      imported++;
    }
  }

  const existingNames = new Set((await db.indicators.toArray()).map((i) => i.name));
  for (const i of d.indicators ?? []) {
    if (!existingNames.has(i.name)) {
      await db.indicators.add({ ...i, id: undefined });
      imported++;
    }
  }

  const curveKeys = new Set(
    (await db.curves.toArray()).map((c) => `${c.indicatorId}|${c.effectiveFrom}`),
  );
  for (const c of d.curves ?? []) {
    const key = `${c.indicatorId}|${c.effectiveFrom}`;
    if (!curveKeys.has(key)) {
      await db.curves.add({ ...c, id: undefined });
      imported++;
    }
  }

  const cycleKeys = new Set((await db.cycles.toArray()).map((c) => `${c.date}|${c.startTime}`));
  for (const c of d.cycles ?? []) {
    const key = `${c.date}|${c.startTime}`;
    if (!cycleKeys.has(key)) {
      await db.cycles.add({ ...c, id: undefined });
      imported++;
    }
  }

  const measureKeys = new Set(
    (await db.measurements.toArray()).map(
      (m) => `${m.scene}|${m.date}|${m.reactorId}|${m.indicatorId}|${m.time ?? ''}|${m.cycleRunId ?? ''}`,
    ),
  );
  for (const m of d.measurements ?? []) {
    const key = `${m.scene}|${m.date}|${m.reactorId}|${m.indicatorId}|${m.time ?? ''}|${m.cycleRunId ?? ''}`;
    if (!measureKeys.has(key)) {
      await db.measurements.add({ ...m, id: undefined });
      imported++;
    }
  }

  const influentKeys = new Set(
    (await db.influents.toArray()).map((i) => `${i.date}|${i.indicatorId}|${i.reactorId ?? ''}`),
  );
  for (const i of d.influents ?? []) {
    const key = `${i.date}|${i.indicatorId}|${i.reactorId ?? ''}`;
    if (!influentKeys.has(key)) {
      await db.influents.add({ ...i, id: undefined });
      imported++;
    }
  }

  const defaultKeys = new Set(
    (await db.defaults.toArray()).map((x) => `${x.scopeKey}|${x.indicatorId}`),
  );
  for (const x of d.defaults ?? []) {
    const key = `${x.scopeKey}|${x.indicatorId}`;
    if (!defaultKeys.has(key)) {
      await db.defaults.add({ ...x, id: undefined });
      imported++;
    }
  }

  for (const cr of d.customRecords ?? []) {
    await db.customRecords.add({ ...cr, id: undefined });
    imported++;
  }

  for (const s of d.settings ?? []) {
    if (!(await db.settings.get(s.key))) {
      await db.settings.put(s);
      imported++;
    }
  }

  // 其他指标 / 他人数据 / 实验记录：merge 模式直接追加（id 置空避免冲突）
  for (const x of d.mlssRecords ?? []) {
    await db.mlssRecords.add({ ...x, id: undefined });
    imported++;
  }
  for (const x of d.particleSizeRanges ?? []) {
    await db.particleSizeRanges.add({ ...x, id: undefined });
    imported++;
  }
  for (const x of d.particleSizeRecords ?? []) {
    await db.particleSizeRecords.add({ ...x, id: undefined });
    imported++;
  }
  for (const x of d.epsRecords ?? []) {
    await db.epsRecords.add({ ...x, id: undefined });
    imported++;
  }
  for (const x of d.sviRecords ?? []) {
    await db.sviRecords.add({ ...x, id: undefined });
    imported++;
  }
  for (const x of d.otherReactors ?? []) {
    await db.otherReactors.add({ ...x, id: undefined });
    imported++;
  }
  for (const x of d.otherMeasurements ?? []) {
    await db.otherMeasurements.add({ ...x, id: undefined });
    imported++;
  }
  for (const x of d.experimentRecords ?? []) {
    await db.experimentRecords.add({ ...x, id: undefined });
    imported++;
  }

  return { imported, overwritten: false };
}

export async function importBackupData(
  backup: BackupFile,
  mode: 'merge' | 'overwrite',
): Promise<ImportReport> {
  return mode === 'overwrite' ? importOverwrite(backup) : importMerge(backup);
}
