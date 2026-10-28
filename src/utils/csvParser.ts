import { StoppageRecord } from '../types/manutrack';
import { getShiftFromTimeString } from './shift';

export type TargetFieldKey =
  | 'machineId'
  | 'date'
  | 'shift'
  | 'startTime'
  | 'endTime'
  | 'duration'
  | 'initiatedBy'
  | 'closedBy'
  | 'stoppageType'
  | 'priority'
  | 'status'
  | 'machineStopped'
  | 'stoppageDescription'
  | 'actionsTaken'
  | 'otherObservations';

export interface TargetFieldDef {
  key: TargetFieldKey;
  label: string;
  description: string;
  example: string;
  required: boolean;
  synonyms: string[];
}

export const TARGET_FIELDS: TargetFieldDef[] = [
  {
    key: 'machineId',
    label: 'Máquina / Posto',
    description: 'Código da máquina (F01 a F30 ou número simples)',
    example: 'F04 ou 4',
    required: true,
    synonyms: ['maquina', 'maquinanumero', 'machine', 'equipamento', 'posto', 'linha', 'identificadordamaquina', 'estacao', 'idmaquina'],
  },
  {
    key: 'date',
    label: 'Data',
    description: 'Data do registo (DD/MM/AAAA ou AAAA-MM-DD)',
    example: '18/10/2026',
    required: false,
    synonyms: ['data', 'date', 'dia', 'dataparagem', 'dataavaria', 'dataregisto', 'datahora', 'timestamp'],
  },
  {
    key: 'shift',
    label: 'Turno',
    description: 'Turno da paragem (1º Turno, 2º Turno ou Turno Noturno)',
    example: '1º Turno',
    required: false,
    synonyms: ['turno', 'shift', 'turnodaparagem', 'equipeturno', 'turnotrabalho'],
  },
  {
    key: 'startTime',
    label: 'Hora de Início',
    description: 'Hora de arranque da avaria ou paragem',
    example: '09:15:00',
    required: false,
    synonyms: ['horainicio', 'horadeinicio', 'inicio', 'starttime', 'start', 'horaaberto', 'abertura', 'horadeabertura'],
  },
  {
    key: 'endTime',
    label: 'Hora de Fim / Conclusão',
    description: 'Hora de encerramento da paragem',
    example: '09:42:00',
    required: false,
    synonyms: ['horafim', 'horadefim', 'horadefecho', 'fim', 'fecho', 'endtime', 'end', 'conclusao', 'horadeconclusao'],
  },
  {
    key: 'duration',
    label: 'Duração',
    description: 'Tempo total parado (HH:MM:SS ou número em minutos)',
    example: '00:27:00 ou 27',
    required: false,
    synonyms: ['duracao', 'duracaodaparagem', 'duration', 'tempo', 'tempodeespera', 'tempoparagem', 'tempoparado', 'duracaominutos', 'minutos'],
  },
  {
    key: 'initiatedBy',
    label: 'Quem Iniciou (Operador)',
    description: 'Nome do operador que reportou o início da paragem',
    example: 'Carlos Silva',
    required: false,
    synonyms: ['queminiciou', 'iniciadopor', 'operadorinicio', 'operador', 'operadordelinha', 'initiatedby', 'abertopor', 'responsavelinicial'],
  },
  {
    key: 'closedBy',
    label: 'Quem Fechou (Técnico / Responsável)',
    description: 'Nome de quem resolveu e fechou o registo',
    example: 'Miguel Santos',
    required: false,
    synonyms: ['quemfechou', 'fechadopor', 'tecnico', 'supervisor', 'closedby', 'manutentor', 'responsavelfecho', 'tecnicomanutencao'],
  },
  {
    key: 'stoppageType',
    label: 'Tipo de Paragem / Avaria',
    description: 'Classificação do motivo da paragem',
    example: 'Avaria Mecânica',
    required: false,
    synonyms: ['tipodeparagem', 'tipo', 'avaria', 'motivo', 'categoria', 'stoppagetype', 'type', 'motivoreclamacao', 'causaparagem', 'tipoavaria'],
  },
  {
    key: 'priority',
    label: 'Prioridade da Avaria',
    description: 'Nível de prioridade (Baixa, Média, Alta, Crítica)',
    example: 'Alta',
    required: false,
    synonyms: ['prioridade', 'priority', 'urgencia', 'criticidade', 'nivelprioridade', 'grau'],
  },
  {
    key: 'status',
    label: 'Estado da Avaria',
    description: 'Estado da ocorrência (Resolvido, Em Decorrer, Pendente)',
    example: 'Resolvido',
    required: false,
    synonyms: ['estado', 'status', 'estadodaavaria', 'estadoparagem', 'situacao', 'fase'],
  },
  {
    key: 'machineStopped',
    label: 'A Máquina Parou?',
    description: 'Indica se a máquina chegou a parar (Sim ou Não)',
    example: 'Sim',
    required: false,
    synonyms: ['amaquinaparou', 'maquinaparou', 'maquinaparada', 'parou', 'machinestopped'],
  },
  {
    key: 'stoppageDescription',
    label: 'Descrição da Paragem',
    description: 'Detalhes e sintomas da avaria verificada',
    example: 'Correia transportadora partida',
    required: false,
    synonyms: ['descricaodaparagem', 'descricao', 'descricaoproblema', 'motivoavaria', 'causa', 'description', 'problema', 'ocorrencia', 'sintomas'],
  },
  {
    key: 'actionsTaken',
    label: 'O que foi feito (Intervenção)',
    description: 'Trabalho de reparação ou resolução efetuado',
    example: 'Substituição da correia trapezoidal B52',
    required: false,
    synonyms: ['oquefoifeito', 'descricaodoquefoifeito', 'acaorealizada', 'intervencao', 'resolucao', 'actionstaken', 'actions', 'trabalho', 'reparacao'],
  },
  {
    key: 'otherObservations',
    label: 'Outras Observações / Notas',
    description: 'Peças trocadas, comentários adicionais ou notas de seguimento',
    example: 'Ajuste de tensão efetuado e teste ok',
    required: false,
    synonyms: ['outrasobservacoes', 'observacoes', 'notas', 'pecas', 'obs', 'observations', 'notes', 'comentarios', 'pecassubstituidas'],
  },
];

export interface DetectedColumn {
  index: number;
  rawName: string;
  normalizedName: string;
  sampleValue: string;
  mappedTo: TargetFieldKey | 'ignore';
  autoDetected: boolean;
}

export interface CSVParseResult {
  records: StoppageRecord[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  machinesFound: string[];
  totalDurationMs: number;
  errors: string[];
  rawHeaders: string[];
  detectedColumns: DetectedColumn[];
  mappedCount: number;
  ignoredCount: number;
}

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]/g, ''); // remove pontuações e espaços
}

export function parseDurationToMs(durStr: string): number {
  if (!durStr) return 0;
  const cleaned = durStr.trim().replace(/"/g, '');

  // Formato HH:MM:SS ou HH:MM
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':').map((p) => parseInt(p, 10) || 0);
    if (parts.length === 3) {
      return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    }
    if (parts.length === 2) {
      return (parts[0] * 60 + parts[1]) * 1000;
    }
  }

  // Apenas valor numérico (presume-se minutos)
  const num = parseFloat(cleaned.replace(',', '.'));
  if (!isNaN(num) && num > 0) {
    return Math.round(num * 60 * 1000);
  }

  return 0;
}

/**
 * Função utilitária para dividir uma linha CSV respeitando aspas e delimitador
 */
export function splitCsvRow(rowStr: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < rowStr.length; i++) {
    const char = rowStr[i];
    if (char === '"') {
      if (inQuotes && rowStr[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      row.push(value.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      value = '';
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function parseDateValue(value: string): { year: number; month: number; day: number; embeddedTime?: string } | undefined {
  const cleaned = value.trim();
  const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}:\d{2}(?::\d{2})?))?/);
  const portuguese = cleaned.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?/);
  const match = iso || portuguese;
  if (!match) return undefined;

  const year = Number(iso ? match[1] : match[3]);
  const month = Number(iso ? match[2] : match[2]);
  const day = Number(iso ? match[3] : match[1]);
  const date = new Date(year, month - 1, day);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return { year, month, day, embeddedTime: match[4] };
}

function parseTimeValue(value: string): { hours: number; minutes: number; seconds: number } | undefined {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return undefined;
  return { hours, minutes, seconds };
}

function toTimestamp(
  date: { year: number; month: number; day: number },
  time: { hours: number; minutes: number; seconds: number }
): number {
  return new Date(date.year, date.month - 1, date.day, time.hours, time.minutes, time.seconds).getTime();
}

function formatDateValue(date: { year: number; month: number; day: number }): string {
  return `${date.day.toString().padStart(2, '0')}/${date.month.toString().padStart(2, '0')}/${date.year}`;
}

function formatTimeValue(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
}

/**
 * Mapeia automaticamente as colunas cruas de um cabeçalho para os campos oficiais do StopTRACK
 */
export function autoDetectColumnMapping(
  rawHeaders: string[],
  firstDataRow: string[] = []
): DetectedColumn[] {
  const usedTargets = new Set<TargetFieldKey>();

  return rawHeaders.map((rawHeader, idx) => {
    const norm = normalizeHeader(rawHeader);
    const sampleVal = firstDataRow[idx] ? firstDataRow[idx].replace(/^"|"$/g, '').trim() : '';

    // Procura o campo oficial que tenha este sinónimo
    let matchedKey: TargetFieldKey | 'ignore' = 'ignore';

    // 1ª passagem: correspondência exata tem prioridade sobre correspondências parciais
    // (ex.: "A Máquina Parou?" não deve ser confundida com a coluna "Máquina").
    const exactField = TARGET_FIELDS.find((field) =>
      field.synonyms.some((s) => normalizeHeader(s) === norm)
    );
    if (exactField) {
      usedTargets.add(exactField.key);
      return {
        index: idx,
        rawName: rawHeader.trim() || `Coluna ${idx + 1}`,
        normalizedName: norm,
        sampleValue: sampleVal,
        mappedTo: exactField.key,
        autoDetected: true,
      };
    }

    for (const field of TARGET_FIELDS) {
      // Se já foi associado a outra coluna, evita duplicados a menos que seja um match exato
      const isExactMatch = field.synonyms.some((s) => normalizeHeader(s) === norm);
      const isPartialMatch = field.synonyms.some(
        (s) => norm.includes(normalizeHeader(s)) || normalizeHeader(s).includes(norm)
      );

      if (isExactMatch) {
        matchedKey = field.key;
        usedTargets.add(field.key);
        break;
      } else if (isPartialMatch && !usedTargets.has(field.key)) {
        matchedKey = field.key;
        usedTargets.add(field.key);
        break;
      }
    }

    return {
      index: idx,
      rawName: rawHeader.trim() || `Coluna ${idx + 1}`,
      normalizedName: norm,
      sampleValue: sampleVal,
      mappedTo: matchedKey,
      autoDetected: matchedKey !== 'ignore',
    };
  });
}

/**
 * Faz o parsing completo de CSV com suporte a mapeamento customizado ou automático
 */
export function parseCSVStoppagesWithMapping(
  csvText: string,
  customMapping?: Record<number, TargetFieldKey | 'ignore'>
): CSVParseResult {
  const result: CSVParseResult = {
    records: [],
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    machinesFound: [],
    totalDurationMs: 0,
    errors: [],
    rawHeaders: [],
    detectedColumns: [],
    mappedCount: 0,
    ignoredCount: 0,
  };

  if (!csvText || !csvText.trim()) {
    result.errors.push('O ficheiro CSV fornecido está vazio.');
    return result;
  }

  // Remove BOM se presente
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    result.errors.push('O ficheiro deve conter pelo menos uma linha de cabeçalho e uma linha de dados.');
    return result;
  }

  // Deteção automática do delimitador (; ou , ou \t)
  const firstLine = lines[0];
  const countSemicolon = (firstLine.match(/;/g) || []).length;
  const countComma = (firstLine.match(/,/g) || []).length;
  const countTab = (firstLine.match(/\t/g) || []).length;

  let delimiter = ';';
  if (countComma > countSemicolon && countComma > countTab) delimiter = ',';
  else if (countTab > countSemicolon && countTab > countComma) delimiter = '\t';

  const rows = parseCsvRows(cleanText, delimiter);
  if (rows.length < 2) {
    result.errors.push('O ficheiro deve conter pelo menos uma linha de cabeçalho e uma linha de dados.');
    return result;
  }

  // Obter cabeçalhos crus e primeira linha de amostra
  const rawHeaders = rows[0];
  const sampleFirstRow = rows[1] || [];
  result.rawHeaders = rawHeaders;

  // Deteção inicial das colunas
  const initialColumns = autoDetectColumnMapping(rawHeaders, sampleFirstRow);

  // Aplicar mapeamento customizado se fornecido pelo utilizador na interface
  const finalColumns: DetectedColumn[] = initialColumns.map((col) => {
    if (customMapping && customMapping[col.index] !== undefined) {
      return {
        ...col,
        mappedTo: customMapping[col.index],
      };
    }
    return col;
  });

  result.detectedColumns = finalColumns;
  result.mappedCount = finalColumns.filter((c) => c.mappedTo !== 'ignore').length;
  result.ignoredCount = finalColumns.filter((c) => c.mappedTo === 'ignore').length;

  // Criar mapa inverso de TargetFieldKey -> coluna(s)
  const targetToColIdx: Partial<Record<TargetFieldKey, number>> = {};
  for (const col of finalColumns) {
    if (col.mappedTo !== 'ignore') {
      targetToColIdx[col.mappedTo] = col.index;
    }
  }

  const machinesSet = new Set<string>();

  // Processar linhas de dados
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols.some((cell) => cell.trim().length > 0)) continue;
    result.totalRows++;

    // 1. Extração da Máquina (prioridade para a coluna mapeada; se não existir, tenta encontrar padrão Fxx)
    let machineCode = '';
    const idxMachine = targetToColIdx['machineId'];

    if (idxMachine !== undefined && cols[idxMachine]) {
      const rawVal = cols[idxMachine].trim().toUpperCase();
      if (/^F\d{1,2}$/i.test(rawVal)) {
        const num = parseInt(rawVal.substring(1), 10);
        if (num >= 1 && num <= 30) machineCode = `F${num.toString().padStart(2, '0')}`;
      } else if (/^\d{1,2}$/.test(rawVal)) {
        const num = parseInt(rawVal, 10);
        if (num >= 1 && num <= 30) machineCode = `F${num.toString().padStart(2, '0')}`;
      }
    }

    // Se ainda não encontrou, tenta buscar F01-F30 em qualquer coluna da linha
    if (!machineCode) {
      const match = cols.join(' ').match(/\b(F\d{1,2})\b/i);
      if (match) {
        const num = parseInt(match[1].substring(1), 10);
        if (num >= 1 && num <= 30) machineCode = `F${num.toString().padStart(2, '0')}`;
      }
    }

    if (!machineCode) {
      result.invalidRows++;
      if (result.errors.length < 10) result.errors.push(`Linha ${i + 1}: máquina/posto em falta ou fora do intervalo F01–F30.`);
      continue;
    }

    machinesSet.add(machineCode);

    // 2. Parse the event date and times so stored timestamps reflect the CSV record.
    const idxDate = targetToColIdx['date'];
    const rawDate = idxDate !== undefined ? cols[idxDate]?.trim() || '' : '';
    const now = new Date();
    const eventDate = rawDate
      ? parseDateValue(rawDate)
      : { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
    if (!eventDate) {
      result.invalidRows++;
      if (result.errors.length < 10) result.errors.push(`Linha ${i + 1}: data inválida; use DD/MM/AAAA ou AAAA-MM-DD.`);
      continue;
    }
    const dateStr = formatDateValue(eventDate);

    const idxStart = targetToColIdx['startTime'];
    const rawStart = idxStart !== undefined ? cols[idxStart]?.trim() || '' : '';
    const startTime = parseTimeValue(rawStart || eventDate.embeddedTime || '08:00:00');
    if (!startTime) {
      result.invalidRows++;
      if (result.errors.length < 10) result.errors.push(`Linha ${i + 1}: hora de início inválida; use HH:MM ou HH:MM:SS.`);
      continue;
    }
    const startTimeStr = formatTimeValue(toTimestamp(eventDate, startTime));

    const idxEnd = targetToColIdx['endTime'];
    const idxDur = targetToColIdx['duration'];
    const providedDuration = idxDur !== undefined && cols[idxDur]
      ? parseDurationToMs(cols[idxDur])
      : 0;
    const startTimestamp = toTimestamp(eventDate, startTime);
    const rawEnd = idxEnd !== undefined ? cols[idxEnd]?.trim() || '' : '';
    const endTime = rawEnd ? parseTimeValue(rawEnd) : undefined;
    if (rawEnd && !endTime) {
      result.invalidRows++;
      if (result.errors.length < 10) result.errors.push(`Linha ${i + 1}: hora de fim inválida; use HH:MM ou HH:MM:SS.`);
      continue;
    }
    let endTimestamp: number;
    if (endTime) {
      endTimestamp = toTimestamp(eventDate, endTime);
      if (endTimestamp < startTimestamp || (endTimestamp === startTimestamp && providedDuration === 0)) {
        endTimestamp += 24 * 60 * 60 * 1000;
      }
    } else {
      endTimestamp = startTimestamp + (providedDuration > 0 ? providedDuration : 15 * 60 * 1000);
    }
    const durationMs = providedDuration > 0 ? providedDuration : endTimestamp - startTimestamp;
    const endTimeStr = formatTimeValue(endTimestamp);

    const totalSec = Math.floor(durationMs / 1000);
    const durH = Math.floor(totalSec / 3600).toString().padStart(2, '0');
    const durM = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
    const durS = (totalSec % 60).toString().padStart(2, '0');
    const durationFormatted = `${durH}:${durM}:${durS}`;

    // 4.5. Turno da Paragem
    const idxShift = targetToColIdx['shift'];
    const shiftVal =
      idxShift !== undefined && cols[idxShift] && cols[idxShift].trim()
        ? cols[idxShift].trim()
        : getShiftFromTimeString(startTimeStr).name;

    // 5. Pessoas
    const idxInit = targetToColIdx['initiatedBy'];
    const initiatedBy =
      idxInit !== undefined && cols[idxInit]
        ? cols[idxInit].trim()
        : 'Operador de Turno';

    const idxClose = targetToColIdx['closedBy'];
    const closedBy =
      idxClose !== undefined && cols[idxClose]
        ? cols[idxClose].trim()
        : initiatedBy;

    // 6. Avaria e Intervenção
    const idxType = targetToColIdx['stoppageType'];
    const stoppageType =
      idxType !== undefined && cols[idxType]
        ? cols[idxType].trim()
        : 'Avaria Geral';

    const idxDesc = targetToColIdx['stoppageDescription'];
    const stoppageDescription =
      idxDesc !== undefined && cols[idxDesc]
        ? cols[idxDesc].trim()
        : 'Registo importado da versão anterior da aplicação.';

    const idxAction = targetToColIdx['actionsTaken'];
    const actionsTaken =
      idxAction !== undefined && cols[idxAction]
        ? cols[idxAction].trim()
        : 'Intervenção técnica concluída com sucesso.';

    const idxObs = targetToColIdx['otherObservations'];
    const otherObservations =
      idxObs !== undefined && cols[idxObs] && cols[idxObs].trim()
        ? cols[idxObs].trim()
        : undefined;

    // 7. Prioridade e Estado da Avaria
    const idxPriority = targetToColIdx['priority'];
    let priorityVal: any = 'Média';
    if (idxPriority !== undefined && cols[idxPriority]) {
      const rawP = cols[idxPriority].trim().toLowerCase();
      if (rawP.includes('crit') || rawP.includes('crít')) priorityVal = 'Crítica';
      else if (rawP.includes('alt')) priorityVal = 'Alta';
      else if (rawP.includes('baix')) priorityVal = 'Baixa';
      else priorityVal = 'Média';
    }

    const idxStatus = targetToColIdx['status'];
    let statusVal: any = 'Resolvido';
    if (idxStatus !== undefined && cols[idxStatus]) {
      const rawS = cols[idxStatus].trim().toLowerCase();
      if (rawS.includes('decorr') || rawS.includes('curso') || rawS.includes('prog')) statusVal = 'Em Decorrer';
      else if (rawS.includes('pend') || rawS.includes('aguard')) statusVal = 'Pendente';
      else statusVal = 'Resolvido';
    }

    // 8. A máquina parou? (Sim/Não) — vazio ou não reconhecido fica por indicar
    const idxStopped = targetToColIdx['machineStopped'];
    let machineStopped: boolean | undefined;
    if (idxStopped !== undefined && cols[idxStopped] && cols[idxStopped].trim()) {
      const rawStopped = normalizeHeader(cols[idxStopped]);
      if (rawStopped.startsWith('nao') || ['n', 'no', 'false', '0', 'continuou'].includes(rawStopped)) {
        machineStopped = false;
      } else if (
        rawStopped.startsWith('sim') ||
        ['s', 'y', 'yes', 'true', '1', 'x', 'parou'].includes(rawStopped)
      ) {
        machineStopped = true;
      }
    }

    const record: StoppageRecord = {
      id: `imported-${Date.now()}-${i}-${machineCode}`,
      machineId: machineCode,
      machineName: `Máquina ${machineCode}`,
      date: dateStr,
      startTime: startTimeStr,
      endTime: endTimeStr,
      startTimestamp,
      endTimestamp,
      durationMs,
      durationFormatted,
      shift: shiftVal,
      priority: priorityVal,
      status: statusVal,
      machineStopped,
      initiatedBy,
      closedBy,
      stoppageType,
      stoppageDescription,
      actionsTaken,
      otherObservations,
      createdAt: Date.now() - (rows.length - i) * 60000,
    };

    result.records.push(record);
    result.validRows++;
    result.totalDurationMs += durationMs;
  }

  result.machinesFound = Array.from(machinesSet).sort();
  return result;
}

/**
 * Função de retrocompatibilidade para o parser direto
 */
export function parseCSVStoppages(csvText: string): CSVParseResult {
  return parseCSVStoppagesWithMapping(csvText);
}
