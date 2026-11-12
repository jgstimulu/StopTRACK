import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { StoppageRecord } from '../types/manutrack';
import { getInterventionAnalytics } from './interventionAnalytics';

function createRecord(
  id: string,
  overrides: Partial<StoppageRecord> = {}
): StoppageRecord {
  return {
    id,
    machineId: 'F01',
    machineName: 'Máquina 1',
    date: '12/11/2026',
    startTime: '10:00:00',
    endTime: '10:10:00',
    startTimestamp: 1794477600000,
    endTimestamp: 1794478200000,
    durationMs: 600000,
    durationFormatted: '00:10:00',
    initiatedBy: 'Operador',
    closedBy: 'Técnico',
    stoppageType: 'Avaria Mecânica',
    stoppageDescription: 'Teste',
    actionsTaken: 'Teste',
    createdAt: 1794478200000,
    ...overrides,
  };
}

describe('intervention analytics', () => {
  it('separates elapsed intervention time from recorded technician time', () => {
    const records = [
      createRecord('breakdown', {
        machineStopped: true,
        stages: [
          {
            id: 'diagnosis',
            order: 1,
            type: 'Diagnóstico',
            description: '',
            technician: 'Técnico A',
            durationMinutes: 6,
          },
        ],
      }),
      createRecord('tuning', {
        durationMs: 1800000,
        stoppageType: 'Afinação Mola',
        isTuningIntervention: true,
        machineStopped: false,
        stages: [
          {
            id: 'adjustment',
            order: 1,
            type: 'Afinação',
            description: '',
            technician: 'Técnico B',
            durationMinutes: 12,
          },
        ],
      }),
    ];

    const result = getInterventionAnalytics(records);

    assert.equal(result.totalCount, 2);
    assert.equal(result.elapsedMs, 2400000);
    assert.equal(result.technicalMinutes, 18);
    assert.equal(result.recordsWithTechnicalTime, 2);
    assert.equal(result.machineStoppedCount, 1);
    assert.equal(result.machineRunningCount, 1);
    assert.equal(result.tuningCount, 1);
  });

  it('keeps missing machine-stop data unknown instead of assuming a stop', () => {
    const result = getInterventionAnalytics([createRecord('legacy')]);

    assert.equal(result.machineStoppedCount, 0);
    assert.equal(result.machineRunningCount, 0);
    assert.equal(result.machineStateUnknownCount, 1);
  });

  it('groups event counts, time, and types by machine, type, and shift', () => {
    const records = [
      createRecord('first', { machineStopped: true }),
      createRecord('second', {
        machineId: 'F02',
        machineName: 'Máquina 2',
        stoppageType: 'Afinação Mecânica',
        isTuningIntervention: true,
        startTime: '15:00:00',
        shift: '2º Turno',
      }),
    ];

    const result = getInterventionAnalytics(records);

    assert.equal(result.machinesAffected, 2);
    assert.equal(result.byMachine.F01.count, 1);
    assert.equal(result.byMachine.F02.tuningCount, 1);
    assert.equal(result.byType['Afinação Mecânica'].count, 1);
    assert.equal(result.byShift['2º Turno'].count, 1);
  });
});
