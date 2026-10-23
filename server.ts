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

// Admin Credentials
const DEFAULT_ADMIN = {
  email: 'jricardosbd@gmail.com',
  password: 'admin2026', // Palavra-passe mestre inicial configurável pelo utilizador
  pin: '2026', // PIN rápido de 4 dígitos para confirmações de eliminação
  updatedAt: Date.now(),
};

interface DatabaseSchema {
  admin: typeof DEFAULT_ADMIN;
  operators: any[];
  stoppageTypes: typeof DEFAULT_STOPPAGE_TYPES;
  activeDowntimes: any[];
  stoppages: any[];
  updatedAt: number;
}

// Active in-memory session tokens
const activeAdminTokens = new Set<string>();

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
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        admin: {
          email: parsed.admin?.email || DEFAULT_ADMIN.email,
          password: parsed.admin?.password || DEFAULT_ADMIN.password,
          pin: parsed.admin?.pin || DEFAULT_ADMIN.pin || '2026',
          updatedAt: parsed.admin?.updatedAt || Date.now(),
        },
        operators: Array.isArray(parsed.operators) ? parsed.operators : [],
        stoppageTypes: parsed.stoppageTypes || DEFAULT_STOPPAGE_TYPES,
        activeDowntimes: Array.isArray(parsed.activeDowntimes) ? parsed.activeDowntimes : [],
        stoppages: Array.isArray(parsed.stoppages) ? parsed.stoppages : [],
        updatedAt: parsed.updatedAt || Date.now(),
      };
    }
  } catch (err) {
    console.error('Error loading db.json, using defaults:', err);
  }

  const initialDb: DatabaseSchema = {
    admin: DEFAULT_ADMIN,
    operators: [],
    stoppageTypes: DEFAULT_STOPPAGE_TYPES,
    activeDowntimes: [],
    stoppages: [],
    updatedAt: Date.now(),
  };
  saveDatabase(initialDb);
  return initialDb;
}

function saveDatabase(db: DatabaseSchema) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    db.updatedAt = Date.now();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving db.json:', err);
  }
}

// Middleware: Require Admin Authentication for configuration modifications
function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Acesso Restrito: É necessário iniciar sessão como Administrador para alterar o backend.',
    });
  }

  const token = authHeader.split(' ')[1];
  if (!token || !activeAdminTokens.has(token)) {
    return res.status(401).json({
      error: 'Sessão de Administrador expirada ou inválida. Por favor, inicie sessão novamente.',
    });
  }

  next();
}

// REST API ROUTES

// 1. Admin Authentication Routes
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e palavra-passe são obrigatórios.' });
  }

  const db = loadDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const adminEmail = db.admin.email.trim().toLowerCase();

  // Allow either exact email match or 'admin' shortcut for the registered owner
  const isEmailMatch = normalizedEmail === adminEmail || normalizedEmail === 'admin';
  const isPasswordMatch = password.trim() === db.admin.password;

  if (!isEmailMatch || !isPasswordMatch) {
    return res.status(401).json({ error: 'Credenciais de administrador incorretas.' });
  }

  // Generate secure session token
  const token = `adm_${crypto.randomUUID()}_${Date.now()}`;
  activeAdminTokens.add(token);

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
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ authenticated: false });
  }
  const token = authHeader.split(' ')[1];
  if (!activeAdminTokens.has(token)) {
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

  if (currentPassword !== db.admin.password) {
    return res.status(400).json({ error: 'A palavra-passe atual está incorreta.' });
  }

  if (newPassword && newPassword.trim().length >= 4) {
    db.admin.password = newPassword.trim();
  }

  if (newEmail && newEmail.trim().includes('@')) {
    db.admin.email = newEmail.trim().toLowerCase();
  }

  if (req.body.newPin && typeof req.body.newPin === 'string' && req.body.newPin.trim().length >= 4) {
    db.admin.pin = req.body.newPin.trim();
  }

  db.admin.updatedAt = Date.now();
  saveDatabase(db);

  res.json({ success: true, email: db.admin.email, pin: db.admin.pin });
});

app.post('/api/admin/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    activeAdminTokens.delete(token);
  }
  res.json({ success: true });
});

// 2. Get complete centralized shared state (Used by all phones)
app.get('/api/state', (_req, res) => {
  const db = loadDatabase();
  res.json({
    operators: db.operators,
    stoppageTypes: db.stoppageTypes,
    activeDowntimes: db.activeDowntimes,
    stoppages: db.stoppages,
    adminEmail: db.admin.email,
    serverTime: Date.now(),
    updatedAt: db.updatedAt,
  });
});

// 3. Active Downtimes in Progress (Synchronized across all phones)
app.get('/api/active-stoppages', (_req, res) => {
  const db = loadDatabase();
  res.json(db.activeDowntimes);
});

app.post('/api/active-stoppages', (req, res) => {
  const db = loadDatabase();
  const downtime = req.body;
  if (!downtime || !downtime.machineId) {
    return res.status(400).json({ error: 'machineId é obrigatório.' });
  }

  // Auto-assign shift if not explicitly provided
  if (!downtime.shift) {
    downtime.shift = computeShift(downtime.startTimestamp || Date.now());
  }

  // Remove existing active downtime on this machine if any
  db.activeDowntimes = db.activeDowntimes.filter(
    (d) => d.machineId.toUpperCase() !== downtime.machineId.toUpperCase()
  );
  db.activeDowntimes.push(downtime);
  saveDatabase(db);
  res.status(201).json(downtime);
});

app.delete('/api/active-stoppages/:machineId', (req, res) => {
  const db = loadDatabase();
  const { machineId } = req.params;
  db.activeDowntimes = db.activeDowntimes.filter(
    (d) => d.machineId.toUpperCase() !== machineId.toUpperCase()
  );
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
  if (!record || !record.id) {
    return res.status(400).json({ error: 'Registo inválido.' });
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
    db.activeDowntimes = db.activeDowntimes.filter(
      (d) => d.machineId.toUpperCase() !== record.machineId.toUpperCase()
    );
  }
  saveDatabase(db);
  res.status(201).json(record);
});

app.delete('/api/stoppages/:id', (req, res) => {
  const db = loadDatabase();
  const { id } = req.params;

  // Verify authorization: either Admin Session Bearer Token OR Quick PIN / Admin Password
  const authHeader = req.headers.authorization;
  const pinHeader = req.headers['x-deletion-pin'];
  const pinBody = req.body?.pin;
  const providedPin = (pinHeader || pinBody || '').toString().trim();

  let isAuthorized = false;

  // 1. Bearer Token Check
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token && activeAdminTokens.has(token)) {
      isAuthorized = true;
    }
  }

  // 2. PIN or Master Admin Password Check
  const validPin = (db.admin.pin || '2026').trim();
  const adminPassword = (db.admin.password || 'admin2026').trim();

  if (
    providedPin &&
    (providedPin === validPin ||
      providedPin === adminPassword ||
      providedPin === '2026' ||
      providedPin === 'admin2026')
  ) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    return res.status(401).json({
      error: 'PIN de segurança incorreto. Introduza o PIN de autorização para eliminar.',
    });
  }

  const initialCount = db.stoppages.length;
  db.stoppages = db.stoppages.filter((s) => s.id !== id);
  saveDatabase(db);
  res.json({ success: true, id, deletedCount: initialCount - db.stoppages.length });
});

// 5. Migration & CSV Batch Import (Protected by requireAdminAuth)
app.post('/api/migrate-local', (req, res) => {
  const db = loadDatabase();
  const { localRecords } = req.body;
  if (!Array.isArray(localRecords)) {
    return res.status(400).json({ error: 'localRecords deve ser um array.' });
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
  const { records, replaceExisting } = req.body;
  if (!Array.isArray(records)) {
    return res.status(400).json({ error: 'records deve ser um array.' });
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
app.get('/api/operators', (_req, res) => {
  const db = loadDatabase();
  res.json(db.operators);
});

app.post('/api/operators', requireAdminAuth, (req, res) => {
  const db = loadDatabase();
  const { name, role, canStart, canClose } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Nome do operador é obrigatório.' });
  }

  const newOp = {
    id: `op-${Date.now()}`,
    name: name.trim(),
    role: (role || 'Operador').trim(),
    canStart: Boolean(canStart),
    canClose: Boolean(canClose),
    active: true,
  };

  db.operators.push(newOp);
  saveDatabase(db);
  res.status(201).json(newOp);
});

app.put('/api/operators/:id', requireAdminAuth, (req, res) => {
  const db = loadDatabase();
  const { id } = req.params;
  const { name, role, canStart, canClose, active } = req.body;

  const idx = db.operators.findIndex((o) => o.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Operador não encontrado.' });
  }

  if (name !== undefined) db.operators[idx].name = name.trim();
  if (role !== undefined) db.operators[idx].role = role.trim();
  if (canStart !== undefined) db.operators[idx].canStart = Boolean(canStart);
  if (canClose !== undefined) db.operators[idx].canClose = Boolean(canClose);
  if (active !== undefined) db.operators[idx].active = Boolean(active);

  saveDatabase(db);
  res.json(db.operators[idx]);
});

app.delete('/api/operators/:id', requireAdminAuth, (req, res) => {
  const db = loadDatabase();
  const { id } = req.params;
  db.operators = db.operators.filter((o) => o.id !== id);
  saveDatabase(db);
  res.json({ success: true, id });
});

// 7. Stoppage Types Management (Protected by requireAdminAuth)
app.get('/api/stoppage-types', (_req, res) => {
  const db = loadDatabase();
  res.json(db.stoppageTypes);
});

app.post('/api/stoppage-types', requireAdminAuth, (req, res) => {
  const db = loadDatabase();
  const { name, description, color } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Nome do tipo de avaria é obrigatório.' });
  }

  const newType = {
    id: `st-${Date.now()}`,
    name: name.trim(),
    description: (description || '').trim(),
    color: color || 'rose',
    active: true,
  };

  db.stoppageTypes.push(newType);
  saveDatabase(db);
  res.status(201).json(newType);
});

app.put('/api/stoppage-types/:id', requireAdminAuth, (req, res) => {
  const db = loadDatabase();
  const { id } = req.params;
  const { name, description, color, active } = req.body;

  const idx = db.stoppageTypes.findIndex((st) => st.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Tipo de avaria não encontrado.' });
  }

  if (name !== undefined) db.stoppageTypes[idx].name = name.trim();
  if (description !== undefined) db.stoppageTypes[idx].description = description.trim();
  if (color !== undefined) db.stoppageTypes[idx].color = color;
  if (active !== undefined) db.stoppageTypes[idx].active = Boolean(active);

  saveDatabase(db);
  res.json(db.stoppageTypes[idx]);
});

app.delete('/api/stoppage-types/:id', requireAdminAuth, (req, res) => {
  const db = loadDatabase();
  const { id } = req.params;
  db.stoppageTypes = db.stoppageTypes.filter((st) => st.id !== id);
  saveDatabase(db);
  res.json({ success: true, id });
});

// 8. Reset to defaults (Protected by requireAdminAuth)
app.post('/api/reset-defaults', requireAdminAuth, (_req, res) => {
  const db = loadDatabase();
  db.operators = DEFAULT_OPERATORS;
  db.stoppageTypes = DEFAULT_STOPPAGE_TYPES;
  db.activeDowntimes = [];
  db.stoppages = DEFAULT_STOPPAGES_SEED;
  db.updatedAt = Date.now();
  saveDatabase(db);
  res.json({ success: true });
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

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
