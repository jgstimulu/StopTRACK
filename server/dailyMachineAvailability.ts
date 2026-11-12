export type MachineAvailabilityStatus = 'Disponível' | 'Em manutenção' | 'Indisponível';

export interface MachineAvailabilityState {
  status: MachineAvailabilityStatus;
  note: string;
}

const MACHINE_CODES = Array.from({ length: 30 }, (_, index) => `F${String(index + 1).padStart(2, '0')}`);
const VALID_STATUSES = new Set<MachineAvailabilityStatus>([
  'Disponível',
  'Em manutenção',
  'Indisponível',
]);

export function parseDailyMachineAvailability(value: unknown): Record<string, MachineAvailabilityState> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length !== MACHINE_CODES.length || keys.some((key) => !MACHINE_CODES.includes(key))) return null;

  const result: Record<string, MachineAvailabilityState> = {};
  for (const machineCode of MACHINE_CODES) {
    const state = input[machineCode];
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;

    const candidate = state as Record<string, unknown>;
    if (
      typeof candidate.status !== 'string' ||
      !VALID_STATUSES.has(candidate.status as MachineAvailabilityStatus) ||
      typeof candidate.note !== 'string' ||
      candidate.note.length > 500
    ) {
      return null;
    }

    result[machineCode] = {
      status: candidate.status as MachineAvailabilityStatus,
      note: candidate.note,
    };
  }
  return result;
}
