import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getDailyMachineAvailability,
  setDailyMachineAvailability,
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
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    globalThis.fetch = async (input, init) => {
      const requestUrl = new URL(String(input));
      assert.equal(requestUrl.pathname, '/rest/v1/daily_machine_availability');
      assert.equal(requestUrl.searchParams.get('on_conflict'), 'availability_date,machine_id');
      assert.equal(init?.method, 'POST');
      insertedRows = JSON.parse(String(init?.body));
      return new Response(null, { status: 204 });
    };

    try {
      const saved = await setDailyMachineAvailability('2026-11-12', completeAvailability());
      assert.equal(insertedRows.length, 30);
      assert.equal(insertedRows[0].availability_date, '2026-11-12');
      assert.equal(insertedRows[0].machine_id, 'F01');
      assert.equal(insertedRows[0].status, 'Indisponível');
      assert.equal(insertedRows[0].note, 'Em reparação');
      assert.equal(saved.date, '2026-11-12');
      assert.deepEqual(saved.machines, completeAvailability());
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
