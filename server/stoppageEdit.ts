/**
 * Edição de um registo de paragem já gravado (a partir do histórico).
 *
 * Só se podem alterar os campos de "conteúdo" (tipo, prioridade, estado, descrição, etapas, ...).
 * A máquina, a data, as horas e a duração NÃO são editáveis: dão a chave única do registo e
 * alimentam os indicadores (OEE, tempos parados), por isso não se mexem a partir daqui.
 *
 * Função pura, sem dependências de servidor ou de base de dados, para poder ser testada.
 */

import {
  PRIORITIES,
  STATUSES,
  sanitizeStoppageRecord,
  type SanitizedStoppage,
} from './stoppageSanitizer';

export const SHIFTS = ['1º Turno', '2º Turno', 'Turno Noturno'] as const;

export const EDITABLE_FIELDS = [
  'stoppageType',
  'priority',
  'status',
  'machineStopped',
  'shift',
  'initiatedBy',
  'closedBy',
  'stoppageDescription',
  'actionsTaken',
  'otherObservations',
  'stages',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];
type Plain = Record<string, unknown>;

const MAX_NAME = 128;
const MAX_TEXT = 5000;
const MAX_STAGES = 50;

export type EditResult =
  | { ok: true; changed: false; record: SanitizedStoppage }
  | { ok: true; changed: true; record: SanitizedStoppage; changedFields: EditableField[] }
  | { ok: false; error: string; status: number };

function isPlain(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON com as chaves ordenadas, para comparar valores sem depender da ordem das propriedades. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isPlain(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function fail(error: string, status = 400): EditResult {
  return { ok: false, error, status };
}

/**
 * Valida `changes` e aplica-as sobre `existing`.
 *
 * - Campos desconhecidos ou não editáveis são rejeitados (nunca ignorados em silêncio).
 * - Valores inválidos são rejeitados (não são "corrigidos" automaticamente).
 * - Se nada mudou de facto, devolve `changed: false` e o registo fica tal como estava.
 * - Se mudou, o registo recebe `lastEditedAt` / `lastEditedBy`.
 */
export function applyStoppageEdit(
  existing: unknown,
  changes: unknown,
  editor: { name: string; at: number }
): EditResult {
  if (!isPlain(changes)) return fail('Alterações inválidas.');
  const keys = Object.keys(changes);
  if (keys.length === 0) return fail('Nenhuma alteração indicada.');

  const notEditable = keys.filter((key) => !(EDITABLE_FIELDS as readonly string[]).includes(key));
  if (notEditable.length > 0) {
    return fail(`Campo(s) não editável(eis): ${notEditable.join(', ')}.`);
  }

  const before = sanitizeStoppageRecord(existing, { requireDateAndTime: false, allowEditMetadata: true });
  if (before.ok === false) {
    return fail('O registo guardado está incompleto e não pode ser editado.', 422);
  }

  const next: Plain = { ...before.record };

  const requiredText = (field: EditableField, label: string, max: number): string | undefined => {
    if (!(field in changes)) return undefined;
    const value = changes[field];
    if (typeof value !== 'string' || !value.trim()) return `${label} não pode ficar vazio.`;
    if (value.trim().length > max) return `${label} é demasiado longo (máximo ${max} caracteres).`;
    next[field] = value.trim();
    return undefined;
  };

  const errors = [
    requiredText('stoppageType', 'O tipo de paragem', MAX_NAME),
    requiredText('initiatedBy', 'Quem iniciou a paragem', MAX_NAME),
    requiredText('closedBy', 'Quem fechou a paragem', MAX_NAME),
    requiredText('stoppageDescription', 'A descrição da paragem', MAX_TEXT),
    requiredText('actionsTaken', 'A descrição do que foi feito', MAX_TEXT),
  ].filter((message): message is string => Boolean(message));
  if (errors.length > 0) return fail(errors[0]);

  if ('otherObservations' in changes) {
    const value = changes.otherObservations;
    if (typeof value !== 'string') return fail('As observações são inválidas.');
    if (value.trim().length > MAX_TEXT) {
      return fail(`As observações são demasiado longas (máximo ${MAX_TEXT} caracteres).`);
    }
    if (value.trim()) next.otherObservations = value.trim();
    else delete next.otherObservations;
  }

  if ('priority' in changes) {
    if (!(PRIORITIES as readonly unknown[]).includes(changes.priority)) return fail('Prioridade inválida.');
    next.priority = changes.priority;
  }
  if ('status' in changes) {
    if (!(STATUSES as readonly unknown[]).includes(changes.status)) return fail('Estado inválido.');
    next.status = changes.status;
  }
  if ('shift' in changes) {
    if (!(SHIFTS as readonly unknown[]).includes(changes.shift)) return fail('Turno inválido.');
    next.shift = changes.shift;
  }
  if ('machineStopped' in changes) {
    if (typeof changes.machineStopped !== 'boolean') return fail('A resposta "A máquina parou?" é inválida.');
    next.machineStopped = changes.machineStopped;
  }
  if ('stages' in changes) {
    const stages = changes.stages;
    if (!Array.isArray(stages)) return fail('As etapas são inválidas.');
    if (stages.length > MAX_STAGES) return fail(`Demasiadas etapas (máximo ${MAX_STAGES}).`);
    if (stages.length === 0) delete next.stages;
    else next.stages = stages;
  }

  const after = sanitizeStoppageRecord(next, { requireDateAndTime: false, allowEditMetadata: true });
  if (after.ok === false) return fail(after.error, 422);

  const changedFields = EDITABLE_FIELDS.filter(
    (field) => stable(before.record[field]) !== stable(after.record[field])
  );
  if (changedFields.length === 0) {
    return { ok: true, changed: false, record: before.record };
  }

  const record: SanitizedStoppage = {
    ...after.record,
    lastEditedAt: editor.at,
    lastEditedBy: editor.name.trim().slice(0, MAX_NAME) || 'Desconhecido',
  };
  return { ok: true, changed: true, record, changedFields };
}
