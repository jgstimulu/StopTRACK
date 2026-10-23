import { Operator, StoppageTypeItem, StoppageRecord, ActiveDowntime } from '../types/manutrack';

export interface SharedPlantState {
  operators: Operator[];
  stoppageTypes: StoppageTypeItem[];
  activeDowntimes: ActiveDowntime[];
  stoppages: StoppageRecord[];
  adminEmail?: string;
  serverTime: number;
  updatedAt: number;
}

const TOKEN_KEY = 'manutrack_admin_token';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

function getAuthHeaders(): Record<string, string> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function apiAdminLogin(
  email: string,
  password: string
): Promise<{ success: boolean; token: string; user: { email: string; role: string } }> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Credenciais de administrador inválidas.');
  }
  const data = await res.json();
  setAdminToken(data.token);
  return data;
}

export async function apiAdminVerify(): Promise<{ authenticated: boolean; user?: { email: string; role: string } }> {
  const token = getAdminToken();
  if (!token) return { authenticated: false };

  const res = await fetch('/api/admin/me', {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return { authenticated: false };
  return await res.json();
}

export async function apiAdminChangeCredentials(
  currentPassword: string,
  newPassword?: string,
  newEmail?: string,
  newPin?: string
): Promise<{ success: boolean; email: string; pin?: string }> {
  const res = await fetch('/api/admin/change-credentials', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ currentPassword, newPassword, newEmail, newPin }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Erro ao alterar credenciais.');
  }
  return await res.json();
}

export async function apiAdminLogout(): Promise<void> {
  try {
    await fetch('/api/admin/logout', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } finally {
    clearAdminToken();
  }
}

export async function fetchSharedState(): Promise<SharedPlantState> {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error('Falha ao comunicar com a nuvem central');
  return await res.json();
}

export async function apiStartActiveDowntime(downtime: ActiveDowntime): Promise<ActiveDowntime> {
  const res = await fetch('/api/active-stoppages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(downtime),
  });
  if (!res.ok) throw new Error('Falha ao registar paragem ativa na nuvem');
  return await res.json();
}

export async function apiCancelActiveDowntime(machineId: string): Promise<void> {
  const res = await fetch(`/api/active-stoppages/${machineId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Falha ao cancelar paragem ativa');
}

export async function apiSaveStoppage(record: StoppageRecord): Promise<StoppageRecord> {
  const res = await fetch('/api/stoppages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error('Falha ao guardar paragem na nuvem');
  return await res.json();
}

export async function apiDeleteStoppage(id: string, pin?: string): Promise<void> {
  const headers = getAuthHeaders();
  if (pin) {
    headers['x-deletion-pin'] = pin.trim();
  }

  const res = await fetch(`/api/stoppages/${id}`, {
    method: 'DELETE',
    headers,
    body: pin ? JSON.stringify({ pin: pin.trim() }) : undefined,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'PIN de segurança incorreto. Falha ao remover paragem.');
  }
}

export async function apiMigrateLocalRecords(
  localRecords: StoppageRecord[]
): Promise<{ success: boolean; addedCount: number; total: number }> {
  const res = await fetch('/api/migrate-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localRecords }),
  });
  if (!res.ok) throw new Error('Falha ao migrar dados locais');
  return await res.json();
}

export async function apiBatchImportStoppages(
  records: StoppageRecord[],
  replaceExisting: boolean = false
): Promise<{ success: boolean; importedCount: number; duplicatesSkipped: number; totalRecords: number }> {
  const res = await fetch('/api/stoppages/batch-import', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ records, replaceExisting }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao importar registos CSV');
  }
  return await res.json();
}

export async function apiAddOperator(data: Omit<Operator, 'id' | 'active'>): Promise<Operator> {
  const res = await fetch('/api/operators', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao adicionar operador');
  }
  return await res.json();
}

export async function apiUpdateOperator(id: string, data: Partial<Operator>): Promise<Operator> {
  const res = await fetch(`/api/operators/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao atualizar operador');
  }
  return await res.json();
}

export async function apiDeleteOperator(id: string): Promise<void> {
  const res = await fetch(`/api/operators/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao remover operador');
  }
}

export async function apiAddStoppageType(
  data: Omit<StoppageTypeItem, 'id' | 'active'>
): Promise<StoppageTypeItem> {
  const res = await fetch('/api/stoppage-types', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao adicionar tipo de paragem');
  }
  return await res.json();
}

export async function apiUpdateStoppageType(
  id: string,
  data: Partial<StoppageTypeItem>
): Promise<StoppageTypeItem> {
  const res = await fetch(`/api/stoppage-types/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao atualizar tipo de paragem');
  }
  return await res.json();
}

export async function apiDeleteStoppageType(id: string): Promise<void> {
  const res = await fetch(`/api/stoppage-types/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao remover tipo de paragem');
  }
}

export async function apiResetDefaults(): Promise<void> {
  const res = await fetch('/api/reset-defaults', {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao restaurar padrões de fábrica');
  }
}
