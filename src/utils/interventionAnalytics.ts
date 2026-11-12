import type { StoppageRecord } from '../types/manutrack';
import { getShiftFromTimeString } from './shift';
import { isTuningRecord } from './taxonomy';

export interface InterventionGroup {
  count: number;
  elapsedMs: number;
  technicalMinutes: number;
  tuningCount: number;
  machineStoppedCount: number;
  machineRunningCount: number;
  machineStateUnknownCount: number;
}

export interface MachineInterventionGroup extends InterventionGroup {
  machineId: string;
  machineName: string;
  typeCounts: Record<string, number>;
}

export interface InterventionAnalytics {
  totalCount: number;
  machinesAffected: number;
  elapsedMs: number;
  technicalMinutes: number;
  recordsWithTechnicalTime: number;
  tuningCount: number;
  machineStoppedCount: number;
  machineRunningCount: number;
  machineStateUnknownCount: number;
  byMachine: Record<string, MachineInterventionGroup>;
  byType: Record<string, InterventionGroup>;
  byShift: Record<string, InterventionGroup>;
}

function createGroup(): InterventionGroup {
  return {
    count: 0,
    elapsedMs: 0,
    technicalMinutes: 0,
    tuningCount: 0,
    machineStoppedCount: 0,
    machineRunningCount: 0,
    machineStateUnknownCount: 0,
  };
}

function getElapsedMs(record: StoppageRecord): number {
  return Number.isFinite(record.durationMs) && record.durationMs > 0
    ? record.durationMs
    : 0;
}

function getTechnicalMinutes(record: StoppageRecord): number {
  return (record.stages ?? []).reduce((total, stage) => {
    const duration = stage.durationMinutes;
    return total + (Number.isFinite(duration) && duration > 0 ? duration : 0);
  }, 0);
}

function getShift(record: StoppageRecord): string {
  if (record.shift?.trim()) return record.shift.trim();
  if (record.startTime) return getShiftFromTimeString(record.startTime).name;
  return 'Turno não indicado';
}

function addRecord(group: InterventionGroup, record: StoppageRecord): void {
  group.count += 1;
  group.elapsedMs += getElapsedMs(record);
  group.technicalMinutes += getTechnicalMinutes(record);
  if (isTuningRecord(record)) group.tuningCount += 1;

  if (record.machineStopped === true) group.machineStoppedCount += 1;
  else if (record.machineStopped === false) group.machineRunningCount += 1;
  else group.machineStateUnknownCount += 1;
}

export function getInterventionAnalytics(
  records: StoppageRecord[]
): InterventionAnalytics {
  const byMachine: Record<string, MachineInterventionGroup> = {};
  const byType: Record<string, InterventionGroup> = {};
  const byShift: Record<string, InterventionGroup> = {};
  let totalTechnicalMinutes = 0;
  let recordsWithTechnicalTime = 0;
  let machineStoppedCount = 0;
  let machineRunningCount = 0;
  let machineStateUnknownCount = 0;
  let tuningCount = 0;
  let elapsedMs = 0;

  for (const record of records) {
    const type = record.stoppageType?.trim() || 'Não especificado';
    const shift = getShift(record);
    const technicalMinutes = getTechnicalMinutes(record);
    const machineGroup = byMachine[record.machineId] ?? {
      ...createGroup(),
      machineId: record.machineId,
      machineName: record.machineName || record.machineId,
      typeCounts: {},
    };

    addRecord(machineGroup, record);
    machineGroup.typeCounts[type] = (machineGroup.typeCounts[type] ?? 0) + 1;
    byMachine[record.machineId] = machineGroup;

    const typeGroup = byType[type] ?? createGroup();
    addRecord(typeGroup, record);
    byType[type] = typeGroup;

    const shiftGroup = byShift[shift] ?? createGroup();
    addRecord(shiftGroup, record);
    byShift[shift] = shiftGroup;

    elapsedMs += getElapsedMs(record);
    totalTechnicalMinutes += technicalMinutes;
    if (technicalMinutes > 0) recordsWithTechnicalTime += 1;
    if (isTuningRecord(record)) tuningCount += 1;

    if (record.machineStopped === true) machineStoppedCount += 1;
    else if (record.machineStopped === false) machineRunningCount += 1;
    else machineStateUnknownCount += 1;
  }

  return {
    totalCount: records.length,
    machinesAffected: Object.keys(byMachine).length,
    elapsedMs,
    technicalMinutes: totalTechnicalMinutes,
    recordsWithTechnicalTime,
    tuningCount,
    machineStoppedCount,
    machineRunningCount,
    machineStateUnknownCount,
    byMachine,
    byType,
    byShift,
  };
}
