import {
  StoppageEditChanges,
  StoppagePriority,
  StoppageRecord,
  StoppageStage,
  StoppageStatus,
} from '../types/manutrack';
import { getShiftFromTimeString } from './shift';

/**
 * Valores do formulário de edição de uma paragem e cálculo do que mudou.
 *
 * Só se enviam ao servidor os campos que a pessoa realmente alterou: assim, os campos que ela
 * não tocou nunca são validados nem sobrescritos (por exemplo, registos importados com campos
 * vazios continuam a poder ser editados num campo de cada vez).
 */

export const EDIT_SHIFTS = ['1º Turno', '2º Turno', 'Turno Noturno'] as const;
export const EDIT_PRIORITIES: StoppagePriority[] = ['Baixa', 'Média', 'Alta', 'Crítica'];
export const EDIT_STATUSES: StoppageStatus[] = ['Resolvido', 'Em Decorrer', 'Pendente'];

export const MAX_NAME_LENGTH = 128;
export const MAX_TEXT_LENGTH = 5000;

export interface EditFormValues {
  stoppageType: string;
  priority: string;
  status: string;
  shift: string;
  machineStopped: boolean | undefined; // undefined = registo antigo, nunca respondido
  initiatedBy: string;
  closedBy: string;
  stoppageDescription: string;
  actionsTaken: string;
  otherObservations: string;
  stages: StoppageStage[];
}

/** Valores iniciais do formulário, tal como o histórico mostra o registo hoje. */
export function initialEditValues(record: StoppageRecord): EditFormValues {
  return {
    stoppageType: record.stoppageType || '',
    priority: record.priority || 'Média',
    status: record.status || 'Resolvido',
    shift: record.shift || getShiftFromTimeString(record.startTime).name,
    machineStopped: record.machineStopped,
    initiatedBy: record.initiatedBy || '',
    closedBy: record.closedBy || '',
    stoppageDescription: record.stoppageDescription || '',
    actionsTaken: record.actionsTaken || '',
    otherObservations: record.otherObservations || '',
    stages: record.stages ? record.stages.map((stage) => ({ ...stage })) : [],
  };
}

/** Só os campos que mudaram em relação aos valores iniciais. Vazio = nada a guardar. */
export function buildEditChanges(initial: EditFormValues, current: EditFormValues): StoppageEditChanges {
  const changes: StoppageEditChanges = {};
  const trimmed = (value: string) => value.trim();

  if (trimmed(current.stoppageType) !== trimmed(initial.stoppageType)) {
    changes.stoppageType = trimmed(current.stoppageType);
  }
  if (current.priority !== initial.priority) {
    changes.priority = current.priority as StoppagePriority;
  }
  if (current.status !== initial.status) {
    changes.status = current.status as StoppageStatus;
  }
  if (current.shift !== initial.shift) {
    changes.shift = current.shift;
  }
  // "Não indicado" (undefined) não se pode escolher de volta: só se envia Sim ou Não.
  if (current.machineStopped !== undefined && current.machineStopped !== initial.machineStopped) {
    changes.machineStopped = current.machineStopped;
  }
  if (trimmed(current.initiatedBy) !== trimmed(initial.initiatedBy)) {
    changes.initiatedBy = trimmed(current.initiatedBy);
  }
  if (trimmed(current.closedBy) !== trimmed(initial.closedBy)) {
    changes.closedBy = trimmed(current.closedBy);
  }
  if (trimmed(current.stoppageDescription) !== trimmed(initial.stoppageDescription)) {
    changes.stoppageDescription = trimmed(current.stoppageDescription);
  }
  if (trimmed(current.actionsTaken) !== trimmed(initial.actionsTaken)) {
    changes.actionsTaken = trimmed(current.actionsTaken);
  }
  if (trimmed(current.otherObservations) !== trimmed(initial.otherObservations)) {
    changes.otherObservations = trimmed(current.otherObservations);
  }
  if (JSON.stringify(current.stages) !== JSON.stringify(initial.stages)) {
    changes.stages = current.stages;
  }
  return changes;
}

/** Primeira mensagem de erro a mostrar antes de enviar (as mesmas regras que o servidor aplica). */
export function validateEditChanges(changes: StoppageEditChanges): string | null {
  const required: [keyof StoppageEditChanges, string, number][] = [
    ['stoppageType', 'O tipo de paragem', MAX_NAME_LENGTH],
    ['initiatedBy', 'Quem iniciou a paragem', MAX_NAME_LENGTH],
    ['closedBy', 'Quem fechou a paragem', MAX_NAME_LENGTH],
    ['stoppageDescription', 'A descrição da paragem', MAX_TEXT_LENGTH],
    ['actionsTaken', 'A descrição do que foi feito', MAX_TEXT_LENGTH],
  ];
  for (const [field, label, max] of required) {
    const value = changes[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !value.trim()) return `${label} não pode ficar vazio.`;
    if (value.trim().length > max) return `${label} é demasiado longo (máximo ${max} caracteres).`;
  }
  if (
    changes.otherObservations !== undefined &&
    changes.otherObservations.trim().length > MAX_TEXT_LENGTH
  ) {
    return `As observações são demasiado longas (máximo ${MAX_TEXT_LENGTH} caracteres).`;
  }
  if (changes.stages !== undefined && changes.stages.length > 50) {
    return 'Demasiadas etapas (máximo 50).';
  }
  return null;
}
