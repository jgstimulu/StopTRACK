/**
 * Validação e limpeza dos registos de paragem recebidos pela API.
 *
 * Só os campos conhecidos são guardados (qualquer campo extra é descartado), os textos têm
 * tamanho máximo e os valores fechados (prioridade, estado, nível das etapas) são normalizados.
 * Função pura, sem dependências, para poder ser testada isoladamente.
 */

export const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Crítica'] as const;
export const STATUSES = ['Resolvido', 'Em Decorrer', 'Pendente'] as const;

const MAX_NAME = 128;
const MAX_SHORT = 64;
const MAX_TEXT = 5000;
const MAX_STAGES = 50;

type Plain = Record<string, unknown>;

/** Registo de paragem já validado: os campos obrigatórios têm tipo garantido. */
export interface SanitizedStoppage extends Plain {
  id: string;
  machineId: string;
  date: string;
  startTime: string;
  startTimestamp: number;
  createdAt: number;
  shift?: string;
}

/** Paragem ativa já validada. */
export interface SanitizedActiveDowntime extends Plain {
  id: string;
  machineId: string;
  startTimestamp: number;
  shift?: string;
}

export type SanitizeResult =
  | { ok: true; record: SanitizedStoppage }
  | { ok: false; error: string };

function isPlain(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, max);
}

function optionalText(value: unknown, max: number): string | undefined {
  const result = text(value, max);
  return result ? result : undefined;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function normalizeMachineId(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, '').toUpperCase() : '';
}

function sanitizeStage(stage: unknown, index: number): Plain | undefined {
  if (!isPlain(stage)) return undefined;
  const level = stage.level === 1 || stage.level === 2 || stage.level === 3 ? stage.level : undefined;
  const result: Plain = {
    id: text(stage.id, MAX_NAME, `stage-${index + 1}`) || `stage-${index + 1}`,
    order: Math.max(1, Math.round(finiteNumber(stage.order, index + 1))),
    type: text(stage.type, MAX_NAME),
    description: text(stage.description, MAX_TEXT),
    technician: text(stage.technician, MAX_NAME),
    durationMinutes: Math.max(0, finiteNumber(stage.durationMinutes, 0)),
  };
  if (level) result.level = level;
  const levelLabel = optionalText(stage.levelLabel, MAX_SHORT);
  if (levelLabel) result.levelLabel = levelLabel;
  const notes = optionalText(stage.notes, MAX_TEXT);
  if (notes) result.notes = notes;
  return result;
}

function sanitizeStages(value: unknown): Plain[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_STAGES)
    .map((stage, index) => sanitizeStage(stage, index))
    .filter((stage): stage is Plain => Boolean(stage));
}

/**
 * Limpa uma paragem ativa (cronómetro em curso). Assume que machineId, id, startTimestamp
 * e initiatedBy já foram validados pela rota; aqui só se descartam campos desconhecidos
 * e se limitam tamanhos e tipos.
 */
export function sanitizeActiveDowntime(input: Plain, machineId: string): SanitizedActiveDowntime {
  const downtime: Plain = {
    id: text(input.id, 128),
    machineId,
    machineName: text(input.machineName, MAX_NAME, `Máquina ${machineId}`) || `Máquina ${machineId}`,
    startTimestamp: finiteNumber(input.startTimestamp, 0),
    startDateFormatted: text(input.startDateFormatted, 32),
    startTimeFormatted: text(input.startTimeFormatted, 32),
    initiatedBy: text(input.initiatedBy, MAX_NAME),
  };
  const shift = optionalText(input.shift, MAX_SHORT);
  if (shift) downtime.shift = shift;
  const assignedTechnician = optionalText(input.assignedTechnician, MAX_NAME);
  if (assignedTechnician) downtime.assignedTechnician = assignedTechnician;
  const currentStage = optionalText(input.currentStage, MAX_NAME);
  if (currentStage) downtime.currentStage = currentStage;
  if (input.currentLevel === 1 || input.currentLevel === 2 || input.currentLevel === 3) {
    downtime.currentLevel = input.currentLevel;
  }
  if (typeof input.stageStartTimestamp === 'number' && Number.isFinite(input.stageStartTimestamp)) {
    downtime.stageStartTimestamp = input.stageStartTimestamp;
  }
  const completedStages = sanitizeStages(input.completedStages);
  if (completedStages.length > 0) downtime.completedStages = completedStages;
  return downtime as SanitizedActiveDowntime;
}

/**
 * Valida e limpa um registo de paragem.
 *
 * Campos obrigatórios: id, machineId, date, startTime, startTimestamp.
 * Os restantes são opcionais e recebem um valor por defeito quando falta ou é inválido.
 */
export function sanitizeStoppageRecord(
  input: unknown,
  options: { requireDateAndTime?: boolean; allowEditMetadata?: boolean } = {}
): SanitizeResult {
  // Importações (CSV / migração) sempre toleraram registos sem data ou hora; só o registo
  // feito na app (requireDateAndTime = true, por defeito) os exige.
  const requireDateAndTime = options.requireDateAndTime !== false;
  if (!isPlain(input)) return { ok: false, error: 'Registo inválido.' };

  const id = text(input.id, 128);
  const machineId = normalizeMachineId(input.machineId);
  const date = text(input.date, 32);
  const startTime = text(input.startTime, 32);
  const startTimestamp = finiteNumber(input.startTimestamp, 0);

  // Mesma regra que existia antes (só o tamanho), para não rejeitar registos antigos na migração.
  if (!id) return { ok: false, error: 'Registo inválido: identificador.' };
  if (!/^[A-Z0-9_-]{1,64}$/.test(machineId)) return { ok: false, error: 'Registo inválido: máquina.' };
  if (requireDateAndTime && !date) return { ok: false, error: 'Registo inválido: data.' };
  if (requireDateAndTime && !startTime) return { ok: false, error: 'Registo inválido: hora de início.' };
  if (startTimestamp <= 0) return { ok: false, error: 'Registo inválido: início.' };

  const endTimestamp = finiteNumber(input.endTimestamp, startTimestamp);
  if (endTimestamp < startTimestamp) {
    return { ok: false, error: 'Registo inválido: o fim é anterior ao início.' };
  }
  const durationMs = Math.max(0, finiteNumber(input.durationMs, endTimestamp - startTimestamp));

  const record: Plain = {
    id,
    machineId,
    machineName: text(input.machineName, MAX_NAME, `Máquina ${machineId}`) || `Máquina ${machineId}`,
    date,
    startTime,
    endTime: text(input.endTime, 32),
    startTimestamp,
    endTimestamp,
    durationMs,
    durationFormatted: text(input.durationFormatted, 32),
    priority: oneOf(input.priority, PRIORITIES, 'Média'),
    status: oneOf(input.status, STATUSES, 'Resolvido'),
    initiatedBy: text(input.initiatedBy, MAX_NAME),
    closedBy: text(input.closedBy, MAX_NAME),
    stoppageType: text(input.stoppageType, MAX_NAME),
    stoppageDescription: text(input.stoppageDescription, MAX_TEXT),
    actionsTaken: text(input.actionsTaken, MAX_TEXT),
    createdAt: Math.max(0, finiteNumber(input.createdAt, Date.now())),
  };

  const shift = optionalText(input.shift, MAX_SHORT);
  if (shift) record.shift = shift;

  if (typeof input.machineStopped === 'boolean') record.machineStopped = input.machineStopped;

  const otherObservations = optionalText(input.otherObservations, MAX_TEXT);
  if (otherObservations) record.otherObservations = otherObservations;

  const stages = sanitizeStages(input.stages);
  if (stages.length > 0) record.stages = stages;

  // "Editado por / em" só é aceite quando vem do próprio servidor (rota de edição);
  // nos registos enviados por clientes e nas importações é sempre descartado.
  if (options.allowEditMetadata) {
    const lastEditedAt = finiteNumber(input.lastEditedAt, 0);
    const lastEditedBy = optionalText(input.lastEditedBy, MAX_NAME);
    if (lastEditedAt > 0 && lastEditedBy) {
      record.lastEditedAt = lastEditedAt;
      record.lastEditedBy = lastEditedBy;
    }
  }

  return { ok: true, record: record as SanitizedStoppage };
}
