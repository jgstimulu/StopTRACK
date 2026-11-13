import {
  Operator,
  StoppageTypeItem,
  StoppageRecord,
  ActiveDowntime,
  StoppageTemplate,
  MachineAvailabilityState,
  MachineMaintenanceRecord,
} from '../types/manutrack';

export interface SharedPlantState {
  operators: Operator[];
  stoppageTypes: StoppageTypeItem[];
  stoppageTemplates?: StoppageTemplate[];
  activeDowntimes: ActiveDowntime[];
  stoppages: StoppageRecord[];
  dailyMachinePlan: DailyMachinePlan;
  dailyMachineAvailability: DailyMachineAvailability | null;
  machineMaintenances: MachineMaintenanceRecord[];
  dailyMachineAvailabilityError?: string;
  adminEmail?: string;
  serverTime: number;
  updatedAt: number;
}

export interface DailyMachinePlan {
  date: string;
  machineIds: string[];
}

export interface DailyMachineAvailability {
  date: string;
  machines: Record<string, MachineAvailabilityState>;
  savedAt: string;
}


const TOKEN_KEY = 'manutrack_admin_token';
const OPERATOR_TOKEN_KEY = 'manutrack_operator_token';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface LoginOperator {
  id: string;
  name: string;
  role: string;
  canStart: boolean;
  canClose: boolean;
}

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

export function getOperatorToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(OPERATOR_TOKEN_KEY);
}

export function clearOperatorToken(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(OPERATOR_TOKEN_KEY);
}

export function hasStoredSession(): boolean {
  return Boolean(getAdminToken() || getOperatorToken());
}

export async function apiOperatorLogin(operatorId: string, pin: string): Promise<void> {
  const res = await fetch('/api/operators/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operatorId, pin }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'Falha ao autenticar operador.');
  }
  const data = await res.json();
  sessionStorage.setItem(OPERATOR_TOKEN_KEY, data.token);
}

function getAuthHeaders(): Record<string, string> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }
  return headers;
}

function getOperatorHeaders(): Record<string, string> {
  const token = getOperatorToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  return headers;
}

async function responseError(res: Response, fallback: string): Promise<ApiError> {
  const data = await res.json().catch(() => ({}));
  return new ApiError(data.error || fallback, res.status);
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
  newEmail?: string
): Promise<{ success: boolean; token: string; email: string }> {
  const res = await fetch('/api/admin/change-credentials', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ currentPassword, newPassword, newEmail }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Erro ao alterar credenciais.');
  }
  const data = await res.json();
  setAdminToken(data.token);
  return data;
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

export async function apiOperatorLogout(): Promise<void> {
  const token = getOperatorToken();
  try {
    if (token) {
      await fetch('/api/operators/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
    }
  } finally {
    clearOperatorToken();
  }
}

export async function fetchLoginOperators(): Promise<LoginOperator[]> {
  const res = await fetch('/api/auth/operators');
  if (!res.ok) throw await responseError(res, 'Falha ao carregar a lista de operadores.');
  return await res.json();
}

export async function fetchSharedState(): Promise<SharedPlantState> {
  const tokens = [getOperatorToken(), getAdminToken()].filter((token): token is string => Boolean(token));
  if (!tokens.length) {
    throw new ApiError('Sessão necessária. Inicie sessão para continuar.', 401);
  }

  let lastError: ApiError = new ApiError('Falha ao comunicar com a nuvem central', 500);
  for (const token of tokens) {
    const res = await fetch('/api/state', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (res.ok) {
      return await res.json();
    }
    lastError = await responseError(res, 'Falha ao comunicar com a nuvem central');
    if (res.status !== 401) {
      throw lastError;
    }
  }
  throw lastError;
}

export async function apiSaveDailyMachineAvailability(
  machines: Record<string, MachineAvailabilityState>
): Promise<DailyMachineAvailability> {
  const token = getAdminToken() || getOperatorToken();
  if (!token) {
    throw new ApiError('Sessão necessária para guardar a disponibilidade diária.', 401);
  }
  const res = await fetch('/api/daily-machine-availability', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ machines }),
  });
  if (!res.ok) {
    throw await responseError(res, 'Falha ao guardar a disponibilidade diária no Supabase.');
  }
  return await res.json();
}

export async function apiFinishMachineMaintenance(
  machineId: string
): Promise<{ date: string; machineId: string; machineIds: string[]; finishedAt: string }> {
  const token = getAdminToken() || getOperatorToken();
  if (!token) {
    throw new ApiError('Sessão necessária para terminar a manutenção.', 401);
  }
  const res = await fetch(
    `/api/machine-maintenance/${encodeURIComponent(machineId)}/finish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    }
  );
  if (!res.ok) {
    throw await responseError(res, 'Falha ao terminar a manutenção da máquina.');
  }
  return await res.json();
}

export async function apiStartActiveDowntime(downtime: ActiveDowntime): Promise<ActiveDowntime> {
  const res = await fetch('/api/active-stoppages', {
    method: 'POST',
    headers: getOperatorHeaders(),
    body: JSON.stringify(downtime),
  });
  if (!res.ok) throw await responseError(res, 'Falha ao registar paragem ativa na nuvem.');
  return await res.json();
}

export async function apiSetDailyMachinePlanned(
  machineId: string,
  planned: boolean
): Promise<{ date: string; machineId: string; planned: boolean }> {
  const adminToken = getAdminToken();
  const token = adminToken || getOperatorToken();
  if (!token) {
    throw new ApiError('Sessão de Administrador necessária para alterar o estado das máquinas.', 401);
  }
  const res = await fetch(`/api/daily-machine-plan/${encodeURIComponent(machineId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ planned }),
  });
  if (!res.ok) {
    throw await responseError(res, 'Falha ao atualizar o estado da máquina.');
  }
  return await res.json();
}

export async function apiSetAllDailyMachinesPlanned(
  machineIds: string[]
): Promise<{ date: string; machineIds: string[] }> {
  const token = getAdminToken() || getOperatorToken();
  if (!token) {
    throw new ApiError('Sessão de Administrador necessária para alterar o parque de máquinas.', 401);
  }
  const res = await fetch('/api/daily-machine-plan', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ machineIds }),
  });
  if (!res.ok) {
    throw await responseError(res, 'Falha ao atualizar o parque de máquinas.');
  }
  return await res.json();
}

export async function apiCancelActiveDowntime(machineId: string): Promise<void> {
  const headers = getOperatorHeaders();
  const adminToken = getAdminToken();
  if (!headers.Authorization && adminToken) {
    headers.Authorization = 'Bearer ' + adminToken;
  }
  const res = await fetch(`/api/active-stoppages/${encodeURIComponent(machineId)}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw await responseError(res, 'Falha ao cancelar paragem ativa.');
}

export async function apiSaveStoppage(
  record: StoppageRecord,
  requireOperatorAuth = false,
  pin?: string
): Promise<StoppageRecord> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const operatorToken = getOperatorToken();
  const adminToken = getAdminToken();
  if (operatorToken) {
    headers.Authorization = 'Bearer ' + operatorToken;
  } else if (adminToken) {
    headers.Authorization = 'Bearer ' + adminToken;
  }
  if (pin && pin.trim()) {
    headers['x-operator-pin'] = pin.trim();
  }

  const res = await fetch('/api/stoppages', {
    method: 'POST',
    headers,
    body: JSON.stringify(record),
  });
  if (!res.ok) throw await responseError(res, 'Falha ao guardar paragem na nuvem.');
  return await res.json();
}

export async function apiUpdateStoppage(
  record: StoppageRecord,
  pin?: string
): Promise<StoppageRecord> {
  const headers = getAuthHeaders();
  const operatorToken = getOperatorToken();
  if (!getAdminToken() && operatorToken) {
    headers.Authorization = 'Bearer ' + operatorToken;
  }
  if (pin) {
    headers['x-operator-pin'] = pin.trim();
  }

  const res = await fetch(`/api/stoppages/${encodeURIComponent(record.id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...record, pin: pin ? pin.trim() : undefined }),
  });
  if (!res.ok) {
    throw await responseError(res, 'Falha ao atualizar dados da paragem.');
  }
  return await res.json();
}

export async function apiDeleteStoppage(id: string, pin?: string): Promise<void> {
  const headers = getAuthHeaders();
  const operatorToken = getOperatorToken();
  if (!getAdminToken() && operatorToken) {
    headers.Authorization = 'Bearer ' + operatorToken;
  }
  if (pin) {
    headers['x-deletion-pin'] = pin.trim();
  }

  const res = await fetch(`/api/stoppages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
    body: pin ? JSON.stringify({ pin: pin.trim() }) : undefined,
  });

  if (!res.ok) {
    throw await responseError(res, 'PIN de segurança incorreto. Falha ao remover paragem.');
  }
}

export async function apiMigrateLocalRecords(
  localRecords: StoppageRecord[]
): Promise<{ success: boolean; addedCount: number; total: number }> {
  const res = await fetch('/api/migrate-local', {
    method: 'POST',
    headers: getAuthHeaders(),
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

export async function apiAddOperator(data: Omit<Operator, 'id' | 'active'>, pin: string): Promise<Operator> {
  const res = await fetch('/api/operators', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ ...data, pin }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao adicionar operador');
  }
  return await res.json();
}

export async function apiUpdateOperator(id: string, data: Partial<Operator> & { pin?: string }): Promise<Operator> {
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

export async function apiGetStoppageTemplates(): Promise<StoppageTemplate[]> {
  const res = await fetch('/api/stoppage-templates');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao carregar modelos de avaria');
  }
  return await res.json();
}

export async function apiAddStoppageTemplate(
  data: Omit<StoppageTemplate, 'id' | 'active'>
): Promise<StoppageTemplate> {
  const res = await fetch('/api/stoppage-templates', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao criar modelo de avaria');
  }
  return await res.json();
}

export async function apiUpdateStoppageTemplate(
  id: string,
  data: Partial<StoppageTemplate>
): Promise<StoppageTemplate> {
  const res = await fetch(`/api/stoppage-templates/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao atualizar modelo de avaria');
  }
  return await res.json();
}

export async function apiDeleteStoppageTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/stoppage-templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao eliminar modelo de avaria');
  }
}

