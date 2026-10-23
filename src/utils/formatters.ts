export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');

  return `${hh}:${mm}:${ss}`;
}

export function formatTimeOnly(date: Date): string {
  return date.toTimeString().split(' ')[0]; // HH:MM:SS
}

export function formatDatePt(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Normaliza qualquer formato de data (DD/MM/AAAA, AAAA-MM-DD ou timestamp em ms)
 * para uma string segura comparável AAAA-MM-DD no fuso horário local.
 */
export function normalizeDateToYMD(dateStr?: string, timestamp?: number): string {
  if (timestamp && typeof timestamp === 'number' && !isNaN(timestamp) && timestamp > 0) {
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();

  // Caso DD/MM/AAAA ou DD-MM-AAAA
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Caso AAAA-MM-DD ou AAAA/MM/DD
  const ymdMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Fallback Date.parse
  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return trimmed;
}

/**
 * Retorna a data no formato AAAA-MM-DD usando o relógio local
 */
export function getLocalYMD(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
