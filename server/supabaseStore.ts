export class SupabaseStoreError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export class StoreConflictError extends Error {}

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
type StoppageTemplateRow = {
  id: string;
  stoppage_type_id: string;
  title: string;
  subcategory: string;
  typical_cause: string;
  default_description: string;
  default_actions: string;
  keywords: string[];
  active: boolean;
  display_order: number;
};
type DailyMachinePlanRow = {
  plan_date: string;
  machine_id: string;
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

export async function getDailyMachinePlan(date: string): Promise<string[]> {
  try {
    const query = new URLSearchParams({
      select: 'machine_id',
      plan_date: `eq.${date}`,
      order: 'machine_id.asc',
    });
    const rows = await request<DailyMachinePlanRow[]>(`/daily_machine_plan?${query}`);
    if (rows && rows.length > 0) {
      return rows.map((row) => row.machine_id);
    }
  } catch (error) {
    console.warn('Tabela daily_machine_plan indisponível no Supabase, a recorrer a app_settings:', error);
  }

  // Fallback to app_settings
  try {
    const settingPlan = await getSetting<{ date?: string; machineIds?: string[] }>('daily_machine_plan');
    if (settingPlan?.machineIds && Array.isArray(settingPlan.machineIds) && settingPlan.machineIds.length > 0) {
      return settingPlan.machineIds;
    }
  } catch {
    // ignore
  }

  // Predefinição da fábrica: Todas as 30 máquinas disponíveis (F01 a F30)
  return Array.from({ length: 30 }, (_, i) => `F${(i + 1).toString().padStart(2, '0')}`);
}

export async function setDailyMachinePlanned(
  date: string,
  machineId: string,
  planned: boolean
): Promise<void> {
  const currentList = await getDailyMachinePlan(date);
  const set = new Set(currentList);
  if (planned) set.add(machineId);
  else set.delete(machineId);
  const updatedList = Array.from(set).sort();

  // Guardar em app_settings para garantia e resiliência
  try {
    await setSetting('daily_machine_plan', { date, machineIds: updatedList });
  } catch (settingErr) {
    console.warn('Erro ao guardar plano em app_settings:', settingErr);
  }

  // Tentar guardar na tabela daily_machine_plan se existir
  try {
    const query = new URLSearchParams({
      plan_date: `eq.${date}`,
      machine_id: `eq.${machineId}`,
    });
    if (!planned) {
      await request(`/daily_machine_plan?${query}`, { method: 'DELETE' });
      return;
    }
    await request('/daily_machine_plan?on_conflict=plan_date,machine_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ plan_date: date, machine_id: machineId }),
    });
  } catch (tableErr) {
    console.warn('Aviso não fatal ao gravar em daily_machine_plan:', tableErr);
  }
}

export async function setAllDailyMachinesPlanned(
  date: string,
  machineIds: string[]
): Promise<void> {
  const normalized = Array.from(new Set(machineIds.map((m) => m.trim().toUpperCase()))).sort();

  try {
    await setSetting('daily_machine_plan', { date, machineIds: normalized });
  } catch (settingErr) {
    console.warn('Erro ao guardar lote em app_settings:', settingErr);
  }

  try {
    const query = new URLSearchParams({ plan_date: `eq.${date}` });
    await request(`/daily_machine_plan?${query}`, { method: 'DELETE' });
    if (normalized.length > 0) {
      await request('/daily_machine_plan', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(normalized.map((id) => ({ plan_date: date, machine_id: id }))),
      });
    }
  } catch (tableErr) {
    console.warn('Aviso não fatal ao gravar lote em daily_machine_plan:', tableErr);
  }
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

export interface StoppageTemplateItem {
  id: string;
  stoppageTypeId: string;
  title: string;
  subcategory: string;
  typicalCause: string;
  defaultDescription: string;
  defaultActions: string;
  keywords: string[];
  active: boolean;
  displayOrder?: number;
}

const DEFAULT_TEMPLATES_FALLBACK: StoppageTemplateItem[] = [
  {
    id: 'tpl-mec-1',
    stoppageTypeId: 'st-1',
    title: 'Rolamento Danificado / Gripado',
    subcategory: 'Transmissão Mecânica',
    typicalCause: 'Falta de lubrificação ou fadiga do rolamento do veio principal.',
    defaultDescription: 'Ruído excessivo e vibração anormal no conjunto de rolamentos. Bloqueio parcial do veio.',
    defaultActions: 'Desmontagem do mancal, remoção do rolamento gripado, limpeza do veio, montagem de novo rolamento e lubrificação com massa de alta temperatura.',
    keywords: ['rolamento', 'gripado', 'vibração', 'veio', 'lubrificação', 'mancal'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-mec-2',
    stoppageTypeId: 'st-1',
    title: 'Correia de Transmissão Partida ou Frouxa',
    subcategory: 'Transmissão Mecânica',
    typicalCause: 'Desgaste por atrito ou tensão desajustada na correia.',
    defaultDescription: 'Quebra ou patinagem da correia de transmissão com perda de tração e rotação.',
    defaultActions: 'Substituição da correia gasta por nova unidade com referência correspondente, ajuste de tensão com tensiómetro e teste de rotação.',
    keywords: ['correia', 'patinagem', 'tração', 'tensão', 'polia'],
    active: true,
    displayOrder: 2,
  },
  {
    id: 'tpl-mec-3',
    stoppageTypeId: 'st-1',
    title: 'Bloqueio Mecânico por Obstrução de Peça',
    subcategory: 'Alimentação / Guiamento',
    typicalCause: 'Encravamento de componente ou sucata no tapete de transporte.',
    defaultDescription: 'Linha de transporte parada por obstrução mecânica e bloqueio de guias.',
    defaultActions: 'Paragem de segurança, desobstrução manual dos fragmentos, verificação de folgas das guias e teste de fluxo livre.',
    keywords: ['encravamento', 'obstrução', 'guias', 'tapete', 'bloqueio'],
    active: true,
    displayOrder: 3,
  },
  {
    id: 'tpl-elec-1',
    stoppageTypeId: 'st-2',
    title: 'Disjuntor de Proteção Motor Disparado',
    subcategory: 'Quadro Elétrico / Motores',
    typicalCause: 'Sobrecarga térmica transitória ou pico de corrente no motor.',
    defaultDescription: 'Disparo do térmico no quadro de potência. Motor de acionamento sem alimentação.',
    defaultActions: 'Inspeção térmica do enrolamento, medição de resistência de isolamento (megômetro), rearme do disjuntor e medição de consumo por fase.',
    keywords: ['disjuntor', 'motor', 'sobrecarga', 'quadro elétrico', 'térmico', 'amperagem'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-elec-2',
    stoppageTypeId: 'st-2',
    title: 'Falha / Desalinhamento de Sensor Ótico ou Indutivo',
    subcategory: 'Automação e Sensores',
    typicalCause: 'Depósito de pó/resíduos na lente ótica ou desalinhamento mecânico.',
    defaultDescription: 'Sinal de deteção intermitente no sensor de presença da estação de trabalho.',
    defaultActions: 'Limpeza da lente/cabeça do sensor, reaperto do suporte mecânico, ajuste da distância de comutação e verificação no PLC.',
    keywords: ['sensor', 'ótico', 'indutivo', 'deteção', 'fotocélula', 'alinhamento'],
    active: true,
    displayOrder: 2,
  },
  {
    id: 'tpl-pneu-1',
    stoppageTypeId: 'st-3',
    title: 'Queda de Pressão / Fuga em Tubagem Rápida',
    subcategory: 'Pneumática',
    typicalCause: 'Furo ou desconexão em racord rápido da linha de ar comprimido.',
    defaultDescription: 'Alarme de baixa pressão pneumática na máquina. Fuga de ar audível.',
    defaultActions: 'Localização da fuga, corte da secção danificada, substituição do racord rápido e verificação de estanqueidade a 6 bar.',
    keywords: ['ar comprimido', 'pressão', 'fuga', 'pneumático', 'racord', 'válvula'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-pneu-2',
    stoppageTypeId: 'st-3',
    title: 'Cilindro Pneumático com Movimento Lento ou Bloqueado',
    subcategory: 'Atuadores',
    typicalCause: 'Desgaste de vedantes internos ou estrangulador de escape desregulado.',
    defaultDescription: 'Atuador pneumático não completa o curso dentro do tempo limite.',
    defaultActions: 'Substituição do kit de vedantes do cilindro, afinação dos reguladores de fluxo unidirecionais e lubrificação da haste.',
    keywords: ['cilindro', 'atuador', 'vedantes', 'curso', 'êmbolo', 'estrangulador'],
    active: true,
    displayOrder: 2,
  },
  {
    id: 'tpl-mat-1',
    stoppageTypeId: 'st-4',
    title: 'Esgotamento de Bobine / Fita de Embalagem',
    subcategory: 'Insumos / Consumíveis',
    typicalCause: 'Consumo total da bobine em linha sem reposição preventiva atempada.',
    defaultDescription: 'Paragem automática por sensor de fim de fita/bobine.',
    defaultActions: 'Carregamento de nova bobine, enfiamento do material pelas guias de tensão e teste de selagem.',
    keywords: ['matéria-prima', 'bobine', 'embalagem', 'consumíveis', 'reposição'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-set-1',
    stoppageTypeId: 'st-5',
    title: 'Troca de Molde / Ferramenta de Corte',
    subcategory: 'Troca de Ferramenta',
    typicalCause: 'Mudança de lote de produção conforme planeamento fabril.',
    defaultDescription: 'Troca programada de matriz de estampagem/corte para novo produto.',
    defaultActions: 'Desmontagem do ferramental anterior, limpeza de mesas, fixação de novo molde, aperto com torquímetro e calibração de altura.',
    keywords: ['setup', 'molde', 'ferramenta', 'troca de formato', 'calibração'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-limp-1',
    stoppageTypeId: 'st-6',
    title: 'Limpeza de Fim de Turno / Desinfeção de Linha',
    subcategory: 'Higienização',
    typicalCause: 'Procedimento padrão de higiene e conservação operacional.',
    defaultDescription: 'Limpeza geral de resíduos, aspiração de poeiras e lavagem de superfícies.',
    defaultActions: 'Aplicação de produto desengordurante, enxaguamento, secagem a ar comprimido e desinfeção.',
    keywords: ['limpeza', 'higienização', 'lavagem', 'desinfeção', 'resíduos'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-prev-1',
    stoppageTypeId: 'st-7',
    title: 'Lubrificação Programada e Verificação de Folgas',
    subcategory: 'Preventiva Sistemática',
    typicalCause: 'Cumprimento do plano de manutenção preventiva quinzenal.',
    defaultDescription: 'Execução do plano de lubrificação mecânica e verificação geral de componentes.',
    defaultActions: 'Engraxamento de pontos rotativos, aperto de parafusos de fixação, verificação de níveis de óleo e registo na folha de manutenção.',
    keywords: ['preventiva', 'lubrificação', 'engraxamento', 'inspeção', 'plano quinzenal'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-qual-1',
    stoppageTypeId: 'st-8',
    title: 'Desvio Dimensional / Rebarba Excessiva',
    subcategory: 'Controlo de Qualidade',
    typicalCause: 'Desgaste do gume de corte ou descalibração do batente de encosto.',
    defaultDescription: 'Peças rejeitadas na inspeção de qualidade por não conformidade dimensional.',
    defaultActions: 'Ajuste micrométrico do batente, retificação ou rotação da lâmina de corte e validação das primeiras 5 peças com paquímetro.',
    keywords: ['qualidade', 'desvio', 'dimensional', 'afinação', 'rebarba', 'tolerância'],
    active: true,
    displayOrder: 1,
  },
];

let inMemoryTemplates: StoppageTemplateItem[] = [...DEFAULT_TEMPLATES_FALLBACK];

function templateFromRow(row: StoppageTemplateRow): StoppageTemplateItem {
  return {
    id: row.id,
    stoppageTypeId: row.stoppage_type_id,
    title: row.title,
    subcategory: row.subcategory || '',
    typicalCause: row.typical_cause || '',
    defaultDescription: row.default_description || '',
    defaultActions: row.default_actions || '',
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    active: row.active !== false,
    displayOrder: row.display_order || 0,
  };
}

function templateToRow(tpl: Record<string, unknown> & { id: string }): Record<string, unknown> {
  return {
    id: tpl.id,
    stoppage_type_id: String(tpl.stoppageTypeId || tpl.stoppage_type_id || ''),
    title: String(tpl.title || ''),
    subcategory: String(tpl.subcategory || ''),
    typical_cause: String(tpl.typicalCause || tpl.typical_cause || ''),
    default_description: String(tpl.defaultDescription || tpl.default_description || ''),
    default_actions: String(tpl.defaultActions || tpl.default_actions || ''),
    keywords: Array.isArray(tpl.keywords) ? tpl.keywords : [],
    active: tpl.active !== false,
    display_order: Number(tpl.displayOrder ?? tpl.display_order ?? 0),
  };
}

export async function getStoppageTemplates(): Promise<StoppageTemplateItem[]> {
  try {
    const rows = await getRows<StoppageTemplateRow>('stoppage_templates', 'select=*&order=display_order.asc,created_at.asc');
    if (rows && rows.length > 0) {
      const mapped = rows.map(templateFromRow);
      inMemoryTemplates = mapped;
      return mapped;
    }
  } catch (error) {
    console.warn('Erro ao carregar stoppage_templates do Supabase, a usar cache local:', error);
  }
  return inMemoryTemplates;
}

export async function createStoppageTemplate(template: Record<string, unknown> & { id: string }): Promise<StoppageTemplateItem> {
  const row = templateToRow(template);
  await request('/stoppage_templates', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  const item = templateFromRow(row as unknown as StoppageTemplateRow);
  inMemoryTemplates = [...inMemoryTemplates.filter((t) => t.id !== item.id), item];
  return item;
}

export async function updateStoppageTemplate(
  id: string,
  changes: Record<string, unknown>
): Promise<StoppageTemplateItem | undefined> {
  const rowChanges: Record<string, unknown> = {};
  if (changes.title !== undefined) rowChanges.title = String(changes.title);
  if (changes.stoppageTypeId !== undefined) rowChanges.stoppage_type_id = String(changes.stoppageTypeId);
  if (changes.subcategory !== undefined) rowChanges.subcategory = String(changes.subcategory);
  if (changes.typicalCause !== undefined) rowChanges.typical_cause = String(changes.typicalCause);
  if (changes.defaultDescription !== undefined) rowChanges.default_description = String(changes.defaultDescription);
  if (changes.defaultActions !== undefined) rowChanges.default_actions = String(changes.defaultActions);
  if (changes.keywords !== undefined && Array.isArray(changes.keywords)) rowChanges.keywords = changes.keywords;
  if (changes.active !== undefined) rowChanges.active = Boolean(changes.active);
  if (changes.displayOrder !== undefined) rowChanges.display_order = Number(changes.displayOrder);

  const query = new URLSearchParams({ id: `eq.${id}` });
  const rows = await request<StoppageTemplateRow[]>(`/stoppage_templates?${query}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(rowChanges),
  });
  if (!rows?.[0]) return undefined;

  const updated = templateFromRow(rows[0]);
  inMemoryTemplates = inMemoryTemplates.map((t) => (t.id === id ? updated : t));
  return updated;
}

export async function deleteStoppageTemplate(id: string): Promise<void> {
  const query = new URLSearchParams({ id: `eq.${id}` });
  await request(`/stoppage_templates?${query}`, { method: 'DELETE' });
  inMemoryTemplates = inMemoryTemplates.filter((t) => t.id !== id);
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
  const normalizedMachineId = normalizeMachineId(record.machineId);

  const rpcResult = await request<{ success?: boolean; data?: Record<string, unknown>; error?: string }>(
    '/rpc/save_stoppage_and_clear_active',
    {
      method: 'POST',
      body: JSON.stringify({
        p_record: record,
        p_machine_id: normalizedMachineId,
        p_start_timestamp: record.startTimestamp,
        p_expected_active: expectedActive,
      }),
    }
  );

  if (!rpcResult) {
    throw new SupabaseStoreError(502, 'O Supabase devolveu uma resposta inválida ao guardar a paragem.');
  }
  if (rpcResult.success === false) {
    throw new StoreConflictError(rpcResult?.error || 'A paragem ativa foi alterada noutro posto.');
  }
  if (rpcResult.success !== true) {
    throw new SupabaseStoreError(502, 'O Supabase devolveu uma resposta inválida ao guardar a paragem.');
  }
  return { success: true, data: rpcResult.data || record };
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
  const patched = await request<StoppageRow[]>(`/stoppages?${query}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!patched?.length) return { success: false };
  return { success: true, data: patched[0].data || record };
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
