import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDailyMachineAvailability } from './dailyMachineAvailability';

function completeAvailability() {
  return Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [
      `F${String(index + 1).padStart(2, '0')}`,
      { status: 'Disponível', note: '' },
    ])
  );
}

describe('daily machine availability', () => {
  it('accepts a complete status snapshot for all configured machines', () => {
    const availability = completeAvailability();
    availability.F01 = { status: 'Indisponível', note: 'Em reparação' };

    assert.deepEqual(parseDailyMachineAvailability(availability)?.F01, {
      status: 'Indisponível',
      note: 'Em reparação',
    });
  });

  it('rejects missing or unknown machines and invalid statuses', () => {
    const incomplete = completeAvailability();
    delete incomplete.F30;
    assert.equal(parseDailyMachineAvailability(incomplete), null);

    const extraMachine = completeAvailability();
    extraMachine.F31 = { status: 'Disponível', note: '' };
    assert.equal(parseDailyMachineAvailability(extraMachine), null);

    const invalidStatus = completeAvailability();
    invalidStatus.F01 = { status: 'Parada', note: '' };
    assert.equal(parseDailyMachineAvailability(invalidStatus), null);
  });

  it('rejects notes larger than the database limit', () => {
    const availability = completeAvailability();
    availability.F01 = { status: 'Disponível', note: 'x'.repeat(501) };

    assert.equal(parseDailyMachineAvailability(availability), null);
  });
});
