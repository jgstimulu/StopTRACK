import type { StoppageRecord } from '../types/manutrack';

const STORAGE_KEY = 'manutrack_pending_stoppages';

function isPendingStoppage(value: unknown): value is StoppageRecord {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'id' in value &&
      typeof value.id === 'string' &&
      'pendingSync' in value &&
      value.pendingSync === true
  );
}

export function readPendingStoppages(): StoppageRecord[] {
  if (typeof window === 'undefined') return [];
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isPendingStoppage) : [];
  } catch (error) {
    console.warn('Não foi possível ler a fila local de paragens pendentes.', error);
    return [];
  }
}

export function enqueuePendingStoppage(record: StoppageRecord): StoppageRecord[] {
  if (typeof window === 'undefined') {
    throw new Error('A fila local de paragens só está disponível no navegador.');
  }

  const pending = readPendingStoppages().filter((item) => item.id !== record.id);
  const next = [{ ...record, pendingSync: true }, ...pending];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function removePendingStoppage(id: string): StoppageRecord[] {
  if (typeof window === 'undefined') {
    throw new Error('A fila local de paragens só está disponível no navegador.');
  }

  const next = readPendingStoppages().filter((record) => record.id !== id);
  if (next.length > 0) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return next;
}
