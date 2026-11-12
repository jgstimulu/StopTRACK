import { StoppageRecord, Operator, StoppageTypeItem } from '../types/manutrack';
import { MACHINES_DATA } from '../data/initialData';
import {
  formatMechanicalAdjustments,
  formatSpringAdjustments,
  getInterventionClassification,
  getReportingTotals,
  isRecordMachineStopped,
  isTuningRecord,
} from './taxonomy';

/**
 * Utilitário profissional de exportação CSV para o StopTRACK.
 * Formato otimizado para Microsoft Excel Europeu:
 * - Separador ponto e vírgula (;)
 * - UTF-8 com Byte Order Mark (\uFEFF) para preservar acentuações (á, é, ç, ã)
 * - Escape rigoroso de aspas duplas (" -> "")
 */

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

function triggerDownload(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatStages(stages: StoppageRecord['stages']): string {
  if (!stages || stages.length === 0) return '';
  return stages
    .map((s) => {
      const lvl = s.level || (s.order === 1 ? 1 : 2);
      const lvlPrefix =
        lvl === 1 ? 'N1-Diagnóstico' : lvl === 2 ? 'N2-Intervenção' : 'N3-Fecho';
      return `[${lvlPrefix}] #${s.order} ${s.type} [${s.durationMinutes}m] (${s.technician || 'Sem técnico'}${s.description ? `: ${s.description}` : ''})`;
    })
    .join(' | ');
}

/**
 * Exporta lista de registos de paragem (filtrados ou totais)
 */
export function exportStoppageRecordsCSV(
  records: StoppageRecord[],
  filenamePrefix = 'stoptrack_paragens'
): void {
  const dateStr = new Date().toISOString().slice(0, 10);
  const headers = [
    'ID Paragem',
    'Código Máquina',
    'Nome Máquina',
    'Data (AAAA-MM-DD)',
    'Turno',
    'Prioridade',
    'Estado da Avaria',
    'A Máquina Parou?',
    'É Afinação?',
    'Hora Início',
    'Hora Fim',
    'Duração (HH:MM:SS)',
    'Duração (Minutos)',
    'Duração (Segundos)',
    'Quem Iniciou',
    'Quem Fechou',
    'Tipo de Paragem',
    'Classificação da Intervenção',
    'Ajustes de Mola',
    'Ajustes Mecânicos',
    'Subcategoria',
    'Causa Típica',
    'Descrição da Avaria',
    'Ação Realizada / Intervenção',
    'Ações Corretivas',
    'Palavras-chave',
    'Etapas Detalhadas (Sub-fases)',
    'Observações Adicionais',
    'Data/Hora de Registo (Timestamp)',
  ];

  const rows = records.map((r) => {
    const durationMinutes = Math.round((r.durationMs / 60000) * 10) / 10;
    const durationSeconds = Math.round(r.durationMs / 1000);
    const createdDateStr = r.createdAt ? new Date(r.createdAt).toLocaleString('pt-PT') : '';
    const stagesStr = formatStages(r.stages);

    return [
      escapeCsvCell(r.id),
      escapeCsvCell(r.machineId),
      escapeCsvCell(r.machineName || `Máquina ${r.machineId}`),
      escapeCsvCell(r.date),
      escapeCsvCell(r.shift || '1º Turno'),
      escapeCsvCell(r.priority || 'Média'),
      escapeCsvCell(r.status || 'Resolvido'),
      escapeCsvCell(r.machineStopped === true ? 'Sim' : r.machineStopped === false ? 'Não' : ''),
      escapeCsvCell(isTuningRecord(r) ? 'Sim' : 'Não'),
      escapeCsvCell(r.startTime),
      escapeCsvCell(r.endTime),
      escapeCsvCell(r.durationFormatted),
      escapeCsvCell(durationMinutes.toString().replace('.', ',')),
      escapeCsvCell(durationSeconds),
      escapeCsvCell(r.initiatedBy),
      escapeCsvCell(r.closedBy),
      escapeCsvCell(r.stoppageType),
      escapeCsvCell(getInterventionClassification(r)),
      escapeCsvCell(formatSpringAdjustments(r)),
      escapeCsvCell(formatMechanicalAdjustments(r)),
      escapeCsvCell(r.subcategory || ''),
      escapeCsvCell(r.typicalCause || ''),
      escapeCsvCell(r.stoppageDescription),
      escapeCsvCell(r.actionsTaken),
      escapeCsvCell(r.correctiveActions || ''),
      escapeCsvCell((r.keywords ?? []).join('; ')),
      escapeCsvCell(stagesStr),
      escapeCsvCell(r.otherObservations || ''),
      escapeCsvCell(createdDateStr),
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  triggerDownload(csvContent, `${filenamePrefix}_${dateStr}.csv`);
}

/**
 * Exporta Indicadores de Performance OEE e Métricas por Máquina.
 *
 * Os indicadores de paragem (MTTR, tempo parado e distribuições) consideram
 * apenas registos em que a máquina parou. O tempo de afinação é reportado
 * separadamente, pois pode incluir marcha de ensaio.
 */
export function exportOeeKpiCSV(
  records: StoppageRecord[],
  filenamePrefix = 'stoptrack_indicadores_oee'
): void {
  const dateStr = new Date().toISOString().slice(0, 10);
  const totals = getReportingTotals(records);
  const downtimeRecords = records.filter(isRecordMachineStopped);
  const tuningRecords = records.filter(isTuningRecord);

  const downtimeHours = Math.round((totals.downtimeMinutes / 60) * 10) / 10;
  const tuningHours = Math.round((totals.tuningMinutes / 60) * 10) / 10;

  // Cálculos por Máquina (paragens reais + tempo de afinação associado)
  const machineMetrics = MACHINES_DATA.map((m) => {
    const machineDowntime = downtimeRecords.filter((r) => r.machineId === m.id);
    const machineTuning = tuningRecords.filter((r) => r.machineId === m.id);
    const count = machineDowntime.length;
    const durationMs = machineDowntime.reduce((acc, r) => acc + (r.durationMs || 0), 0);
    const minutes = Math.round(durationMs / 60000);
    const hours = Math.round((minutes / 60) * 10) / 10;
    const machineMttr = count > 0 ? Math.round(minutes / count) : 0;
    const tuningDurationMs = machineTuning.reduce((acc, r) => acc + (r.durationMs || 0), 0);
    const tuningMinutes = Math.round(tuningDurationMs / 60000);
    const percentOfTotalDowntime =
      totals.downtimeMinutes > 0
        ? Math.round((minutes / totals.downtimeMinutes) * 1000) / 10
        : 0;

    return {
      id: m.id,
      name: m.name,
      section: m.section,
      count,
      minutes,
      hours,
      mttr: machineMttr,
      tuningCount: machineTuning.length,
      tuningMinutes,
      percentOfTotal: percentOfTotalDowntime,
    };
  }).sort((a, b) => b.minutes - a.minutes);

  // Cálculos por Tipo de Paragem (apenas paragens reais)
  const typeMap = new Map<string, { count: number; durationMs: number }>();
  downtimeRecords.forEach((r) => {
    const cur = typeMap.get(r.stoppageType) || { count: 0, durationMs: 0 };
    typeMap.set(r.stoppageType, {
      count: cur.count + 1,
      durationMs: cur.durationMs + (r.durationMs || 0),
    });
  });

  // Tempo de afinação por tipo (inclui intervenções com a máquina em marcha de ensaio)
  const tuningTypeMap = new Map<string, { count: number; durationMs: number }>();
  tuningRecords.forEach((r) => {
    const cur = tuningTypeMap.get(r.stoppageType) || { count: 0, durationMs: 0 };
    tuningTypeMap.set(r.stoppageType, {
      count: cur.count + 1,
      durationMs: cur.durationMs + (r.durationMs || 0),
    });
  });

  const lines: string[] = [];

  // Seção 1: Resumo Executivo
  lines.push('=== STOPTRACK - RELATÓRIO EXECUTIVO DE INDICADORES E OEE ===');
  lines.push(`"Data de Extração";"${new Date().toLocaleString('pt-PT')}"`);
  lines.push(`"Total de Registos Analisados";"${totals.totalCount}"`);
  lines.push(`"Total de Paragens Reais (Máquina Parada)";"${totals.downtimeCount}"`);
  lines.push(`"Total de Registos de Afinação";"${totals.tuningCount}"`);
  lines.push(`"Tempo Total em Paragem (Minutos)";"${totals.downtimeMinutes}"`);
  lines.push(`"Tempo Total em Paragem (Horas)";"${downtimeHours.toString().replace('.', ',')}"`);
  lines.push(`"Tempo Total de Afinação (Minutos)";"${totals.tuningMinutes}"`);
  lines.push(`"Tempo Total de Afinação (Horas)";"${tuningHours.toString().replace('.', ',')}"`);
  lines.push(`"MTTR Médio Global (Minutos por Paragem Real)";"${totals.mttrMinutes}"`);
  lines.push('');
  lines.push('"Nota";"OEE, MTTR, MTBF e distribuições usam apenas paragens reais. O tempo de afinação é contabilizado à parte."');
  lines.push('');

  // Seção 2: Desempenho e Paragens por Máquina
  lines.push('=== DETALHE DE PARAGENS POR MÁQUINA (F01 a F30) ===');
  const machineHeaders = [
    'Código Máquina',
    'Nome Máquina',
    'Secção / Linha',
    'Nº de Paragens Reais',
    'Tempo Parado (Minutos)',
    'Tempo Parado (Horas)',
    'MTTR da Máquina (Minutos)',
    'Nº de Afinações',
    'Tempo de Afinação (Minutos)',
    '% do Tempo Total Parado',
  ];
  lines.push(machineHeaders.join(';'));

  machineMetrics.forEach((m) => {
    lines.push([
      escapeCsvCell(m.id),
      escapeCsvCell(m.name),
      escapeCsvCell(m.section),
      escapeCsvCell(m.count),
      escapeCsvCell(m.minutes),
      escapeCsvCell(m.hours.toString().replace('.', ',')),
      escapeCsvCell(m.mttr),
      escapeCsvCell(m.tuningCount),
      escapeCsvCell(m.tuningMinutes),
      escapeCsvCell(`${m.percentOfTotal.toString().replace('.', ',')}%`),
    ].join(';'));
  });

  lines.push('');

  // Seção 3: Distribuição por Tipo de Paragem (paragens reais)
  lines.push('=== DISTRIBUIÇÃO POR TIPO DE PARAGEM REAL ===');
  const typeHeaders = [
    'Tipo de Paragem',
    'Ocorrências',
    'Tempo Acumulado (Minutos)',
    'MTTR por Categoria (Min)',
    '% das Ocorrências',
    '% do Tempo Parado',
  ];
  lines.push(typeHeaders.join(';'));

  Array.from(typeMap.entries())
    .sort((a, b) => b[1].durationMs - a[1].durationMs)
    .forEach(([typeName, data]) => {
      const typeMinutes = Math.round(data.durationMs / 60000);
      const catMttr = data.count > 0 ? Math.round(typeMinutes / data.count) : 0;
      const pct = totals.downtimeCount > 0 ? Math.round((data.count / totals.downtimeCount) * 1000) / 10 : 0;
      const timePct =
        totals.downtimeMinutes > 0 ? Math.round((typeMinutes / totals.downtimeMinutes) * 1000) / 10 : 0;
      lines.push([
        escapeCsvCell(typeName),
        escapeCsvCell(data.count),
        escapeCsvCell(typeMinutes),
        escapeCsvCell(catMttr),
        escapeCsvCell(`${pct.toString().replace('.', ',')}%`),
        escapeCsvCell(`${timePct.toString().replace('.', ',')}%`),
      ].join(';'));
    });

  lines.push('');

  // Seção 4: Tempo de Afinação por Tipo
  lines.push('=== TEMPO DE AFINAÇÃO POR TIPO (INTERVENÇÕES COM MARCHA DE ENSAIO) ===');
  if (tuningTypeMap.size === 0) {
    lines.push('"Sem registos de afinação no período analisado"');
  } else {
    const tuningHeaders = [
      'Tipo de Afinação',
      'Ocorrências',
      'Tempo Acumulado (Minutos)',
      'Tempo Médio por Afinação (Min)',
      '% do Tempo de Afinação',
    ];
    lines.push(tuningHeaders.join(';'));

    Array.from(tuningTypeMap.entries())
      .sort((a, b) => b[1].durationMs - a[1].durationMs)
      .forEach(([typeName, data]) => {
        const typeMinutes = Math.round(data.durationMs / 60000);
        const avgMinutes = data.count > 0 ? Math.round(typeMinutes / data.count) : 0;
        const timePct =
          totals.tuningMinutes > 0 ? Math.round((typeMinutes / totals.tuningMinutes) * 1000) / 10 : 0;
        lines.push([
          escapeCsvCell(typeName),
          escapeCsvCell(data.count),
          escapeCsvCell(typeMinutes),
          escapeCsvCell(avgMinutes),
          escapeCsvCell(`${timePct.toString().replace('.', ',')}%`),
        ].join(';'));
      });
  }

  const csvContent = '\uFEFF' + lines.join('\r\n');
  triggerDownload(csvContent, `${filenamePrefix}_${dateStr}.csv`);
}

/**
 * Exportação Consolidada Total (Histórico + Resumo + Configurações Ativas)
 */
export function exportConsolidatedBackupCSV(
  records: StoppageRecord[],
  operators: Operator[] = [],
  stoppageTypes: StoppageTypeItem[] = [],
  filenamePrefix = 'stoptrack_exportacao_total'
): void {
  const dateStr = new Date().toISOString().slice(0, 10);
  const totals = getReportingTotals(records);
  const lines: string[] = [];

  // Cabeçalho Geral
  lines.push('=== STOPTRACK - EXPORTAÇÃO TOTAL CONSOLIDADA ===');
  lines.push(`"Data da Exportação";"${new Date().toLocaleString('pt-PT')}"`);
  lines.push(`"Total de Registos de Paragem";"${records.length}"`);
  lines.push(`"Total de Paragens Reais (Máquina Parada)";"${totals.downtimeCount}"`);
  lines.push(`"Total de Registos de Afinação";"${totals.tuningCount}"`);
  lines.push(`"Tempo Total em Paragem (Minutos)";"${totals.downtimeMinutes}"`);
  lines.push(`"Tempo Total de Afinação (Minutos)";"${totals.tuningMinutes}"`);
  lines.push(`"Total de Operadores Registados";"${operators.length}"`);
  lines.push(`"Total de Tipos de Paragem Configurados";"${stoppageTypes.length}"`);
  lines.push('');

  // Paragens
  lines.push('=== HISTÓRICO DE PARAGENS ===');
  const recordHeaders = [
    'ID Paragem',
    'Código Máquina',
    'Nome Máquina',
    'Data (AAAA-MM-DD)',
    'Turno',
    'Prioridade',
    'Estado da Avaria',
    'A Máquina Parou?',
    'É Afinação?',
    'Hora Início',
    'Hora Fim',
    'Duração (HH:MM:SS)',
    'Duração (Minutos)',
    'Quem Iniciou',
    'Quem Fechou',
    'Tipo de Paragem',
    'Classificação da Intervenção',
    'Ajustes de Mola',
    'Ajustes Mecânicos',
    'Subcategoria',
    'Causa Típica',
    'Descrição da Avaria',
    'Ação Realizada / Intervenção',
    'Ações Corretivas',
    'Palavras-chave',
    'Observações Adicionais',
    'Timestamp Criação',
  ];
  lines.push(recordHeaders.join(';'));

  records.forEach((r) => {
    lines.push([
      escapeCsvCell(r.id),
      escapeCsvCell(r.machineId),
      escapeCsvCell(r.machineName),
      escapeCsvCell(r.date),
      escapeCsvCell(r.shift || '1º Turno'),
      escapeCsvCell(r.priority || 'Média'),
      escapeCsvCell(r.status || 'Resolvido'),
      escapeCsvCell(r.machineStopped === true ? 'Sim' : r.machineStopped === false ? 'Não' : ''),
      escapeCsvCell(isTuningRecord(r) ? 'Sim' : 'Não'),
      escapeCsvCell(r.startTime),
      escapeCsvCell(r.endTime),
      escapeCsvCell(r.durationFormatted),
      escapeCsvCell(Math.round(r.durationMs / 60000)),
      escapeCsvCell(r.initiatedBy),
      escapeCsvCell(r.closedBy),
      escapeCsvCell(r.stoppageType),
      escapeCsvCell(getInterventionClassification(r)),
      escapeCsvCell(formatSpringAdjustments(r)),
      escapeCsvCell(formatMechanicalAdjustments(r)),
      escapeCsvCell(r.subcategory || ''),
      escapeCsvCell(r.typicalCause || ''),
      escapeCsvCell(r.stoppageDescription),
      escapeCsvCell(r.actionsTaken),
      escapeCsvCell(r.correctiveActions || ''),
      escapeCsvCell((r.keywords ?? []).join('; ')),
      escapeCsvCell(r.otherObservations || ''),
      escapeCsvCell(r.createdAt || ''),
    ].join(';'));
  });

  lines.push('');

  // Operadores
  if (operators.length > 0) {
    lines.push('=== OPERADORES / TÉCNICOS CADASTRADOS ===');
    lines.push(['ID Operador', 'Nome', 'Cargo / Função', 'Pode Iniciar Paragem', 'Pode Fechar Paragem', 'Ativo'].join(';'));
    operators.forEach((op) => {
      lines.push([
        escapeCsvCell(op.id),
        escapeCsvCell(op.name),
        escapeCsvCell(op.role),
        escapeCsvCell(op.canStart ? 'Sim' : 'Não'),
        escapeCsvCell(op.canClose ? 'Sim' : 'Não'),
        escapeCsvCell(op.active ? 'Sim' : 'Não'),
      ].join(';'));
    });
    lines.push('');
  }

  // Tipos de Paragem
  if (stoppageTypes.length > 0) {
    lines.push('=== CATEGORIAS DE PARAGEM CONFIGURADAS ===');
    lines.push(['ID Tipo', 'Nome da Categoria', 'Cor', 'Descrição do Motivo', 'Ativo'].join(';'));
    stoppageTypes.forEach((st) => {
      lines.push([
        escapeCsvCell(st.id),
        escapeCsvCell(st.name),
        escapeCsvCell(st.color),
        escapeCsvCell(st.description),
        escapeCsvCell(st.active ? 'Sim' : 'Não'),
      ].join(';'));
    });
  }

  const csvContent = '\uFEFF' + lines.join('\r\n');
  triggerDownload(csvContent, `${filenamePrefix}_${dateStr}.csv`);
}
