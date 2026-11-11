import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { StoppageRecord } from '../types/manutrack';
import {
  enqueuePendingStoppage,
  readPendingStoppages,
  removePendingStoppage,
} from './offlineOutbox';

const values = new Map<string, string>();

function createRecord(id: string): StoppageRecord {
  return {
    id,
    machineId: 'F01',
    machineName: 'Máquina 1',
    date: '11/11/2026',
    startTime: '10:00:00',
    endTime: '10:05:00',
    startTimestamp: 1794391200000,
    endTimestamp: 1794391500000,
    durationMs: 300000,
    durationFormatted: '00:05:00',
    initiatedBy: 'Operador',
    closedBy: 'Técnico',
    stoppageType: 'Avaria Mecânica',
    stoppageDescription: 'Teste',
    actionsTaken: 'Teste',
    createdAt: 1794391500000,
  };
}

describe('offline stoppage outbox', () => {
  beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => values.set(key, value),
          removeItem: (key: string) => values.delete(key),
        },
      } as unknown as Window,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('deduplicates by ID and retains pending status', () => {
    enqueuePendingStoppage(createRecord('stop-1'));
    const result = enqueuePendingStoppage(createRecord('stop-1'));

    assert.equal(result.length, 1);
    assert.equal(result[0].pendingSync, true);
    assert.equal(readPendingStoppages().length, 1);
  });

  it('removes only the acknowledged record', () => {
    enqueuePendingStoppage(createRecord('stop-1'));
    enqueuePendingStoppage(createRecord('stop-2'));

    const remaining = removePendingStoppage('stop-1');

    assert.deepEqual(remaining.map((record) => record.id), ['stop-2']);
  });
});
