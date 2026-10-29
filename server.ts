import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as supabaseStore from './server/supabaseStore';
import * as loginThrottle from './server/loginThrottle';
import {
  sanitizeActiveDowntime,
  sanitizeStoppageRecord,
  type SanitizedStoppage,
} from './server/stoppageSanitizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

/**
 * Número de proxies à frente da aplicação, para que req.ip seja o IP real do cliente
 * (e não o do proxy). Por defeito 1: Cloud Run / AI Studio colocam um proxy da Google à frente.
 * Pode ser alterado com a variável TRUST_PROXY: um número (saltos), "false" (sem proxy, ex.:
 * execução local direta) ou uma lista de IPs/sub-redes. Evite "true": permitiria falsificar o IP.
 */
function parseTrustProxy(value: string | undefined): boolean | number | string {
  const raw = value?.trim();
  if (!raw) return 1;
  const lower = raw.toLowerCase();
  if (lower === 'false' || lower === '0') return false;
  if (lower === 'true') return true;
  if (/^\d+$/.test(lower)) return Number(lower);
  return raw;
}
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

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
  admin: {
    email: string;
    passwordSalt: string;
    passwordHash: string;
    passwordAlgorithm: 'scrypt' | 'pbkdf2-sha512-v1';
    updatedAt: number;
  };
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

// Limites de tentativas (janela e bloqueio de 15 minutos, ver server/loginThrottle.ts).
const ADMIN_LOGIN_LIMIT_PER_IP = 10;
const ADMIN_LOGIN_LIMIT_PER_EMAIL = 10;
const OPERATOR_PIN_LIMIT_PER_OPERATOR = 5;
const OPERATOR_PIN_LIMIT_PER_IP = 30; // folga para vários tablets atrás do mesmo IP
const DELETE_PIN_LIMIT_PER_IP = 5;
const DELETE_PIN_LIMIT_GLOBAL = 40;

function rejectLocked(res: express.Response, lockedUntil: number, subject?: string) {
  const { message, retryAfterSeconds } = loginThrottle.lockedResponse(lockedUntil, subject);
  res.set('Retry-After', String(retryAfterSeconds));
  return res.status(429).json({ error: message });
}

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

function verifyAdminSecret(secret: string, credentials: supabaseStore.AdminCredentials): boolean {
  if (credentials.passwordAlgorithm !== 'pbkdf2-sha512-v1') {
    return verifySecret(secret, credentials.passwordSalt, credentials.passwordHash);
  }
  if (secret.length > 256 || !/^[a-f0-9]{32}$/i.test(credentials.passwordSalt) ||
      !/^[a-f0-9]{128}$/i.test(credentials.passwordHash)) return false;
  const salt = Buffer.from(credentials.passwordSalt, 'hex');
  const actual = crypto.pbkdf2Sync(secret, salt, 310000, 64, 'sha512');
  const expected = Buffer.from(credentials.passwordHash, 'hex');
  return crypto.timingSafeEqual(actual, expected);
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

function respondWithStoreError(res: express.Response, error: unknown) {
  console.error('Supabase persistence error:', error);
  return res.status(503).json({
    error: 'Não foi possível aceder à base de dados central. Verifique a ligação ao Supabase e tente novamente.',
  });
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

function loadLegacyDatabase(): DatabaseSchema {
  const parsed = fs.existsSync(DB_FILE)
    ? JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
    : {};
  let admin = parsed.admin;

  if (ADMIN_EMAIL || ADMIN_PASSWORD) {
    if (
      !ADMIN_EMAIL ||
      !ADMIN_PASSWORD ||
      ADMIN_EMAIL.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL) ||
      ADMIN_PASSWORD.length < 12 ||
      ADMIN_PASSWORD.length > 256
    ) {
      throw new Error('Configure ADMIN_EMAIL válido e ADMIN_PASSWORD entre 12 e 256 caracteres nos segredos do servidor.');
    }
    const password = createSecretHash(ADMIN_PASSWORD);
    admin = {
      email: ADMIN_EMAIL,
      passwordSalt: password.salt,
      passwordHash: password.hash,
      passwordAlgorithm: 'scrypt',
      updatedAt: Date.now(),
    };
  } else if (!admin?.passwordSalt || !admin?.passwordHash) {
    const legacyPassword = typeof admin?.password === 'string' ? admin.password : undefined;
    const legacyEmail = typeof admin?.email === 'string' ? admin.email : undefined;
    if (
      !legacyEmail ||
      legacyEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(legacyEmail) ||
      !legacyPassword ||
      legacyPassword.length < 12 ||
      legacyPassword.length > 256
    ) {
      throw new Error('Configure ADMIN_EMAIL e ADMIN_PASSWORD seguros nos segredos do servidor antes do primeiro acesso.');
    }
    const password = createSecretHash(legacyPassword);
    admin = {
      email: legacyEmail.trim().toLowerCase(),
      passwordSalt: password.salt,
      passwordHash: password.hash,
      passwordAlgorithm: 'scrypt',
      updatedAt: Date.now(),
    };
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
    passwordAlgorithm: admin.passwordAlgorithm === 'pbkdf2-sha512-v1'
      ? 'pbkdf2-sha512-v1'
      : 'scrypt',
    updatedAt: Number.isFinite(admin.updatedAt) ? admin.updatedAt : Date.now(),
  };

  return {
    admin,
    operators: Array.isArray(parsed.operators) ? parsed.operators : [],
    stoppageTypes: Array.isArray(parsed.stoppageTypes) ? parsed.stoppageTypes : DEFAULT_STOPPAGE_TYPES,
    activeDowntimes: Array.isArray(parsed.activeDowntimes) ? parsed.activeDowntimes : [],
    stoppages: Array.isArray(parsed.stoppages) ? parsed.stoppages : [],
    updatedAt: parsed.updatedAt || Date.now(),
  };
}

function validAdminCredentials(value: unknown): value is supabaseStore.AdminCredentials {
  const credentials = value as Partial<supabaseStore.AdminCredentials> | null;
  return Boolean(
    credentials &&
    typeof credentials.email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email) &&
    typeof credentials.passwordSalt === 'string' &&
    /^[a-f0-9]{32}$/i.test(credentials.passwordSalt) &&
    typeof credentials.passwordHash === 'string' &&
    /^[a-f0-9]{128}$/i.test(credentials.passwordHash) &&
    (credentials.passwordAlgorithm === undefined ||
      credentials.passwordAlgorithm === 'scrypt' ||
      credentials.passwordAlgorithm === 'pbkdf2-sha512-v1') &&
    Number.isFinite(credentials.updatedAt)
  );
}

async function getOrInitializeAdminCredentials(): Promise<supabaseStore.AdminCredentials> {
  const stored = await supabaseStore.getAdminCredentials();
  if (validAdminCredentials(stored)) return stored;
  const legacy = loadLegacyDatabase().admin;
  await supabaseStore.saveAdminCredentials(legacy);
  return legacy;
}

let storageInitialization: Promise<void> | undefined;

async function initializeSupabaseStorage(): Promise<void> {
  if (!storageInitialization) {
    storageInitialization = (async () => {
      const marker = await supabaseStore.getSetting<{ complete: boolean }>('legacy_import_v1');
      if (marker?.complete) return;

      const legacy = loadLegacyDatabase();
      if (!validAdminCredentials(await supabaseStore.getAdminCredentials())) {
        await supabaseStore.saveAdminCredentials(legacy.admin);
      }

      const stoppageTypes = await supabaseStore.getStoppageTypes();
      if (!stoppageTypes.length) {
        await supabaseStore.importStoppageTypes(legacy.stoppageTypes.length ? legacy.stoppageTypes : DEFAULT_STOPPAGE_TYPES);
      }

      if (!(await supabaseStore.getStoppages()).length && legacy.stoppages.length) {
        await supabaseStore.batchImportStoppages(legacy.stoppages, false);
      }
      if (!(await supabaseStore.getActiveDowntimes()).length && legacy.activeDowntimes.length) {
        await supabaseStore.importActiveDowntimesIfAbsent(legacy.activeDowntimes);
      }

      await supabaseStore.setSetting('legacy_import_v1', {
        complete: true,
        completedAt: Date.now(),
      });
    })().catch((error) => {
      storageInitialization = undefined;
      throw error;
    });
  }
  await storageInitialization;
}

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createSession(session: Omit<Session, 'expiresAt'>): Promise<string> {
  const token = crypto.randomUUID();
  await supabaseStore.createSession(tokenHash(token), {
    ...session,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  });
  return token;
}

async function getSession(req: express.Request): Promise<Session | undefined> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7);
  const session = await supabaseStore.getSession(tokenHash(token));
  if (!session || session.expiresAt <= Date.now()) {
    if (session) await supabaseStore.deleteSession(tokenHash(token));
    return undefined;
  }
  return session;
}

function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  void getSession(req).then((session) => {
    if (session?.role !== 'admin') {
      res.status(401).json({ error: 'É necessária uma sessão válida de administrador.' });
      return;
    }
    next();
  }).catch((error) => respondWithStoreError(res, error));
}

function requireOperatorPermission(permission: 'canStart' | 'canClose') {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    void getSession(req).then((session) => {
      if (session?.role === 'admin' || (session?.role === 'operator' && session[permission])) {
        next();
        return;
      }
      res.status(session ? 403 : 401).json({
        error: session ? 'O operador não tem permissão para esta ação.' : 'Autentique-se com o PIN de um operador autorizado.',
      });
    }).catch((error) => respondWithStoreError(res, error));
  };
}

app.use('/api', (req, res, next) => {
  void initializeSupabaseStorage().then(() => next()).catch((error) => respondWithStoreError(res, error));
});
// REST API ROUTES

// 1. Admin Authentication Routes
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 256) {
    return res.status(400).json({ error: 'Email e palavra-passe são obrigatórios.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const throttleKeys = [
    `admin:ip:${req.ip || 'unknown'}`,
    `admin:email:${loginThrottle.hashKeyPart(normalizedEmail)}`,
  ];

  try {
    const lockedUntil = await loginThrottle.getLockedUntil(throttleKeys);
    if (lockedUntil > Date.now()) {
      return rejectLocked(res, lockedUntil, 'tentativas de início de sessão');
    }

    const admin = await getOrInitializeAdminCredentials();
    if (
      normalizedEmail !== admin.email.trim().toLowerCase() ||
      !verifyAdminSecret(password, admin)
    ) {
      await loginThrottle.registerFailure([
        { key: throttleKeys[0], limit: ADMIN_LOGIN_LIMIT_PER_IP },
        { key: throttleKeys[1], limit: ADMIN_LOGIN_LIMIT_PER_EMAIL },
      ]);
      return res.status(401).json({ error: 'Credenciais de administrador incorretas.' });
    }

    await loginThrottle.clearFailures(throttleKeys);
    const token = await createSession({ role: 'admin' });
    res.json({
      success: true,
      token,
      user: { email: admin.email, role: 'Administrador Principal' },
    });
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.get('/api/admin/me', async (req, res) => {
  try {
    if ((await getSession(req))?.role !== 'admin') {
      return res.json({ authenticated: false });
    }
    const admin = await getOrInitializeAdminCredentials();
    res.json({
      authenticated: true,
      user: { email: admin.email, role: 'Administrador Principal' },
    });
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.post('/api/admin/change-credentials', requireAdminAuth, async (req, res) => {
  const { currentPassword, newPassword, newEmail } = req.body;
  try {
    const admin = await getOrInitializeAdminCredentials();
    if (
      typeof currentPassword !== 'string' ||
      !verifyAdminSecret(currentPassword, admin)
    ) {
      return res.status(401).json({ error: 'A palavra-passe atual está incorreta.' });
    }

    if (newPassword !== undefined) {
      if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 256) {
        return res.status(400).json({ error: 'A nova palavra-passe deve conter entre 12 e 256 caracteres.' });
      }
      const password = createSecretHash(newPassword);
      admin.passwordSalt = password.salt;
      admin.passwordHash = password.hash;
      admin.passwordAlgorithm = 'scrypt';
    }

    if (newEmail !== undefined) {
      if (typeof newEmail !== 'string' || newEmail.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
        return res.status(400).json({ error: 'Introduza um endereço de email válido.' });
      }
      admin.email = newEmail.trim().toLowerCase();
    }

    admin.updatedAt = Date.now();
    await supabaseStore.saveAdminCredentials(admin);
    await supabaseStore.deleteSessionsForRole('admin');
    const token = await createSession({ role: 'admin' });
    res.json({ success: true, token, email: admin.email });
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.post('/api/admin/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  try {
    if (authHeader?.startsWith('Bearer ')) {
      await supabaseStore.deleteSession(tokenHash(authHeader.slice(7)));
    }
    res.json({ success: true });
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.post('/api/operators/login', async (req, res) => {
  const { operatorId, pin } = req.body || {};
  if (
    typeof operatorId !== 'string' ||
    operatorId.length < 1 ||
    operatorId.length > 128 ||
    typeof pin !== 'string' ||
    !PIN_PATTERN.test(pin)
  ) {
    return res.status(400).json({ error: 'Selecione o operador e introduza um PIN válido.' });
  }

  // O bloqueio é por operador (trava a adivinha do PIN de uma pessoa, venha de onde vier)
  // e por IP, com mais folga porque vários tablets podem partilhar o mesmo IP.
  const throttleKeys = [
    `operator:id:${loginThrottle.hashKeyPart(operatorId)}`,
    `operator:ip:${req.ip || 'unknown'}`,
  ];

  let operator;
  try {
    const lockedUntil = await loginThrottle.getLockedUntil(throttleKeys);
    if (lockedUntil > Date.now()) {
      return rejectLocked(res, lockedUntil);
    }
    operator = await supabaseStore.getOperator(operatorId);
  } catch (error) {
    return respondWithStoreError(res, error);
  }
  if (!operator?.active) operator = undefined;
  if (
    !operator?.pinSalt ||
    !operator?.pinHash ||
    !verifySecret(pin, operator.pinSalt, operator.pinHash)
  ) {
    try {
      const lockedUntil = await loginThrottle.registerFailure([
        { key: throttleKeys[0], limit: OPERATOR_PIN_LIMIT_PER_OPERATOR },
        { key: throttleKeys[1], limit: OPERATOR_PIN_LIMIT_PER_IP },
      ]);
      if (lockedUntil > Date.now()) {
        return rejectLocked(res, lockedUntil);
      }
    } catch (error) {
      console.error('Failed to register PIN failure:', error);
    }
    return res.status(401).json({ error: 'PIN incorreto ou operador sem PIN configurado.' });
  }
  await loginThrottle.clearFailures([throttleKeys[0]]);
  try {
    const token = await createSession({
      role: 'operator',
      operatorId: operator.id,
      canStart: Boolean(operator.canStart),
      canClose: Boolean(operator.canClose),
    });
    res.json({ success: true, token, operator: publicOperator(operator) });
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.post('/api/operators/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  try {
    if (authHeader?.startsWith('Bearer ')) {
      await supabaseStore.deleteSession(tokenHash(authHeader.slice(7)));
    }
    res.json({ success: true });
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

// 2. Complete application state shared by every workstation.
app.get('/api/state', async (_req, res) => {
  try {
    const [operators, stoppageTypes, activeDowntimes, stoppages] = await Promise.all([
      supabaseStore.getOperators(),
      supabaseStore.getStoppageTypes(),
      supabaseStore.getActiveDowntimes(),
      supabaseStore.getStoppages(),
    ]);
    res.json({
      operators: publicOperators(operators),
      stoppageTypes,
      activeDowntimes,
      stoppages,
      serverTime: Date.now(),
      updatedAt: Date.now(),
    });
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

// 3. Active stoppages are keyed by a normalized machine id and updated transactionally.
app.get('/api/active-stoppages', async (_req, res) => {
  try {
    res.json(await supabaseStore.getActiveDowntimes());
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.post('/api/active-stoppages', async (req, res) => {
  const incoming = req.body;
  const machineId = typeof incoming?.machineId === 'string'
    ? incoming.machineId.trim().replace(/\s+/g, '').toUpperCase()
    : '';
  if (
    !incoming ||
    !/^[A-Z0-9_-]{1,64}$/.test(machineId) ||
    typeof incoming.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(incoming.id) ||
    !Number.isFinite(incoming.startTimestamp) ||
    incoming.startTimestamp <= 0 ||
    typeof incoming.initiatedBy !== 'string' ||
    incoming.initiatedBy.length > 128
  ) {
    return res.status(400).json({ error: 'Dados da paragem ativa inválidos.' });
  }

  try {
    const session = await getSession(req);
    const existing = await supabaseStore.getActiveDowntime(machineId);
    if (
      session?.role !== 'admin' &&
      !(session?.role === 'operator' && (existing ? session.canClose : session.canStart))
    ) {
      return res.status(session ? 403 : 401).json({
        error: existing ? 'É necessária a permissão para atualizar paragens.' : 'É necessária a permissão para iniciar paragens.',
      });
    }
    if (!existing && session?.role === 'operator') {
      const operator = await supabaseStore.getOperator(session.operatorId || '');
      if (!operator || incoming.initiatedBy !== operator.name) {
        return res.status(403).json({ error: 'O operador autenticado deve corresponder a quem iniciou a paragem.' });
      }
    }

    // Só os campos conhecidos são guardados (ver server/stoppageSanitizer.ts).
    const cleanedDowntime = sanitizeActiveDowntime(incoming, machineId);
    const downtime = {
      ...cleanedDowntime,
      shift: cleanedDowntime.shift || computeShift(incoming.startTimestamp),
    };
    const result = await supabaseStore.saveActiveDowntime(
      downtime,
      session?.role === 'admin' || Boolean(existing),
      Boolean(existing) && session?.role !== 'admin',
      typeof existing?.startTimestamp === 'number' ? existing.startTimestamp : undefined
    );
    if (!result?.success) {
      return res.status(409).json({ error: result?.error || 'A paragem ativa foi alterada noutro posto.' });
    }
    res.status(201).json(result.data || downtime);
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.delete('/api/active-stoppages/:machineId', requireOperatorPermission('canClose'), async (req, res) => {
  const machineId = req.params.machineId.trim().replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9_-]{1,64}$/.test(machineId)) {
    return res.status(400).json({ error: 'Identificador de máquina inválido.' });
  }
  try {
    await supabaseStore.deleteActiveDowntime(machineId);
    res.json({ success: true, machineId });
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

// 4. Historical stoppage records.
app.get('/api/stoppages', async (_req, res) => {
  try {
    res.json(await supabaseStore.getStoppages());
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.post('/api/stoppages', async (req, res) => {
  const incoming = req.body;
  const machineId = typeof incoming?.machineId === 'string'
    ? incoming.machineId.trim().replace(/\s+/g, '').toUpperCase()
    : '';
  if (
    !incoming ||
    typeof incoming.id !== 'string' ||
    incoming.id.length < 1 ||
    incoming.id.length > 128 ||
    !/^[A-Z0-9_-]{1,64}$/.test(machineId) ||
    typeof incoming.closedBy !== 'string' ||
    incoming.closedBy.length > 128 ||
    typeof incoming.initiatedBy !== 'string' ||
    incoming.initiatedBy.length > 128 ||
    typeof incoming.date !== 'string' ||
    incoming.date.length < 1 ||
    incoming.date.length > 32 ||
    typeof incoming.startTime !== 'string' ||
    incoming.startTime.length < 1 ||
    incoming.startTime.length > 32 ||
    !Number.isFinite(incoming.startTimestamp) ||
    !Number.isFinite(incoming.endTimestamp) ||
    incoming.startTimestamp <= 0 ||
    incoming.endTimestamp < incoming.startTimestamp
  ) {
    return res.status(400).json({ error: 'Registo inválido.' });
  }

  try {
    const activeDowntime = await supabaseStore.getActiveDowntime(machineId);
    const isClosingActiveDowntime = activeDowntime?.startTimestamp === incoming.startTimestamp;
    const session = await getSession(req);
    if (
      !isClosingActiveDowntime &&
      session?.role !== 'admin' &&
      !(session?.role === 'operator' && session.canClose)
    ) {
      return res.status(session ? 403 : 401).json({
        error: 'É necessária uma sessão de operador autorizado para registar uma paragem manual.',
      });
    }

    // Só os campos conhecidos são guardados (ver server/stoppageSanitizer.ts).
    const sanitized = sanitizeStoppageRecord(incoming);
    if (sanitized.ok === false) {
      return res.status(400).json({ error: sanitized.error });
    }
    const record: SanitizedStoppage = {
      ...sanitized.record,
      shift: sanitized.record.shift || computeShift(incoming.startTimestamp, incoming.startTime),
    };
    const result = await supabaseStore.saveStoppage(record, Boolean(isClosingActiveDowntime));
    if (!result?.success) {
      return res.status(409).json({
        error: typeof result?.error === 'string' ? result.error : 'A paragem ativa foi alterada noutro posto.',
      });
    }
    res.status(201).json(result.data || record);
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.delete('/api/stoppages/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: 'Identificador inválido.' });
  }

  const pinHeader = req.headers['x-deletion-pin'];
  const pinBody = req.body?.pin;
  const providedPin = (pinHeader || pinBody || '').toString().trim();
  // O PIN é testado contra todos os operadores com permissão, por isso limita-se por IP
  // e globalmente (este último cobre quem mude de IP a cada tentativa).
  const deleteThrottleKeys = [`delete:ip:${req.ip || 'unknown'}`, 'delete:global'];
  try {
    const session = await getSession(req);
    const hasSessionAuthorization = session?.role === 'admin' ||
      (session?.role === 'operator' && Boolean(session.canClose));

    if (!hasSessionAuthorization && providedPin) {
      const lockedUntil = await loginThrottle.getLockedUntil(deleteThrottleKeys);
      if (lockedUntil > Date.now()) {
        return rejectLocked(res, lockedUntil);
      }
    }

    const operators = hasSessionAuthorization ? [] : await supabaseStore.getOperators();
    const operatorPinValid = PIN_PATTERN.test(providedPin) && operators.some((operator) =>
      operator.active &&
      operator.canClose &&
      operator.pinSalt &&
      operator.pinHash &&
      verifySecret(providedPin, operator.pinSalt, operator.pinHash)
    );
    const isAuthorized = hasSessionAuthorization || operatorPinValid;
    if (!isAuthorized) {
      // Só conta como tentativa quando foi realmente indicado um PIN.
      if (providedPin) {
        const lockedUntil = await loginThrottle.registerFailure([
          { key: deleteThrottleKeys[0], limit: DELETE_PIN_LIMIT_PER_IP },
          { key: deleteThrottleKeys[1], limit: DELETE_PIN_LIMIT_GLOBAL },
        ]);
        if (lockedUntil > Date.now()) {
          return rejectLocked(res, lockedUntil);
        }
      }
      return res.status(401).json({ error: 'PIN de operador autorizado incorreto.' });
    }
    if (providedPin && !hasSessionAuthorization) {
      await loginThrottle.clearFailures([deleteThrottleKeys[0]]);
    }

    const deletedCount = await supabaseStore.deleteStoppage(id);
    res.json({
      success: true,
      id,
      deletedCount,
    });
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

/** Limpa uma lista de registos importados (CSV / migração); indica qual o registo inválido, se algum. */
function sanitizeImportedRecords(
  records: unknown[]
): { ok: true; records: Record<string, unknown>[] } | { ok: false; error: string } {
  const cleaned: Record<string, unknown>[] = [];
  for (let index = 0; index < records.length; index++) {
    const result = sanitizeStoppageRecord(records[index], { requireDateAndTime: false });
    if (result.ok === false) {
      return { ok: false, error: `Registo ${index + 1}: ${result.error}` };
    }
    const record = result.record;
    cleaned.push({
      ...record,
      shift: record.shift || computeShift(record.startTimestamp, record.startTime),
    });
  }
  return { ok: true, records: cleaned };
}

// 5. Device migration and CSV imports write directly to the shared database.
app.post('/api/migrate-local', requireAdminAuth, async (req, res) => {
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
      !/^[A-Z0-9_-]{1,64}$/i.test(record.machineId.trim().replace(/\s+/g, '')) ||
      !Number.isFinite(record.startTimestamp)
    )
  ) {
    return res.status(400).json({ error: 'localRecords deve conter no máximo 10 000 registos válidos.' });
  }
  try {
    const sanitized = sanitizeImportedRecords(localRecords);
    if (sanitized.ok === false) {
      return res.status(400).json({ error: sanitized.error });
    }
    const result = await supabaseStore.batchImportStoppages(sanitized.records, false);
    res.json({
      success: true,
      addedCount: result?.importedCount || 0,
      total: result?.totalRecords || 0,
    });
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.post('/api/stoppages/batch-import', requireAdminAuth, async (req, res) => {
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
      !/^[A-Z0-9_-]{1,64}$/i.test(record.machineId.trim().replace(/\s+/g, '')) ||
      !Number.isFinite(record.startTimestamp)
    )
  ) {
    return res.status(400).json({ error: 'records deve conter no máximo 10 000 registos válidos.' });
  }

  const sanitized = sanitizeImportedRecords(records);
  if (sanitized.ok === false) {
    return res.status(400).json({ error: sanitized.error });
  }
  try {
    const result = await supabaseStore.batchImportStoppages(sanitized.records, replaceExisting);
    res.json({
      success: true,
      importedCount: result.importedCount,
      duplicatesSkipped: result.duplicatesSkipped,
      totalRecords: result.totalRecords,
    });
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

// 6. Operators Management (Protected by requireAdminAuth)
app.get('/api/operators', async (_req, res) => {
  try {
    res.json(publicOperators(await supabaseStore.getOperators()));
  } catch (error) {
    return respondWithStoreError(res, error);
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
    const operators = await supabaseStore.getOperators();
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

    await supabaseStore.createOperator(newOp);
    res.status(201).json(publicOperator(newOp));
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.put('/api/operators/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: 'Identificador de operador inválido.' });
  }
  const { name, role, canStart, canClose, active, pin } = req.body || {};

  try {
    const operator = await supabaseStore.getOperator(id);
    if (!operator) {
      return res.status(404).json({ error: 'Operador não encontrado.' });
    }
    const operators = await supabaseStore.getOperators();
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

    if (!(await supabaseStore.updateOperator({ ...updatedOperator, id }))) {
      return res.status(404).json({ error: 'Operador não encontrado.' });
    }
    await supabaseStore.deleteSessionsForOperator(id);
    res.json(publicOperator(updatedOperator));
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.delete('/api/operators/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: 'Identificador de operador inválido.' });
  }
  try {
    await supabaseStore.deleteOperator(id);
    await supabaseStore.deleteSessionsForOperator(id);
  } catch (error) {
    return respondWithStoreError(res, error);
  }
  res.json({ success: true, id });
});

// 7. Stoppage Types Management (Protected by requireAdminAuth)
app.get('/api/stoppage-types', async (_req, res) => {
  try {
    res.json(await supabaseStore.getStoppageTypes());
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.post('/api/stoppage-types', requireAdminAuth, async (req, res) => {
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

  try {
    await supabaseStore.createStoppageType(newType);
    res.status(201).json(newType);
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.put('/api/stoppage-types/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: 'Identificador de tipo inválido.' });
  }
  const { name, description, color, active } = req.body || {};

  const changes: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 128) {
      return res.status(400).json({ error: 'Nome do tipo de avaria inválido.' });
    }
    changes.name = name.trim();
  }
  if (description !== undefined) {
    if (typeof description !== 'string' || description.length > 500) {
      return res.status(400).json({ error: 'Descrição do tipo de avaria inválida.' });
    }
    changes.description = description.trim();
  }
  if (color !== undefined) {
    if (typeof color !== 'string' || !/^[a-z-]{1,32}$/.test(color)) {
      return res.status(400).json({ error: 'Cor do tipo de avaria inválida.' });
    }
    changes.color = color;
  }
  if (active !== undefined) {
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'Estado inválido.' });
    changes.active = active;
  }

  try {
    const updated = await supabaseStore.updateStoppageType(id, changes);
    if (!updated) return res.status(404).json({ error: 'Tipo de avaria não encontrado.' });
    res.json(updated);
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

app.delete('/api/stoppage-types/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: 'Identificador de tipo inválido.' });
  }
  try {
    await supabaseStore.deleteStoppageType(id);
    res.json({ success: true, id });
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

// 8. Reset to defaults (Protected by requireAdminAuth)
app.post('/api/reset-defaults', requireAdminAuth, async (_req, res) => {
  try {
    await supabaseStore.resetAppData(DEFAULT_STOPPAGE_TYPES);
    res.json({ success: true });
  } catch (error) {
    return respondWithStoreError(res, error);
  }
});

// Development vs Production setup
async function startServer() {
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
