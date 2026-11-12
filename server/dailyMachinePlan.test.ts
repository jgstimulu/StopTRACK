import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canStartMachine,
  getFactoryDate,
  isValidMachineCode,
} from './dailyMachinePlan';

describe('daily machine plan', () => {
  it('uses the factory timezone for the calendar-day boundary', () => {
    assert.equal(getFactoryDate(new Date('2026-03-29T00:30:00Z'), 'Europe/Lisbon'), '2026-03-29');
    assert.equal(getFactoryDate(new Date('2026-03-29T23:30:00Z'), 'Europe/Lisbon'), '2026-03-30');
  });

  it('accepts only configured machine codes F01–F30', () => {
    assert.equal(isValidMachineCode('F01'), true);
    assert.equal(isValidMachineCode('F30'), true);
    assert.equal(isValidMachineCode('F00'), false);
    assert.equal(isValidMachineCode('F31'), false);
    assert.equal(isValidMachineCode('F1'), false);
  });

  it('allows starts only for planned machines, while preserving active downtime access', () => {
    assert.equal(canStartMachine('F01', [], false), false);
    assert.equal(canStartMachine('F01', ['F01'], false), true);
    assert.equal(canStartMachine('F02', ['F01'], false), false);
    assert.equal(canStartMachine('F02', ['F01'], true), true);
  });
});
