import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Persistent cloud database file path
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Default initial seed data (Starting from clean slate)
const DEFAULT_OPERATORS: any[] = [];

const DEFAULT_STOPPAGE_TYPES = [
  { id: 'st-1', name: 'Avaria Mecânica', color: 'rose', description: 'Rolamentos, correias, engrenagens, quebras estruturais', active: true },
  { id: 'st-2', name: 'Avaria Elétrica', color: 'amber', description: 'Motores, sensores, disjuntores, cablagem, PLCs', active: true },
  { id: 'st-3', name: 'Problema Pneumático / Hidráulico', color: 'sky', description: 'Fugas de ar, cilindros, válvulas solenóide, pressão de óleo', active: true },
  { id: 'st-4', name: 'Falta de Matéria-Prima', color: 'orange', description: 'Ausência de bobines, caixas, químicos ou insumos', active: true },
  { id: 'st-5', name: 'Setup / Mudança de Formato', color: 'indigo', description: 'Ajuste de moldes, troca de ferramentas, afinação', active: true },
  { id: 'st-6', name: 'Limpeza e Higienização', color: 'emerald', description: 'Lavagem de linha, aspiração, desinfeção', active: true },
  { id: 'st-7', name: 'Manutenção Preventiva', color: 'blue', description: 'Revisão periódica programada, lubrificação', active: true },
  { id: 'st-8', name: 'Qualidade / Afinação', color: 'purple', description: 'Desvio de tolerâncias, defeito de produto, amostras', active: true },
  { id: 'st-9', name: 'Operacional / Outro', color: 'slate', description: 'Pausa operacional, falta de operador, outros motivos', active: true },
];

const DEFAULT_STOPPAGES_SEED: any[] = [];

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const PIN_PATTERN = /^\d{4,8}$/;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

interface DatabaseSchema {
  admin: { email: string; passwordSalt: string; passwordHash: string; updatedAt: number };
  operators: any[];
  stoppageTypes: typeof DEFAULT_STOPPAGE_TYPES;
  activeDowntimes: any[];
  stoppages: any[];
  updatedAt: number;
}

type Session = {
  role: 'admin' | 'operator';
  operatorId?: string;
  canStart?: boolean;
  canClose?: boolean;
  expiresAt: number;
};
const sessions = new Map<string, Session>();
const pinLoginFailures = new Map<string, { count: number; lockedUntil: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
  for (const [ip, failure] of pinLoginFailures) {
    if (failure.lockedUntil <= now && failure.count === 0) pinLoginFailures.delete(ip);
  }
}, 10 * 60 * 1000).unref();

function hashSecret(secret: string, salt: string): string {
  return crypto.scryptSync(secret, salt, 64).toString('hex');
}

function createSecretHash(secret: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: hashSecret(secret, salt) };
}

function verifySecret(secret: string, salt: string, expectedHash: string): boolean {
  if (secret.length > 256 || !salt || !/^[a-f0-9]{128}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(hashSecret(secret, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function publicOperator(operator: any) {
  const visible = { ...operator };
  for (const field of Object.keys(visible)) {
    if (/^(pin|pinCode|pinHash|pinSalt|password|passwordHash|passwordSalt)$/i.test(field)) {
      delete visible[field];
    }
  }
  return visible;
}

function publicOperators(operators: any[]) {
  return operators.map(publicOperator);
}

type SupabaseOperatorRow = {
  id: string;
  name: string;
  role: string;
  can_start: boolean;
  can_close: boolean;
  active: boolean;
  pin_salt?: string;
  pin_hash?: string;
};

class OperatorStoreRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function requestOperatorStore<T>(
  path: string,
  init: RequestInit = {}
): Promise<T | undefined> {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.');
  }

  const headers = new Headers(init.headers);
  headers.set('apikey', serviceRoleKey);
  headers.set('Authorization', `Bearer ${serviceRoleKey}`);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, { ...init, headers });
  const responseText = await response.text();
  if (!response.ok) {
    throw new OperatorStoreRequestError(
      response.status,
      `Supabase operator request failed (${response.status}): ${responseText.slice(0, 500)}`
    );
  }

  return responseText ? JSON.parse(responseText) as T : undefined;
}

function operatorFromStore(row: SupabaseOperatorRow): any {
  if (
    typeof row.id !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.role !== 'string' ||
    typeof row.can_start !== 'boolean' ||
    typeof row.can_close !== 'boolean' ||
    typeof row.active !== 'boolean'
  ) {
    throw new Error('Supabase returned an invalid operator record.');
  }

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

function operatorToStore(operator: Record<string, unknown> & { id: string }): SupabaseOperatorRow {
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

async function getStoredOperators(): Promise<any[]> {
  const rows = await requestOperatorStore<SupabaseOperatorRow[]>('/operators?select=*&limit=1000');
  return (rows || []).map(operatorFromStore);
}

async function getStoredOperator(id: string): Promise<any | undefined> {
  const query = new URLSearchParams({ select: '*', id: `eq.${id}`, limit: '1' });
  const rows = await requestOperatorStore<SupabaseOperatorRow[]>(`/operators?${query}`);
  return rows?.length ? operatorFromStore(rows[0]) : undefined;
}

async function createStoredOperator(operator: Record<string, unknown> & { id: string }): Promise<void> {
  await requestOperatorStore(
    '/operators',
    {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(operatorToStore(operator)),
    }
  );
}

async function updateStoredOperator(operator: Record<string, unknown> & { id: string }): Promise<boolean> {
  const query = new URLSearchParams({ id: `eq.${operator.id}` });
  const rows = await requestOperatorStore<SupabaseOperatorRow[]>(
    `/operators?${query}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(operatorToStore(operator)),
    }
  );
  return Boolean(rows?.length);
}

async function deleteStoredOperator(id: string): Promise<void> {
  const query = new URLSearchParams({ id: `eq.${id}` });
  await requestOperatorStore(`/operators?${query}`, { method: 'DELETE' });
}

function respondWithOperatorStoreError(res: express.Response, error: unknown) {
  console.error('Supabase operator persistence error:', error);
  return res.status(503).json({
    error: 'Não foi possível aceder à base de dados de operadores. Tente novamente.',
  });
}

async function deleteStoredOperators(): Promise<void> {
  const operators = await getStoredOperators();
  for (let index = 0; index < operators.length; index += 50) {
    await Promise.all(
      operators.slice(index, index + 50).map((operator) => deleteStoredOperator(operator.id))
    );
  }
}

/**
 * Calcula o turno industrial com base nas regras:
 * 05:00 às 14:30 -> 1º Turno
 * 14:30 às 00:00 -> 2º Turno
 * 00:00 às 05:00 -> Turno Noturno
 */
function computeShift(dateOrTimestamp?: any, timeStr?: string): string {
  let d: Date;
  if (typeof dateOrTimestamp === 'number') {
    d = new Date(dateOrTimestamp);
  } else if (dateOrTimestamp instanceof Date) {
    d = dateOrTimestamp;
  } else if (typeof dateOrTimestamp === 'string' && dateOrTimestamp.includes('T')) {
    d = new Date(dateOrTimestamp);
  } else if (timeStr && typeof timeStr === 'string' && timeStr.includes(':')) {
    const parts = timeStr.trim().split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(h) && !isNaN(m)) {
      d = new Date();
      d.setHours(h, m, 0, 0);
    } else {
      d = new Date();
    }
  } else {
    d = new Date();
  }

  const hours = d.getHours();
  const minutes = d.getMinutes();
  const totalMins = hours * 60 + minutes;

  if (totalMins >= 300 && totalMins < 870) {
    return '1º Turno';
  } else if (totalMins >= 870 && totalMins < 1440) {
    return '2º Turno';
  } else {
    return 'Turno Noturno';
  }
}

function loadDatabase(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const parsed = fs.existsSync(DB_FILE)
    ? JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
    : {};
  let admin = parsed.admin;
  let needsSave = !fs.existsSync(DB_FILE);

  if (!admin?.passwordSalt || !admin?.passwordHash) {
    if (
      !ADMIN_EMAIL ||
      ADMIN_EMAIL.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL) ||
      !ADMIN_PASSWORD ||
      ADMIN_PASSWORD.length < 12 ||
      ADMIN_PASSWORD.length > 256
    ) {
      throw new Error('Configure ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres) antes de iniciar o servidor.');
    }
    const password = createSecretHash(ADMIN_PASSWORD);
    admin = {
      email: ADMIN_EMAIL,
      passwordSalt: password.salt,
      passwordHash: password.hash,
      updatedAt: Date.now(),
    };
    needsSave = true;
  }
  if (
    typeof admin.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email) ||
    !/^[a-f0-9]{32}$/i.test(admin.passwordSalt) ||
    !/^[a-f0-9]{128}$/i.test(admin.passwordHash)
  ) {
    throw new Error('As credenciais administrativas guardadas são inválidas; verifique data/db.json e a configuração inicial.');
  }
  admin = {
    email: admin.email,
    passwordSalt: admin.passwordSalt,
    passwordHash: admin.passwordHash,
    updatedAt: Number.isFinite(admin.updatedAt) ? admin.updatedAt : Date.now(),
  };

  const operators = Array.isArray(parsed.operators) ? parsed.operators : [];
  const db: DatabaseSchema = {
    admin,
    operators,
    stoppageTypes: Array.isArray(parsed.stoppageTypes) ? parsed.stoppageTypes : DEFAULT_STOPPAGE_TYPES,
    activeDowntimes: Array.isArray(parsed.activeDowntimes) ? parsed.activeDowntimes : [],
    stoppages: Array.isArray(parsed.stoppages) ? parsed.stoppages : [],
    updatedAt: parsed.updatedAt || Date.now(),
  };
  if (needsSave) saveDatabase(db);
  return db;
}

function saveDatabase(db: DatabaseSchema) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  db.updatedAt = Date.now();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function createSession(session: Omit<Session, 'expiresAt'>): string {
  const token = crypto.randomUUID();
  sessions.set(token, { ...session, expiresAt: Date.now() + SESSION_DURATION_MS });
  return token;
}

function getSession(req: express.Request): Session | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7);
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return undefined;
  }
  return session;
}

function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (getSession(req)?.role !== 'admin') {
    return res.status(401).json({ error: 'É necessária uma sessão válida de administrador.' });
  }
  next();
}

function requireOperatorPermission(permission: 'canStart' | 'canClose') {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const session = getSession(req);
    if (session?.role === 'admin' || (session?.role === 'operator' && session[permission])) {
      return next();
    }
    return res.status(session ? 403 : 401).json({
      error: session ? 'O operador não tem permissão para esta ação.' : 'Autentique-se com o PIN de um operador autorizado.',
    });
  };
}
// REST API ROUTES

// 1. Admin Authentication Routes
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 256) {
    return res.status(400).json({ error: 'Email e palavra-passe são obrigatórios.' });
  }

  const db = loadDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  if (
    normalizedEmail !== db.admin.email.trim().toLowerCase() ||
    !verifySecret(password, db.admin.passwordSalt, db.admin.passwordHash)
  ) {
    return res.status(401).json({ error: 'Credenciais de administrador incorretas.' });
  }

  const token = createSession({ role: 'admin' });

  res.json({
    success: true,
    token,
    user: {
      email: db.admin.email,
      role: 'Administrador Principal',
    },
  });
});

app.get('/api/admin/me', (req, res) => {
  if (getSession(req)?.role !== 'admin') {
    return res.json({ authenticated: false });
  }
  const db = loadDatabase();
  res.json({
    authenticated: true,
    user: {
      email: db.admin.email,
      role: 'Administrador Principal',
    },
  });
});

app.post('/api/admin/change-credentials', requireAdminAuth, (req, res) => {
  const { currentPassword, newPassword, newEmail } = req.body;
  const db = loadDatabase();

  if (
    typeof currentPassword !== 'string' ||
    !verifySecret(currentPassword, db.admin.passwordSalt, db.admin.passwordHash)
  ) {
    return res.status(401).json({ error: 'A palavra-passe atual está incorreta.' });
  }

  if (newPassword !== undefined) {
    if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 256) {
      return res.status(400).json({ error: 'A nova palavra-passe deve conter entre 12 e 256 caracteres.' });
    }
    const password = createSecretHash(newPassword);
    db.admin.passwordSalt = password.salt;
    db.admin.passwordHash = password.hash;
  }

  if (newEmail !== undefined) {
    if (typeof newEmail !== 'string' || newEmail.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      return res.status(400).json({ error: 'Introduza um endereço de email válido.' });
    }
    db.admin.email = newEmail.trim().toLowerCase();
  }

  db.admin.updatedAt = Date.now();
  saveDatabase(db);
  for (const [token, session] of sessions) {
    if (session.role === 'admin') sessions.delete(token);
  }
  const token = createSession({ role: 'admin' });
  res.json({ success: true, token, email: db.admin.email });
});

app.post('/api/admin/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    sessions.delete(authHeader.slice(7));
  }
  res.json({ success: true });
});

app.post('/api/operators/login', async (req, res) => {
  const clientKey = req.ip || 'unknown';
  const failure = pinLoginFailures.get(clientKey);
  if (failure && failure.lockedUntil > Date.now()) {
    return res.status(429).json({ error: 'Demasiadas tentativas. Aguarde 15 minutos antes de tentar novamente.' });
  }
  const { operatorId, pin } = req.body || {};
  if (typeof operatorId !== 'string' || typeof pin !== 'string' || !PIN_PATTERN.test(pin)) {
    return res.status(400).json({ error: 'Selecione o operador e introduza um PIN válido.' });
  }
  let operator;
  try {
    operator = await getStoredOperator(operatorId);
  } catch (error) {
    return respondWithOperatorStoreError(res, error);
  }
  if (!operator?.active) operator = undefined;
  if (
    !operator?.pinSalt ||
    !operator?.pinHash ||
    !verifySecret(pin, operator.pinSalt, operator.pinHash)
  ) {
    const nextCount = (failure?.count || 0) + 1;
    pinLoginFailures.set(clientKey, {
      count: nextCount >= 5 ? 0 : nextCount,
      lockedUntil: nextCount >= 5 ? Date.now() + 15 * 60 * 1000 : 0,
    });
    return res.status(401).json({ error: 'PIN incorreto ou operador sem PIN configurado.' });
  }
  pinLoginFailures.delete(clientKey);
  const token = createSession({
    role: 'operator',
    operatorId: operator.id,
    canStart: Boolean(operator.canStart),
    canClose: Boolean(operator.canClose),
  });
  res.json({ success: true, token, operator: publicOperator(operator) });
});

app.post('/api/operators/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) sessions.delete(authHeader.slice(7));
  res.json({ success: true });
});

// 2. Get complete centralized shared state (Used by all phones)
app.get('/api/state', async (_req, res) => {
  const db = loadDatabase();
  try {
    const operators = await getStoredOperators();
    res.json({
      operators: publicOperators(operators),
      stoppageTypes: db.stoppageTypes,
      activeDowntimes: db.activeDowntimes,
      stoppages: db.stoppages,
      serverTime: Date.now(),
      updatedAt: db.updatedAt,
    });
  } catch (error) {
    return respondWithOperatorStoreError(res, error);
  }
});

// 3. Active Downtimes in Progress (Synchronized across all phones)
app.get('/api/active-stoppages', (_req, res) => {
  const db = loadDatabase();
  res.json(db.activeDowntimes);
});

app.post('/api/active-stoppages', (req, res) => {
  const db = loadDatabase();
  const downtime = req.body;
  if (
    !downtime ||
    typeof downtime.machineId !== 'string' ||
    !/^[A-Z0-9_-]{1,64}$/.test(downtime.machineId) ||
    typeof downtime.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(downtime.id) ||
    !Number.isFinite(downtime.startTimestamp) ||
    downtime.startTimestamp <= 0 ||
    typeof downtime.initiatedBy !== 'string' ||
    downtime.initiatedBy.length > 128
  ) {
    return res.status(400).json({ error: 'Dados da paragem ativa inválidos.' });
  }
  const session = getSession(req);
  const existing = db.activeDowntimes.some((entry) => entry.machineId === downtime.machineId);
  if (
    session?.role !== 'admin' &&
    !(session?.role === 'operator' && (existing ? session.canClose : session.canStart))
  ) {
    return res.status(session ? 403 : 401).json({
      error: existing ? 'É necessária a permissão para atualizar paragens.' : 'É necessária a permissão para iniciar paragens.',
    });
  }
  if (!existing && session?.role === 'operator') {
    const operator = db.operators.find((entry) => entry.id === session.operatorId);
    if (!operator || downtime.initiatedBy !== operator.name) {
      return res.status(403).json({ error: 'O operador autenticado deve corresponder a quem iniciou a paragem.' });
    }
  }

  // Auto-assign shift if not explicitly provided
  if (!downtime.shift) {
    downtime.shift = computeShift(downtime.startTimestamp || Date.now());
  }

  // Remove existing active downtime on this machine if any
  db.activeDowntimes = db.activeDowntimes.filter((d) => d.machineId !== downtime.machineId);
  db.activeDowntimes.push(downtime);
  saveDatabase(db);
  res.status(201).json(downtime);
});

app.delete('/api/active-stoppages/:machineId', requireOperatorPermission('canClose'), (req, res) => {
  const db = loadDatabase();
  const { machineId } = req.params;
  if (!/^[A-Z0-9_-]{1,64}$/.test(machineId)) {
    return res.status(400).json({ error: 'Identificador de máquina inválido.' });
  }
  db.activeDowntimes = db.activeDowntimes.filter((d) => d.machineId !== machineId);
  saveDatabase(db);
  res.json({ success: true, machineId });
});

// 4. Stoppages Historical Records
app.get('/api/stoppages', (_req, res) => {
  const db = loadDatabase();
  res.json(db.stoppages);
});

app.post('/api/stoppages', (req, res) => {
  const db = loadDatabase();
  const record = req.body;
  if (
    !record ||
    typeof record.id !== 'string' ||
    record.id.length < 1 ||
    record.id.length > 128 ||
    typeof record.machineId !== 'string' ||
    !/^[A-Z0-9_-]{1,64}$/.test(record.machineId) ||
    typeof record.closedBy !== 'string' ||
    record.closedBy.length > 128 ||
    typeof record.initiatedBy !== 'string' ||
    record.initiatedBy.length > 128 ||
    !Number.isFinite(record.startTimestamp) ||
    !Number.isFinite(record.endTimestamp) ||
    record.startTimestamp <= 0 ||
    record.endTimestamp < record.startTimestamp
  ) {
    return res.status(400).json({ error: 'Registo inválido.' });
  }
  const isClosingActiveDowntime = db.activeDowntimes.some(
    (downtime) =>
      downtime.machineId === record.machineId &&
      downtime.startTimestamp === record.startTimestamp
  );
  const session = getSession(req);
  if (
    !isClosingActiveDowntime &&
    session?.role !== 'admin' &&
    !(session?.role === 'operator' && session.canClose)
  ) {
    return res.status(session ? 403 : 401).json({
      error: 'É necessária uma sessão de operador autorizado para registar uma paragem manual.',
    });
  }

  // Ensure shift is stored in the database record
  if (!record.shift) {
    record.shift = computeShift(record.startTimestamp, record.startTime);
  }

  // Ensure priority and status default values
  if (!record.priority) {
    record.priority = 'Média';
  }
  if (!record.status) {
    record.status = 'Resolvido';
  }

  // Add record to top of history
  db.stoppages = [record, ...db.stoppages.filter((s) => s.id !== record.id)];
  // Also clear machine from active downtimes if present
  if (record.machineId) {
    db.activeDowntimes = db.activeDowntimes.filter((d) => d.machineId !== record.machineId);
  }
  saveDatabase(db);
  res.status(201).json(record);
});

app.delete('/api/stoppages/:id', (req, res) => {
  const db = loadDatabase();
  const { id } = req.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: 'Identificador inv�lido.' });
  }

  const session = getSession(req);
  const pinHeader = req.headers['x-deletion-pin'];
  const pinBody = req.body?.pin;
  const providedPin = (pinHeader || pinBody || '').toString().trim();
  const operatorPinValid = PIN_PATTERN.test(providedPin) && db.operators.some((operator) =>
    operator.active &&
    operator.canClose &&
    operator.pinSalt &&
    operator.pinHash &&
    verifySecret(providedPin, operator.pinSalt, operator.pinHash)
  );
  const isAuthorized = session?.role === 'admin' ||
    (session?.role === 'operator' && session.canClose) ||
    operatorPinValid;
  if (!isAuthorized) {
    return res.status(401).json({ error: 'PIN de operador autorizado incorreto.' });
  }

  const initialCount = db.stoppages.length;
  db.stoppages = db.stoppages.filter((record) => record.id !== id);
  saveDatabase(db);
  res.json({ success: true, id, deletedCount: initialCount - db.stoppages.length });
});
// 5. Migration & CSV Batch Import (Protected by requireAdminAuth)
app.post('/api/migrate-local', requireAdminAuth, (req, res) => {
  const db = loadDatabase();
  const { localRecords } = req.body || {};
  if (
    !Array.isArray(localRecords) ||
    localRecords.length > 10000 ||
    localRecords.some((record) =>
      !record ||
      typeof record.id !== 'string' ||
      record.id.length < 1 ||
      record.id.length > 128 ||
      typeof record.machineId !== 'string' ||
      !/^[A-Z0-9_-]{1,64}$/.test(record.machineId) ||
      !Number.isFinite(record.startTimestamp)
    )
  ) {
    return res.status(400).json({ error: 'localRecords deve conter no máximo 10 000 registos válidos.' });
  }

  const existingIds = new Set(db.stoppages.map((s) => s.id));
  let addedCount = 0;

  localRecords.forEach((rec) => {
    if (rec && rec.id && !existingIds.has(rec.id)) {
      if (!rec.shift) {
        rec.shift = computeShift(rec.startTimestamp, rec.startTime);
      }
      if (!rec.priority) {
        rec.priority = 'Média';
      }
      if (!rec.status) {
        rec.status = 'Resolvido';
      }
      db.stoppages.push(rec);
      existingIds.add(rec.id);
      addedCount++;
    }
  });

  db.stoppages.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  saveDatabase(db);
  res.json({ success: true, addedCount, total: db.stoppages.length });
});

app.post('/api/stoppages/batch-import', requireAdminAuth, (req, res) => {
  const db = loadDatabase();
  const { records, replaceExisting = false } = req.body || {};
  if (
    !Array.isArray(records) ||
    records.length > 10000 ||
    typeof replaceExisting !== 'boolean' ||
    records.some((record) =>
      !record ||
      typeof record.id !== 'string' ||
      record.id.length < 1 ||
      record.id.length > 128 ||
      typeof record.machineId !== 'string' ||
      !/^[A-Z0-9_-]{1,64}$/.test(record.machineId) ||
      !Number.isFinite(record.startTimestamp)
    )
  ) {
    return res.status(400).json({ error: 'records deve conter no máximo 10 000 registos válidos.' });
  }

  // Ensure all imported records have shift, priority, and status calculated if missing
  const sanitized = records.map((rec) => {
    const updated = { ...rec };
    if (!updated.shift) {
      updated.shift = computeShift(updated.startTimestamp, updated.startTime);
    }
    if (!updated.priority) {
      updated.priority = 'Média';
    }
    if (!updated.status) {
      updated.status = 'Resolvido';
    }
    return updated;
  });

  if (replaceExisting) {
    db.stoppages = sanitized;
    saveDatabase(db);
    return res.json({
      success: true,
      importedCount: sanitized.length,
      duplicatesSkipped: 0,
      totalRecords: db.stoppages.length,
    });
  }

  const existingKeys = new Set(
    db.stoppages.map((s) => `${s.machineId}_${s.date}_${s.startTime}`)
  );

  let importedCount = 0;
  let duplicatesSkipped = 0;

  sanitized.forEach((rec) => {
    const key = `${rec.machineId}_${rec.date}_${rec.startTime}`;
    if (!existingKeys.has(key)) {
      db.stoppages.push(rec);
      existingKeys.add(key);
      importedCount++;
    } else {
      duplicatesSkipped++;
    }
  });

  db.stoppages.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  saveDatabase(db);

  res.json({
    success: true,
    importedCount,
    duplicatesSkipped,
    totalRecords: db.stoppages.length,
  });
});

// 6. Operators Management (Protected by requireAdminAuth)
app.get('/api/operators', async (_req, res) => {
  try {
    res.json(publicOperators(await getStoredOperators()));
  } catch (error) {
    return respondWithOperatorStoreError(res, error);
  }
});

app.post('/api/operators', requireAdminAuth, async (req, res) => {
  const { name, role, canStart, canClose, pin } = req.body || {};
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 128 ||
    typeof pin !== 'string' ||
    !PIN_PATTERN.test(pin) ||
    typeof canStart !== 'boolean' ||
    typeof canClose !== 'boolean'
  ) {
    return res.status(400).json({ error: 'Nome, PIN de 4 a 8 dígitos e permissões válidas são obrigatórios.' });
  }
  try {
    const operators = await getStoredOperators();
    if (operators.some((operator) =>
      operator.pinSalt &&
      operator.pinHash &&
      verifySecret(pin, operator.pinSalt, operator.pinHash)
    )) {
      return res.status(409).json({ error: 'Este PIN já está atribuído a outro operador.' });
    }
    if (operators.some((operator) =>
      typeof operator.name === 'string' &&
      operator.name.trim().toLowerCase() === name.trim().toLowerCase()
    )) {
      return res.status(409).json({ error: 'Já existe um operador com esse nome.' });
    }

    const pinCredential = createSecretHash(pin);
    const newOp = {
      id: `op-${crypto.randomUUID()}`,
      name: name.trim(),
      role: typeof role === 'string' && role.trim() ? role.trim().slice(0, 128) : 'Operador',
      canStart,
      canClose,
      active: true,
      pinSalt: pinCredential.salt,
      pinHash: pinCredential.hash,
    };

    await createStoredOperator(newOp);
    res.status(201).json(publicOperator(newOp));
  } catch (error) {
    return respondWithOperatorStoreError(res, error);
  }
});

app.put('/api/operators/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: 'Identificador de operador inválido.' });
  }
  const { name, role, canStart, canClose, active, pin } = req.body || {};

  try {
    const operator = await getStoredOperator(id);
    if (!operator) {
      return res.status(404).json({ error: 'Operador não encontrado.' });
    }
    const operators = await getStoredOperators();
    const updatedOperator = { ...operator };

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 128) {
        return res.status(400).json({ error: 'Nome de operador inválido.' });
      }
      if (operators.some((entry) =>
        entry.id !== id &&
        typeof entry.name === 'string' &&
        entry.name.trim().toLowerCase() === name.trim().toLowerCase()
      )) {
        return res.status(409).json({ error: 'Já existe um operador com esse nome.' });
      }
      updatedOperator.name = name.trim();
    }
    if (role !== undefined) {
      if (typeof role !== 'string' || role.trim().length > 128) {
        return res.status(400).json({ error: 'Função de operador inválida.' });
      }
      updatedOperator.role = role.trim() || 'Operador';
    }
    if (canStart !== undefined) {
      if (typeof canStart !== 'boolean') return res.status(400).json({ error: 'Permissão inválida.' });
      updatedOperator.canStart = canStart;
    }
    if (canClose !== undefined) {
      if (typeof canClose !== 'boolean') return res.status(400).json({ error: 'Permissão inválida.' });
      updatedOperator.canClose = canClose;
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') return res.status(400).json({ error: 'Estado inválido.' });
      updatedOperator.active = active;
    }
    if (pin !== undefined) {
      if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) {
        return res.status(400).json({ error: 'O PIN deve conter entre 4 e 8 dígitos.' });
      }
      if (operators.some((entry) =>
        entry.id !== id &&
        entry.pinSalt &&
        entry.pinHash &&
        verifySecret(pin, entry.pinSalt, entry.pinHash)
      )) {
        return res.status(409).json({ error: 'Este PIN já está atribuído a outro operador.' });
      }
      const pinCredential = createSecretHash(pin);
      updatedOperator.pinSalt = pinCredential.salt;
      updatedOperator.pinHash = pinCredential.hash;
    }

    if (!(await updateStoredOperator({ ...updatedOperator, id }))) {
      return res.status(404).json({ error: 'Operador não encontrado.' });
    }
    for (const [token, session] of sessions) {
      if (session.operatorId === id) sessions.delete(token);
    }
    res.json(publicOperator(updatedOperator));
  } catch (error) {
    return respondWithOperatorStoreError(res, error);
  }
});

app.delete('/api/operators/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: 'Identificador de operador inválido.' });
  }
  try {
    await deleteStoredOperator(id);
  } catch (error) {
    return respondWithOperatorStoreError(res, error);
  }
  for (const [token, session] of sessions) {
    if (session.operatorId === id) sessions.delete(token);
  }
  res.json({ success: true, id });
});

// 7. Stoppage Types Management (Protected by requireAdminAuth)
app.get('/api/stoppage-types', (_req, res) => {
  const db = loadDatabase();
  res.json(db.stoppageTypes);
});

app.post('/api/stoppage-types', requireAdminAuth, (req, res) => {
  const db = loadDatabase();
  const { name, description, color } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 128) {
    return res.status(400).json({ error: 'Nome do tipo de avaria é obrigatório.' });
  }

  const newType = {
    id: `st-${crypto.randomUUID()}`,
    name: name.trim(),
    description: typeof description === 'string' ? description.trim().slice(0, 500) : '',
    color: typeof color === 'string' && /^[a-z-]{1,32}$/.test(color) ? color : 'rose',
    active: true,
  };

  db.stoppageTypes.push(newType);
  saveDatabase(db);
  res.status(201).json(newType);
});

app.put('/api/stoppage-types/:id', requireAdminAuth, (req, res) => {
  const db = loadDatabase();
  const { id } = req.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: 'Identificador de tipo inválido.' });
  }
  const { name, description, color, active } = req.body || {};

  const idx = db.stoppageTypes.findIndex((st) => st.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Tipo de avaria não encontrado.' });
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 128) {
      return res.status(400).json({ error: 'Nome do tipo de avaria inválido.' });
    }
    db.stoppageTypes[idx].name = name.trim();
  }
  if (description !== undefined) {
    if (typeof description !== 'string' || description.length > 500) {
      return res.status(400).json({ error: 'Descrição do tipo de avaria inválida.' });
    }
    db.stoppageTypes[idx].description = description.trim();
  }
  if (color !== undefined) {
    if (typeof color !== 'string' || !/^[a-z-]{1,32}$/.test(color)) {
      return res.status(400).json({ error: 'Cor do tipo de avaria inválida.' });
    }
    db.stoppageTypes[idx].color = color;
  }
  if (active !== undefined) {
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'Estado inválido.' });
    db.stoppageTypes[idx].active = active;
  }

  saveDatabase(db);
  res.json(db.stoppageTypes[idx]);
});

app.delete('/api/stoppage-types/:id', requireAdminAuth, (req, res) => {
  const db = loadDatabase();
  const { id } = req.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: 'Identificador de tipo inválido.' });
  }
  db.stoppageTypes = db.stoppageTypes.filter((st) => st.id !== id);
  saveDatabase(db);
  res.json({ success: true, id });
});

// 8. Reset to defaults (Protected by requireAdminAuth)
app.post('/api/reset-defaults', requireAdminAuth, async (_req, res) => {
  try {
    await deleteStoredOperators();
  } catch (error) {
    return respondWithOperatorStoreError(res, error);
  }
  const db = loadDatabase();
  db.operators = DEFAULT_OPERATORS;
  db.stoppageTypes = DEFAULT_STOPPAGE_TYPES;
  db.activeDowntimes = [];
  db.stoppages = DEFAULT_STOPPAGES_SEED;
  db.updatedAt = Date.now();
  saveDatabase(db);
  for (const [token, session] of sessions) {
    if (session.role === 'operator') sessions.delete(token);
  }
  res.json({ success: true });
});

// Development vs Production setup
async function startServer() {
  loadDatabase();
  await getStoredOperators();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ManuTrack Cloud Server online at http://0.0.0.0:${PORT}`);
  });
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Request failed:', err);
  if (res.headersSent) return;
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({
    error: status === 500 ? 'Erro interno ao processar o pedido. Os dados não foram confirmados.' : 'Pedido inválido.',
  });
});

startServer().catch((err) => {
  console.error('Failed to start server:', err instanceof Error ? err.message : 'Unknown startup error');
  process.exitCode = 1;
});
