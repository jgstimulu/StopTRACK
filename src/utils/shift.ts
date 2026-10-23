/**
 * Utilitário de cálculo e gestão de Turnos industriais do StopTRACK
 * 
 * Regra de Negócio:
 * - 05:00 até 14:30 -> 1º Turno (Manhã)
 * - 14:30 até 00:00 -> 2º Turno (Tarde/Noite)
 * - 00:00 até 05:00 -> Turno Noturno / 3º Turno (Madrugada)
 */

export interface ShiftInfo {
  name: string;        // "1º Turno" | "2º Turno" | "Turno Noturno"
  code: '1' | '2' | 'noturno';
  label: string;       // "1º Turno (05:00 - 14:30)"
  timeRange: string;   // "05:00 - 14:30"
  badgeColor: string;  // Tailwind color classes
}

/**
 * Calcula o turno com base numa data, timestamp ou hora
 */
export function getShiftInfo(dateOrTimestamp: Date | number = new Date()): ShiftInfo {
  const d = typeof dateOrTimestamp === 'number' ? new Date(dateOrTimestamp) : dateOrTimestamp;
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const t0500 = 5 * 60;        // 300 min (05:00)
  const t1430 = 14 * 60 + 30;  // 870 min (14:30)

  if (totalMinutes >= t0500 && totalMinutes < t1430) {
    return {
      name: '1º Turno',
      code: '1',
      label: '1º Turno (05:00 - 14:30)',
      timeRange: '05:00 - 14:30',
      badgeColor: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    };
  } else if (totalMinutes >= t1430 && totalMinutes < 24 * 60) {
    return {
      name: '2º Turno',
      code: '2',
      label: '2º Turno (14:30 - 00:00)',
      timeRange: '14:30 - 00:00',
      badgeColor: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    };
  } else {
    return {
      name: 'Turno Noturno',
      code: 'noturno',
      label: 'Turno Noturno (00:00 - 05:00)',
      timeRange: '00:00 - 05:00',
      badgeColor: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
    };
  }
}

/**
 * Calcula o turno a partir de uma string de hora (ex: "09:30" ou "16:45:00")
 */
export function getShiftFromTimeString(timeStr?: string): ShiftInfo {
  if (!timeStr || typeof timeStr !== 'string') {
    return getShiftInfo();
  }

  const parts = timeStr.trim().split(':');
  if (parts.length >= 2) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(minutes)) {
      const dummyDate = new Date();
      dummyDate.setHours(hours, minutes, 0, 0);
      return getShiftInfo(dummyDate);
    }
  }

  return getShiftInfo();
}
