export class SupabaseStoreError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface AdminCredentials {
  email: string;
  passwordSalt: string;
  passwordHash: string;
  passwordAlgorithm?: 'scrypt' | 'pbkdf2-sha512-v1';
  updatedAt: number;
}

export interface StoredSession {
  role: 'admin' | 'operator';
  operatorId?: string;
  canStart?: boolean;
  canClose?: boolean;
  expiresAt: number;
}

type SettingRow = { key: string; value: unknown };
type OperatorRow = {
  id: string;
  name: string;
  role: string;
  can_start: boolean;
  can_close: boolean;
  active: boolean;
  pin_salt?: string;
  pin_hash?: string;
};
type DataRow = { id: string; data: Record<string, unknown> };
type ActiveDowntimeRow = DataRow & { machine_id: string; start_timestamp: number };
type StoppageRow = DataRow & {
  machine_id: string;
  date: string;
  start_time: string;
  start_timestamp: number;
  created_at: number;
};
type StoppageTypeRow = {
  id: string;
  name: string;
  color: string;
  description: string;
  active: boolean;
};
type SessionRow = {
  token_hash: string;
  role: 'admin' | 'operator';
  operator_id?: string;
  can_start?: boolean;
  can_close?: boolean;
  expires_at: number;
};

const PAGE_SIZE = 1000;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new SupabaseStoreError(503, 'Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nos segredos do servidor.');
  }
  return { url, serviceRoleKey };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T | undefined> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const headers = new Headers(init.headers);
  headers.set('apikey', serviceRoleKey);
  if (!serviceRoleKey.startsWith('sb_secret_')) {
    headers.set('Authorization', `Bearer ${serviceRoleKey}`);
  } else {
    headers.delete('Authorization');
  }
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1${path}`, { ...init, headers });
  } catch (error) {
    throw new SupabaseStoreError(503, `Não foi possível contactar o Supabase: ${String(error)}`);
  }

  const body = await response.text();
  if (!response.ok) {
    throw new SupabaseStoreError(
      response.status,
      `Pedido Supabase falhou (${response.status}): ${body.slice(0, 400)}`
    );
  }
  return body ? JSON.parse(body) as T : undefined;
}

async function getRows<T>(table: string, query: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await request<T[]>(
      `/${table}?${query}`,
      {
        headers: {
          Range: `${offset}-${offset + PAGE_SIZE - 1}`,
          'Range-Unit': 'items',
        },
      }
    );
    const batch = page || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

function settingPath(key: string) {
  return `/app_settings?${new URLSearchParams({ select: 'value', key: `eq.${key}`, limit: '1' })}`;
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const rows = await request<Pick<SettingRow, 'value'>[]>(settingPath(key));
  return rows?.[0]?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await request('/app_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key, value }),
  });
}

export async function getAdminCredentials(): Promise<AdminCredentials | undefined> {
  return getSetting<AdminCredentials>('admin_credentials');
}

export async function saveAdminCredentials(credentials: AdminCredentials): Promise<void> {
  await setSetting('admin_credentials', credentials);
}

function operatorFromRow(row: OperatorRow) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    canStart: row.can_start,
    canClose: row.can_close,
    active: row.active,
    pinSalt: row.pin_salt,
    pinHash: row.pin_hash,
  };
}

function operatorToRow(operator: Record<string, unknown> & { id: string }): OperatorRow {
  return {
    id: operator.id,
    name: String(operator.name),
    role: String(operator.role),
    can_start: operator.canStart === true,
    can_close: operator.canClose === true,
    active: operator.active === true,
    pin_salt: typeof operator.pinSalt === 'string' ? operator.pinSalt : undefined,
    pin_hash: typeof operator.pinHash === 'string' ? operator.pinHash : undefined,
  };
}

export async function getOperators() {
  const rows = await getRows<OperatorRow>('operators', 'select=*');
  return rows.map(operatorFromRow);
}

export async function getOperator(id: string) {
  const query = new URLSearchParams({ select: '*', id: `eq.${id}`, limit: '1' });
  const rows = await request<OperatorRow[]>(`/operators?${query}`);
  return rows?.[0] ? operatorFromRow(rows[0]) : undefined;
}

export async function createOperator(operator: Record<string, unknown> & { id: string }) {
  await request('/operators', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(operatorToRow(operator)),
  });
}

export async function updateOperator(operator: Record<string, unknown> & { id: string }) {
  const query = new URLSearchParams({ id: `eq.${operator.id}` });
  const rows = await request<OperatorRow[]>(`/operators?${query}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(operatorToRow(operator)),
  });
  return Boolean(rows?.length);
}

export async function deleteOperator(id: string) {
  const query = new URLSearchParams({ id: `eq.${id}` });
  await request(`/operators?${query}`, { method: 'DELETE' });
}

export async function getStoppageTypes() {
  const rows = await getRows<StoppageTypeRow>('stoppage_types', 'select=*');
  return rows.map(({ id, name, color, description, active }) => ({
    id, name, color, description, active,
  }));
}

export async function createStoppageType(stoppageType: Record<string, unknown> & { id: string }) {
  await request('/stoppage_types', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(stoppageType),
  });
}

export async function importStoppageTypes(stoppageTypes: Record<string, unknown>[]) {
  if (!stoppageTypes.length) return;
  await request('/stoppage_types?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(stoppageTypes),
  });
}

export async function updateStoppageType(id: string, changes: Record<string, unknown>) {
  const query = new URLSearchParams({ id: `eq.${id}` });
  const rows = await request<StoppageTypeRow[]>(`/stoppage_types?${query}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(changes),
  });
  return rows?.[0] ? {
    id: rows[0].id,
    name: rows[0].name,
    color: rows[0].color,
    description: rows[0].description,
    active: rows[0].active,
  } : undefined;
}

export async function deleteStoppageType(id: string) {
  const query = new URLSearchParams({ id: `eq.${id}` });
  await request(`/stoppage_types?${query}`, { method: 'DELETE' });
}

function normalizeMachineId(machineId: string) {
  return machineId.trim().replace(/\s+/g, '').toUpperCase();
}

export async function getActiveDowntimes() {
  const rows = await getRows<ActiveDowntimeRow>('active_stoppages', 'select=*');
  return rows.map((row) => row.data);
}

export async function getActiveDowntime(machineId: string) {
  const normalizedId = normalizeMachineId(machineId);
  const query = new URLSearchParams({ select: '*', machine_id: `eq.${normalizedId}`, limit: '1' });
  const rows = await request<ActiveDowntimeRow[]>(`/active_stoppages?${query}`);
  return rows?.[0]?.data;
}

export async function saveActiveDowntime(
  downtime: Record<string, unknown> & { machineId: string; startTimestamp: number },
  replaceExisting: boolean,
  requireExisting: boolean,
  expectedStartTimestamp?: number
) {
  return request<{ success: boolean; data?: Record<string, unknown>; error?: string }>(
    '/rpc/save_active_stoppage',
    {
      method: 'POST',
      body: JSON.stringify({
        p_machine_id: normalizeMachineId(downtime.machineId),
        p_data: downtime,
        p_replace_existing: replaceExisting,
        p_require_existing: requireExisting,
        p_expected_start_timestamp: expectedStartTimestamp ?? null,
      }),
    }
  );
}

export async function importActiveDowntimesIfAbsent(downtimes: Record<string, unknown>[]) {
  for (const downtime of downtimes) {
    if (typeof downtime.machineId !== 'string' || !Number.isFinite(downtime.startTimestamp)) continue;
    const normalizedId = normalizeMachineId(downtime.machineId);
    await request('/active_stoppages?on_conflict=machine_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        machine_id: normalizedId,
        id: downtime.id,
        start_timestamp: downtime.startTimestamp,
        data: downtime,
      }),
    });
  }
}

export async function deleteActiveDowntime(machineId: string) {
  const query = new URLSearchParams({ machine_id: `eq.${normalizeMachineId(machineId)}` });
  await request(`/active_stoppages?${query}`, { method: 'DELETE' });
}

export async function getStoppages() {
  const rows = await getRows<StoppageRow>('stoppages', 'select=*');
  return rows.map((row) => row.data);
}

export async function saveStoppage(
  record: Record<string, unknown> & { id: string; machineId: string; startTimestamp: number; startTime: string; date: string; createdAt: number },
  expectedActive: boolean
) {
  return request<Record<string, unknown>>('/rpc/save_stoppage_and_clear_active', {
    method: 'POST',
    body: JSON.stringify({
      p_record: record,
      p_machine_id: normalizeMachineId(record.machineId),
      p_start_timestamp: record.startTimestamp,
      p_expected_active: expectedActive,
    }),
  });
}

export async function updateStoppage(
  id: string,
  record: Record<string, unknown> & { id: string; machineId: string; startTimestamp: number; startTime: string; date: string; createdAt: number }
) {
  const normalizedMachineId = normalizeMachineId(record.machineId);
  const row = {
    id,
    machine_id: normalizedMachineId,
    date: record.date,
    start_time: record.startTime,
    start_timestamp: record.startTimestamp,
    created_at: record.createdAt || 0,
    data: record,
  };
  const query = new URLSearchParams({ id: `eq.${id}` });
  try {
    const patched = await request<StoppageRow[]>(`/stoppages?${query}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    if (patched && patched.length > 0) {
      return { success: true, data: patched[0].data || record };
    }
  } catch (patchErr) {
    console.warn('Direct PATCH on /stoppages failed, falling back to RPC:', patchErr);
  }
  return saveStoppage(record, false);
}

export async function deleteStoppage(id: string) {
  const query = new URLSearchParams({ id: `eq.${id}` });
  const rows = await request<DataRow[]>(`/stoppages?${query}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  return rows?.length || 0;
}

export async function batchImportStoppages(records: Record<string, unknown>[], replaceExisting: boolean) {
  const result = await request<{
    importedCount: number;
    duplicatesSkipped: number;
    totalRecords: number;
  }>('/rpc/batch_import_stoppages', {
    method: 'POST',
    body: JSON.stringify({ p_records: records, p_replace_existing: replaceExisting }),
  });

  if (
    !result ||
    !Number.isInteger(result.importedCount) ||
    result.importedCount < 0 ||
    !Number.isInteger(result.duplicatesSkipped) ||
    result.duplicatesSkipped < 0 ||
    !Number.isInteger(result.totalRecords) ||
    result.totalRecords < 0
  ) {
    throw new SupabaseStoreError(502, 'O Supabase devolveu uma resposta inválida à importação de paragens.');
  }

  return result;
}

export async function resetAppData(defaultTypes: Record<string, unknown>[]) {
  await request('/rpc/reset_app_data', {
    method: 'POST',
    body: JSON.stringify({ p_default_types: defaultTypes }),
  });
}

export async function createSession(tokenHash: string, session: StoredSession) {
  await request('/auth_sessions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      token_hash: tokenHash,
      role: session.role,
      operator_id: session.operatorId,
      can_start: session.canStart,
      can_close: session.canClose,
      expires_at: session.expiresAt,
    }),
  });
}

export async function getSession(tokenHash: string): Promise<StoredSession | undefined> {
  const query = new URLSearchParams({ select: '*', token_hash: `eq.${tokenHash}`, limit: '1' });
  const rows = await request<SessionRow[]>(`/auth_sessions?${query}`);
  const row = rows?.[0];
  if (!row) return undefined;
  return {
    role: row.role,
    operatorId: row.operator_id,
    canStart: row.can_start,
    canClose: row.can_close,
    expiresAt: row.expires_at,
  };
}

export async function deleteSession(tokenHash: string) {
  const query = new URLSearchParams({ token_hash: `eq.${tokenHash}` });
  await request(`/auth_sessions?${query}`, { method: 'DELETE' });
}

export async function deleteSessionsForRole(role: StoredSession['role']) {
  const query = new URLSearchParams({ role: `eq.${role}` });
  await request(`/auth_sessions?${query}`, { method: 'DELETE' });
}

export async function deleteSessionsForOperator(operatorId: string) {
  const query = new URLSearchParams({ operator_id: `eq.${operatorId}` });
  await request(`/auth_sessions?${query}`, { method: 'DELETE' });
}

// Limite de tentativas de login (tabela e funções em supabase/migrations/20261028000000_login_throttling.sql).
export async function loginThrottleStatus(keys: string[], now: number): Promise<number> {
  const result = await request<number | string | null>('/rpc/login_throttle_status', {
    method: 'POST',
    body: JSON.stringify({ p_keys: keys, p_now: now }),
  });
  return Number(result) || 0;
}

export async function loginThrottleFail(
  key: string,
  now: number,
  limit: number,
  windowMs: number,
  lockMs: number
): Promise<number> {
  const result = await request<number | string | null>('/rpc/login_throttle_fail', {
    method: 'POST',
    body: JSON.stringify({
      p_key: key,
      p_now: now,
      p_limit: limit,
      p_window_ms: windowMs,
      p_lock_ms: lockMs,
    }),
  });
  return Number(result) || 0;
}

export async function loginThrottleClear(keys: string[]) {
  await request('/rpc/login_throttle_clear', {
    method: 'POST',
    body: JSON.stringify({ p_keys: keys }),
  });
}
