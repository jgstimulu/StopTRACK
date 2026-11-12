import type { StoppageRecord } from '../types/manutrack';

/**
 * Regras de classificação usadas nos relatórios.
 *
 * Registos antigos não têm `isTuningIntervention`; nesses casos o tipo de paragem
 * serve de fallback para manter os relatórios coerentes.
 */
export function isTuningRecord(record: StoppageRecord): boolean {
  if (typeof record.isTuningIntervention === 'boolean') return record.isTuningIntervention;
  return record.stoppageType === 'Afinação Mola' || record.stoppageType === 'Afinação Mecânica';
}

/** Só uma paragem explícita (`machineStopped === false`) deixa de contar como tempo parado. */
export function isRecordMachineStopped(record: StoppageRecord): boolean {
  return record.machineStopped !== false;
}

/** Classificação legível para o CSV e para os agrupamentos de relatório. */
export function getInterventionClassification(record: StoppageRecord): string {
  if (isTuningRecord(record)) return 'Afinação';
  if (record.stoppageType === 'Avaria Mecânica') return 'Avaria Mecânica';
  if (record.stoppageType?.toLowerCase().includes('avaria')) return 'Avaria';
  return 'Outro';
}

export function formatSpringAdjustments(record: StoppageRecord): string {
  return (record.springAdjustments ?? []).join('; ');
}

export function formatMechanicalAdjustments(record: StoppageRecord): string {
  return (record.mechanicalAdjustments ?? [])
    .map((item) => {
      const types = item.adjustmentTypes?.length
        ? ` (${item.adjustmentTypes.join(', ')})`
        : '';
      return `${item.component}${types}`;
    })
    .join('; ');
}

export interface ReportingTotals {
  totalCount: number;
  downtimeCount: number;
  tuningCount: number;
  downtimeDurationMs: number;
  tuningDurationMs: number;
  downtimeMinutes: number;
  tuningMinutes: number;
  mttrMinutes: number;
}

/**
 * Totais comuns ao Dashboard e ao relatório OEE:
 * - paragens reais: registos com máquina parada;
 * - afinações: tempo total da intervenção, mesmo com marcha de ensaio.
 */
export function getReportingTotals(records: StoppageRecord[]): ReportingTotals {
  let downtimeCount = 0;
  let tuningCount = 0;
  let downtimeDurationMs = 0;
  let tuningDurationMs = 0;

  records.forEach((record) => {
    const duration = record.durationMs || 0;

    if (isRecordMachineStopped(record)) {
      downtimeCount += 1;
      downtimeDurationMs += duration;
    }

    if (isTuningRecord(record)) {
      tuningCount += 1;
      tuningDurationMs += duration;
    }
  });

  const downtimeMinutes = Math.round(downtimeDurationMs / 60000);
  const tuningMinutes = Math.round(tuningDurationMs / 60000);

  return {
    totalCount: records.length,
    downtimeCount,
    tuningCount,
    downtimeDurationMs,
    tuningDurationMs,
    downtimeMinutes,
    tuningMinutes,
    mttrMinutes: downtimeCount > 0 ? Math.round(downtimeMinutes / downtimeCount) : 0,
  };
}
