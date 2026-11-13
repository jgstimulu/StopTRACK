import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getDailyMachinePlan,
  getDailyMachineAvailability,
  setDailyMachineAvailability,
  finishMachineMaintenance,
  setDailyMachinePlanned,
  setAllDailyMachinesPlanned,
  setSetting,
} from './supabaseStore';
import type { MachineAvailabilityState } from '../src/types/manutrack';

function completeAvailability(): Record<string, MachineAvailabilityState> {
  return Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [
      `F${String(index + 1).padStart(2, '0')}`,
      {
        status: index === 0 ? 'Indisponível' : 'Disponível',
        note: index === 0 ? 'Em reparação' : '',
      },
    ])
  );
}

describe('Supabase daily availability persistence', () => {
  it('upserts one dated row for every machine', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let insertedRows: Record<string, unknown>[] = [];
    let plannedRows: Record<string, unknown>[] = [];
    const calls: string[] = [];
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    globalThis.fetch = async (input, init) => {
      const requestUrl = new URL(String(input));
      calls.push(`${requestUrl.pathname}:${init?.method}`);
      if (requestUrl.pathname === '/rest/v1/machine_maintenance') {
        return new Response('[]', { status: 200 });
      }
      if (requestUrl.pathname === '/rest/v1/app_settings') {
        return new Response(null, { status: 204 });
      }
      if (requestUrl.pathname === '/rest/v1/daily_machine_plan' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      if (requestUrl.pathname === '/rest/v1/daily_machine_plan' && init?.method === 'POST') {
        plannedRows = JSON.parse(String(init?.body));
        return new Response(null, { status: 204 });
      }
      assert.equal(requestUrl.pathname, '/rest/v1/daily_machine_availability');
      assert.equal(requestUrl.searchParams.get('on_conflict'), 'availability_date,machine_id');
      assert.equal(init?.method, 'POST');
      insertedRows = JSON.parse(String(init?.body));
      return new Response(null, { status: 204 });
    };

    try {
      const saved = await setDailyMachineAvailability('2026-11-12', completeAvailability());
      assert.equal(plannedRows.length, 29);
      assert.equal(plannedRows[0].plan_date, '2026-11-12');
      assert.equal(plannedRows[0].machine_id, 'F02');
      assert.equal(plannedRows.some((row) => row.machine_id === 'F01'), false);
      assert.equal(insertedRows.length, 30);
      assert.equal(insertedRows[0].availability_date, '2026-11-12');
      assert.equal(insertedRows[0].machine_id, 'F01');
      assert.equal(insertedRows[0].status, 'Indisponível');
      assert.equal(insertedRows[0].note, 'Em reparação');
      assert.equal(saved.date, '2026-11-12');
      assert.deepEqual(saved.machines, completeAvailability());
      assert.deepEqual(calls, [
        '/rest/v1/machine_maintenance:undefined',
        '/rest/v1/app_settings:POST',
        '/rest/v1/daily_machine_plan:DELETE',
        '/rest/v1/daily_machine_plan:POST',
        '/rest/v1/daily_machine_availability:POST',
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });

  it('keeps maintenance active across daily snapshots and excludes it from the plan', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const maintenanceRows: Record<string, unknown>[] = [];
    let plannedRows: Record<string, unknown>[] = [];
    let savedAvailabilityRows: Record<string, unknown>[] = [];
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    globalThis.fetch = async (input, init) => {
      const requestUrl = new URL(String(input));
      if (requestUrl.pathname === '/rest/v1/machine_maintenance' && !init?.method) {
        return new Response(JSON.stringify(maintenanceRows), { status: 200 });
      }
      if (requestUrl.pathname === '/rest/v1/machine_maintenance' && init?.method === 'POST') {
        maintenanceRows.push(...JSON.parse(String(init.body)));
        return new Response(null, { status: 204 });
      }
      if (requestUrl.pathname === '/rest/v1/app_settings') {
        return new Response(null, { status: 204 });
      }
      if (requestUrl.pathname === '/rest/v1/daily_machine_plan' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      if (requestUrl.pathname === '/rest/v1/daily_machine_plan' && init?.method === 'POST') {
        plannedRows = JSON.parse(String(init.body));
        return new Response(null, { status: 204 });
      }
      assert.equal(requestUrl.pathname, '/rest/v1/daily_machine_availability');
      savedAvailabilityRows = JSON.parse(String(init?.body));
      return new Response(null, { status: 204 });
    };

    try {
      const initial = completeAvailability();
      initial.F01 = { status: 'Em manutenção', note: 'Reparação da transmissão' };
      const firstSave = await setDailyMachineAvailability('2026-11-12', initial);
      assert.equal(maintenanceRows.length, 1);
      assert.equal(maintenanceRows[0].machine_id, 'F01');
      assert.equal(maintenanceRows[0].note, 'Reparação da transmissão');
      assert.equal(firstSave.machines.F01.status, 'Em manutenção');
      assert.equal(plannedRows.some((row) => row.machine_id === 'F01'), false);

      const laterDailyInput = completeAvailability();
      laterDailyInput.F01 = { status: 'Disponível', note: '' };
      const laterSave = await setDailyMachineAvailability('2026-11-13', laterDailyInput);
      assert.equal(laterSave.machines.F01.status, 'Em manutenção');
      assert.equal(laterSave.machines.F01.note, 'Reparação da transmissão');
      assert.equal(savedAvailabilityRows.find((row) => row.machine_id === 'F01')?.status, 'Em manutenção');
      assert.equal(plannedRows.some((row) => row.machine_id === 'F01'), false);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });

  it('finishes maintenance into an unavailable daily state before removing the lock', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const maintenanceRows: Record<string, unknown>[] = [
      { machine_id: 'F01', note: 'Reparação', started_at: '2026-11-12T08:00:00.000Z' },
    ];
    let settingPlan: { date: string; machineIds: string[] } = {
      date: '2026-11-13',
      machineIds: ['F01', 'F02'],
    };
    const unavailableRows: Record<string, unknown>[] = [];
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    globalThis.fetch = async (input, init) => {
      const requestUrl = new URL(String(input));
      if (requestUrl.pathname === '/rest/v1/machine_maintenance' && !init?.method) {
        return new Response(JSON.stringify(maintenanceRows), { status: 200 });
      }
      if (requestUrl.pathname === '/rest/v1/machine_maintenance' && init?.method === 'DELETE') {
        maintenanceRows.splice(0, maintenanceRows.length);
        return new Response(null, { status: 204 });
      }
      if (requestUrl.pathname === '/rest/v1/app_settings' && init?.method === 'POST') {
        settingPlan = JSON.parse(String(init.body)).value;
        return new Response(null, { status: 204 });
      }
      if (requestUrl.pathname === '/rest/v1/app_settings') {
        return new Response(JSON.stringify([{ value: settingPlan }]), { status: 200 });
      }
      if (requestUrl.pathname === '/rest/v1/daily_machine_plan') {
        return new Response('[]', { status: 200 });
      }
      assert.equal(requestUrl.pathname, '/rest/v1/daily_machine_availability');
      assert.equal(init?.method, 'POST');
      unavailableRows.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    };

    try {
      const result = await finishMachineMaintenance('2026-11-13', 'F01');
      assert.equal(maintenanceRows.length, 0);
      assert.equal(unavailableRows[0].status, 'Indisponível');
      assert.equal(unavailableRows[0].availability_date, '2026-11-13');
      assert.deepEqual(result.machineIds, ['F02']);
      assert.equal(settingPlan.machineIds.includes('F01'), false);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });

  it('blocks single plan assignments and excludes maintenance from batch assignments', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let settingPlan: { date: string; machineIds: string[] } = {
      date: '2026-11-13',
      machineIds: [],
    };
    let plannedRows: Record<string, unknown>[] = [];
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    globalThis.fetch = async (input, init) => {
      const requestUrl = new URL(String(input));
      if (requestUrl.pathname === '/rest/v1/machine_maintenance') {
        return new Response(
          JSON.stringify([
            { machine_id: 'F01', note: 'Reparação', started_at: '2026-11-12T08:00:00.000Z' },
          ]),
          { status: 200 }
        );
      }
      if (requestUrl.pathname === '/rest/v1/daily_machine_plan' && !init?.method) {
        return new Response('[]', { status: 200 });
      }
      if (requestUrl.pathname === '/rest/v1/app_settings' && init?.method === 'POST') {
        settingPlan = JSON.parse(String(init.body)).value;
        return new Response(null, { status: 204 });
      }
      if (requestUrl.pathname === '/rest/v1/app_settings') {
        return new Response(JSON.stringify([{ value: settingPlan }]), { status: 200 });
      }
      if (requestUrl.pathname === '/rest/v1/daily_machine_plan' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      plannedRows = JSON.parse(String(init?.body));
      return new Response(null, { status: 204 });
    };

    try {
      await setSetting('cache-reset', null);
      await assert.rejects(
        setDailyMachinePlanned('2026-11-13', 'F01', true),
        /está em manutenção/
      );
      const machineIds = await setAllDailyMachinesPlanned('2026-11-13', ['F01', 'F02']);
      assert.deepEqual(machineIds, ['F02']);
      assert.deepEqual(settingPlan.machineIds, ['F02']);
      assert.deepEqual(plannedRows, [{ plan_date: '2026-11-13', machine_id: 'F02' }]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });

  it('does not reuse a plan saved for another day and defaults to no available machines', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let settingValue: unknown = { date: '2026-11-11', machineIds: ['F01'] };
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    globalThis.fetch = async (input) => {
      const requestUrl = new URL(String(input));
      if (requestUrl.pathname === '/rest/v1/machine_maintenance') {
        return new Response('[]', { status: 200 });
      }
      if (requestUrl.pathname === '/rest/v1/daily_machine_plan') {
        return new Response('[]', { status: 200 });
      }
      assert.equal(requestUrl.pathname, '/rest/v1/app_settings');
      return new Response(JSON.stringify([{ value: settingValue }]), { status: 200 });
    };

    try {
      assert.deepEqual(await getDailyMachinePlan('2026-11-12'), []);
      settingValue = { date: '2026-11-12', machineIds: ['F04'] };
      assert.deepEqual(await getDailyMachinePlan('2026-11-12'), ['F04']);
      settingValue = { date: '2026-11-12', machineIds: [] };
      assert.deepEqual(await getDailyMachinePlan('2026-11-12'), []);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });

  it('loads the daily status map and latest save time from database rows', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    globalThis.fetch = async (input) => {
      const requestUrl = new URL(String(input));
      assert.equal(requestUrl.pathname, '/rest/v1/daily_machine_availability');
      assert.equal(requestUrl.searchParams.get('availability_date'), 'eq.2026-11-12');
      const rows = Array.from({ length: 30 }, (_, index) => ({
        machine_id: `F${String(index + 1).padStart(2, '0')}`,
        status: index === 0 ? 'Indisponível' : 'Disponível',
        note: index === 0 ? 'Em reparação' : '',
        updated_at: index === 0 ? '2026-11-12T10:00:00.000Z' : '2026-11-12T09:00:00.000Z',
      }));
      return new Response(JSON.stringify(rows), { status: 200 });
    };

    try {
      const saved = await getDailyMachineAvailability('2026-11-12');
      assert.equal(saved?.machines.F01.status, 'Indisponível');
      assert.equal(saved?.machines.F01.note, 'Em reparação');
      assert.equal(saved?.savedAt, '2026-11-12T10:00:00.000Z');
      assert.equal(Object.keys(saved?.machines ?? {}).length, 30);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });
});
