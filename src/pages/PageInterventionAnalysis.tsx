import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  CheckCircle,
  Clock,
  Download,
  Info,
  Layers,
  Sliders,
  Wrench,
} from 'lucide-react';
import { HeaderLogo } from '../components/HeaderLogo';
import { MACHINES_DATA } from '../data/initialData';
import type { ActiveDowntime, StoppageRecord } from '../types/manutrack';
import { exportStoppageRecordsCSV } from '../utils/csvExport';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';
import { getInterventionAnalytics } from '../utils/interventionAnalytics';
import { getShiftFromTimeString } from '../utils/shift';
import { isTuningRecord } from '../utils/taxonomy';

interface PageInterventionAnalysisProps {
  records: StoppageRecord[];
  activeDowntimes: ActiveDowntime[];
  onBackToHome: () => void;
}

type TimeframeFilter = 'all' | '24h' | '7days' | '30days';
type LineFilter = 'all' | 'linha1' | 'linha2' | 'linha3';

const TIME_WINDOWS: Record<Exclude<TimeframeFilter, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7days': 7 * 24 * 60 * 60 * 1000,
  '30days': 30 * 24 * 60 * 60 * 1000,
};

function getMachineLine(machineId: string): string {
  const number = Number.parseInt(machineId.replace(/\D/g, ''), 10);
  if (number >= 21 && number <= 30) return 'Linha 3';
  if (number >= 11 && number <= 20) return 'Linha 2';
  return 'Linha 1';
}

function getRecordTimestamp(record: StoppageRecord): number {
  return record.startTimestamp || record.createdAt || 0;
}

function formatDuration(milliseconds: number): string {
  const safeMilliseconds = Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
  const totalMinutes = Math.round(safeMilliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
}

function getRecordMachineState(record: StoppageRecord): string {
  if (record.machineStopped === true) return 'Sim';
  if (record.machineStopped === false) return 'Não';
  return 'Sem indicação';
}

function getStageMinutes(record: StoppageRecord): number {
  return (record.stages ?? []).reduce((total, stage) => {
    return total + (Number.isFinite(stage.durationMinutes) && stage.durationMinutes > 0
      ? stage.durationMinutes
      : 0);
  }, 0);
}

function getDisplayShift(record: StoppageRecord): string {
  return record.shift || (record.startTime
    ? getShiftFromTimeString(record.startTime).name
    : 'Turno não indicado');
}

export const PageInterventionAnalysis: React.FC<PageInterventionAnalysisProps> = ({
  records,
  activeDowntimes,
  onBackToHome,
}) => {
  const [timeFilter, setTimeFilter] = useState<TimeframeFilter>('all');
  const [lineFilter, setLineFilter] = useState<LineFilter>('all');
  const [selectedMachineId, setSelectedMachineId] = useState('all');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const lineMachines = useMemo(() => {
    if (lineFilter === 'all') return MACHINES_DATA;
    const lineNumber = lineFilter === 'linha1' ? 1 : lineFilter === 'linha2' ? 2 : 3;
    return MACHINES_DATA.filter((machine) => getMachineLine(machine.id) === `Linha ${lineNumber}`);
  }, [lineFilter]);

  const matchesTimeFilter = (timestamp: number, now: number): boolean => {
    if (timeFilter === 'all') return true;
    if (!timestamp) return false;
    const elapsed = now - timestamp;
    return elapsed >= 0 && elapsed <= TIME_WINDOWS[timeFilter];
  };

  const scopedRecords = useMemo(() => {
    const now = Date.now();
    return records.filter((record) => {
      const matchesLine =
        lineFilter === 'all' || getMachineLine(record.machineId) === `Linha ${lineFilter.slice(-1)}`;
      const matchesMachine =
        selectedMachineId === 'all' || record.machineId === selectedMachineId;
      return matchesLine && matchesMachine && matchesTimeFilter(getRecordTimestamp(record), now);
    });
  }, [records, timeFilter, lineFilter, selectedMachineId]);

  const scopedActiveDowntimes = useMemo(() => {
    return activeDowntimes.filter((downtime) => {
      const matchesLine =
        lineFilter === 'all' || getMachineLine(downtime.machineId) === `Linha ${lineFilter.slice(-1)}`;
      const matchesMachine =
        selectedMachineId === 'all' || downtime.machineId === selectedMachineId;
      return matchesLine && matchesMachine;
    });
  }, [activeDowntimes, lineFilter, selectedMachineId]);

  const analytics = useMemo(
    () => getInterventionAnalytics(scopedRecords),
    [scopedRecords]
  );

  const priorityCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Crítica: 0,
      Alta: 0,
      Média: 0,
      Baixa: 0,
    };
    scopedRecords.forEach((record) => {
      const priority = record.priority || 'Média';
      counts[priority] = (counts[priority] ?? 0) + 1;
    });
    return counts;
  }, [scopedRecords]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      'Em Decorrer': 0,
      Pendente: 0,
      Resolvido: 0,
    };
    scopedRecords.forEach((record) => {
      const status = record.status || 'Resolvido';
      counts[status] = (counts[status] ?? 0) + 1;
    });
    return counts;
  }, [scopedRecords]);

  const tuningDetails = useMemo(() => {
    const springActions: Record<string, number> = {};
    const mechanicalComponents: Record<string, number> = {};
    const adjustmentTypes: Record<string, number> = {};

    scopedRecords.filter(isTuningRecord).forEach((record) => {
      (record.springAdjustments ?? []).forEach((action) => {
        springActions[action] = (springActions[action] ?? 0) + 1;
      });
      (record.mechanicalAdjustments ?? []).forEach((adjustment) => {
        mechanicalComponents[adjustment.component] =
          (mechanicalComponents[adjustment.component] ?? 0) + 1;
        (adjustment.adjustmentTypes ?? []).forEach((type) => {
          adjustmentTypes[type] = (adjustmentTypes[type] ?? 0) + 1;
        });
      });
    });

    return {
      springActions: Object.entries(springActions).sort((a, b) => b[1] - a[1]),
      mechanicalComponents: Object.entries(mechanicalComponents).sort((a, b) => b[1] - a[1]),
      adjustmentTypes: Object.entries(adjustmentTypes).sort((a, b) => b[1] - a[1]),
    };
  }, [scopedRecords]);

  const machineRows = useMemo(() => {
    return lineMachines
      .map((machine) => ({
        ...machine,
        metrics: analytics.byMachine[machine.id],
      }))
      .sort((a, b) => {
        const countDifference = (b.metrics?.count ?? 0) - (a.metrics?.count ?? 0);
        if (countDifference !== 0) return countDifference;
        return (b.metrics?.elapsedMs ?? 0) - (a.metrics?.elapsedMs ?? 0);
      });
  }, [analytics.byMachine, lineMachines]);

  const typeRows = useMemo(
    () =>
      Object.entries(analytics.byType).sort(
        (a, b) => b[1].count - a[1].count || b[1].elapsedMs - a[1].elapsedMs
      ),
    [analytics.byType]
  );

  const recentRecords = useMemo(
    () =>
      [...scopedRecords]
        .sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a))
        .slice(0, 10),
    [scopedRecords]
  );

  const technicalTimeCoverage =
    analytics.totalCount > 0
      ? Math.round((analytics.recordsWithTechnicalTime / analytics.totalCount) * 100)
      : 0;

  const handleExport = () => {
    playSuccessChime();
    const prefix = `stoptrack_intervencoes_${lineFilter}_${timeFilter}`;
    exportStoppageRecordsCSV(scopedRecords, prefix);
    setSuccessMessage(`${scopedRecords.length} registos exportados com sucesso.`);
    window.setTimeout(() => setSuccessMessage(null), 3500);
  };

  return (
    <div className="flex min-h-screen flex-col px-3.5 py-5 pb-28 sm:px-6">
      <HeaderLogo subtitle="Análise de Intervenções" />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={() => {
            playIndustrialClick();
            onBackToHome();
          }}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Voltar ao Menu Principal</span>
        </button>

        <button
          type="button"
          onClick={handleExport}
          disabled={scopedRecords.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-950/70 px-3.5 py-2 text-xs font-bold text-sky-300 shadow-sm transition-colors hover:bg-sky-900/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Exportar registos CSV</span>
        </button>
      </div>

      {successMessage && (
        <div
          role="status"
          className="mt-3 flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-950/90 p-3 text-xs font-semibold text-sky-200 shadow-md"
        >
          <CheckCircle className="h-4 w-4 shrink-0 text-sky-400" />
          <span>{successMessage}</span>
        </div>
      )}

      <main className="mt-5 space-y-4">
        <header className="space-y-1">
          <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
            Intervenções e Fiabilidade
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
            Volume, duração e distribuição do trabalho por máquina, tipo e turno.
          </p>
        </header>

        <section
          aria-label="Filtros da análise"
          className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:grid-cols-3"
        >
          <div>
            <label htmlFor="analysis-period" className="mb-1 block text-xs font-semibold text-slate-300">
              Período
            </label>
            <select
              id="analysis-period"
              value={timeFilter}
              onChange={(event) => setTimeFilter(event.target.value as TimeframeFilter)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            >
              <option value="all">Todo o histórico</option>
              <option value="24h">Últimas 24 horas</option>
              <option value="7days">Últimos 7 dias</option>
              <option value="30days">Últimos 30 dias</option>
            </select>
          </div>
          <div>
            <label htmlFor="analysis-line" className="mb-1 block text-xs font-semibold text-slate-300">
              Linha
            </label>
            <select
              id="analysis-line"
              value={lineFilter}
              onChange={(event) => {
                setLineFilter(event.target.value as LineFilter);
                setSelectedMachineId('all');
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
            >
              <option value="all">Todas as linhas</option>
              <option value="linha1">Linha 1 · F01–F10</option>
              <option value="linha2">Linha 2 · F11–F20</option>
              <option value="linha3">Linha 3 · F21–F30</option>
            </select>
          </div>
          <div>
            <label htmlFor="analysis-machine" className="mb-1 block text-xs font-semibold text-slate-300">
              Máquina
            </label>
            <select
              id="analysis-machine"
              value={selectedMachineId}
              onChange={(event) => setSelectedMachineId(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            >
              <option value="all">Todas as máquinas</option>
              {lineMachines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.code} · {machine.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section aria-label="Resumo das intervenções" className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/90">
          <dl className="grid grid-cols-2 divide-x divide-y divide-slate-800 sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
            <div className="p-3 sm:p-4">
              <dt className="text-xs font-semibold text-slate-300">Intervenções</dt>
              <dd className="mt-1 font-mono text-2xl font-black tabular-nums text-white">{analytics.totalCount}</dd>
              <dd className="text-xs text-slate-400">{analytics.tuningCount} afinações</dd>
            </div>
            <div className="p-3 sm:p-4">
              <dt className="text-xs font-semibold text-slate-300">Máquinas afetadas</dt>
              <dd className="mt-1 font-mono text-2xl font-black tabular-nums text-amber-300">{analytics.machinesAffected}</dd>
              <dd className="text-xs text-slate-400">no período selecionado</dd>
            </div>
            <div className="p-3 sm:p-4">
              <dt className="text-xs font-semibold text-slate-300">Tempo decorrido</dt>
              <dd className="mt-1 font-mono text-2xl font-black tabular-nums text-sky-300">{formatDuration(analytics.elapsedMs)}</dd>
              <dd className="text-xs text-slate-400">duração das ocorrências</dd>
            </div>
            <div className="p-3 sm:p-4">
              <dt className="text-xs font-semibold text-slate-300">Tempo técnico registado</dt>
              <dd className="mt-1 font-mono text-2xl font-black tabular-nums text-emerald-300">{formatDuration(analytics.technicalMinutes * 60000)}</dd>
              <dd className="text-xs text-slate-400">
                etapas em {analytics.recordsWithTechnicalTime}/{analytics.totalCount} registos
              </dd>
            </div>
            <div className="col-span-2 p-3 sm:col-span-1 sm:p-4">
              <dt className="text-xs font-semibold text-slate-300">Em curso agora</dt>
              <dd className="mt-1 font-mono text-2xl font-black tabular-nums text-rose-300">{scopedActiveDowntimes.length}</dd>
              <dd className="text-xs text-slate-400">intervenções ativas</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
            <div className="space-y-1 text-xs leading-relaxed text-slate-300">
              <p>
                <strong className="text-white">Tempo decorrido</strong> mede a duração total da ocorrência.
                <strong className="text-white"> Tempo técnico</strong> soma as etapas registadas e pode estar incompleto.
              </p>
              <p>
                A marcação “máquina parou” indica apenas se houve paragem, não os minutos parados.
                Uma afinação pode alternar entre paragem e funcionamento; por isso, esta página não calcula OEE nem tempo efetivo de paragem.
              </p>
              <p>
                Referência planeada para futura análise: 16 horas por dia quando a máquina é marcada como disponível.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-800 pt-2 text-xs text-slate-400">
            <span>Máquina parada: <strong className="text-rose-300">{analytics.machineStoppedCount}</strong></span>
            <span>Sem paragem: <strong className="text-emerald-300">{analytics.machineRunningCount}</strong></span>
            <span>Sem indicação: <strong className="text-amber-300">{analytics.machineStateUnknownCount}</strong></span>
            <span>Cobertura de etapas: <strong className="text-white">{technicalTimeCoverage}%</strong></span>
          </div>
        </section>

        {scopedActiveDowntimes.length > 0 && (
          <section className="rounded-xl border border-rose-500/30 bg-slate-900/90 p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-rose-300" />
              <h2 className="text-sm font-bold text-white">Intervenções em curso</h2>
            </div>
            <ul className="divide-y divide-slate-800">
              {scopedActiveDowntimes.map((downtime) => (
                <li key={downtime.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-amber-300">
                      {downtime.machineId} <span className="font-sans font-medium text-slate-200">{downtime.machineName}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      {downtime.currentStage || 'Etapa não indicada'} · início {downtime.startTimeFormatted}
                    </p>
                  </div>
                  <span className="text-xs text-slate-300">
                    {downtime.assignedTechnician || 'Técnico não atribuído'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-amber-300" />
            <div>
              <h2 className="text-sm font-bold text-white">Carga por máquina</h2>
              <p className="text-xs text-slate-400">Selecione uma máquina para filtrar toda a análise.</p>
            </div>
          </div>
          {analytics.totalCount === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-700 p-5 text-center text-sm text-slate-400">
              Não existem intervenções neste período e âmbito. Altere os filtros para consultar outros registos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th scope="col" className="px-2 py-2 font-semibold">Máquina</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Intervenções</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Tipo frequente</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Tempo decorrido</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Tempo técnico</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Parou / Não / ?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {machineRows.map((machine) => {
                    const metrics = machine.metrics;
                    const dominantType = metrics
                      ? Object.entries(metrics.typeCounts).sort((a, b) => b[1] - a[1])[0]
                      : undefined;
                    return (
                      <tr key={machine.id} className="text-slate-300">
                        <th scope="row" className="px-2 py-2 font-normal">
                          <button
                            type="button"
                            onClick={() => setSelectedMachineId(
                              selectedMachineId === machine.id ? 'all' : machine.id
                            )}
                            className="font-mono font-bold text-amber-300 hover:text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                            aria-pressed={selectedMachineId === machine.id}
                          >
                            {machine.code}
                          </button>
                          <span className="ml-2 text-slate-400">{machine.name}</span>
                        </th>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">{metrics?.count ?? 0}</td>
                        <td className="max-w-48 truncate px-2 py-2">{dominantType?.[0] ?? '—'}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">{formatDuration(metrics?.elapsedMs ?? 0)}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">{formatDuration((metrics?.technicalMinutes ?? 0) * 60000)}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {metrics?.machineStoppedCount ?? 0} / {metrics?.machineRunningCount ?? 0} / {metrics?.machineStateUnknownCount ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 text-sky-300" />
              <h2 className="text-sm font-bold text-white">Intervenções por tipo</h2>
            </div>
            {typeRows.length === 0 ? (
              <p className="text-sm text-slate-400">Sem tipos de intervenção neste período.</p>
            ) : (
              <ul className="space-y-3">
                {typeRows.map(([type, group]) => {
                  const maxCount = typeRows[0][1].count;
                  return (
                    <li key={type}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate font-medium text-slate-200">{type}</span>
                        <span className="shrink-0 font-mono text-white">
                          {group.count} · {formatDuration(group.elapsedMs)}
                        </span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-slate-800"
                        role="img"
                        aria-label={`${group.count} intervenções de tipo ${type}`}
                      >
                        <div
                          className="h-full rounded-full bg-sky-400"
                          style={{ width: `${Math.max(3, (group.count / maxCount) * 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-slate-400">Cada ocorrência é contada uma vez; o tempo mostrado é decorrido, não tempo de máquina parada.</p>
          </section>

          <section className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-300" />
              <h2 className="text-sm font-bold text-white">Distribuição por turno</h2>
            </div>
            <ul className="divide-y divide-slate-800">
              {Object.entries(analytics.byShift)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([shift, group]) => (
                  <li key={shift} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="text-sm text-slate-200">{shift}</span>
                    <span className="text-right font-mono text-xs text-slate-300">
                      {group.count} intervenções · {formatDuration(group.elapsedMs)}
                    </span>
                  </li>
                ))}
              {Object.keys(analytics.byShift).length === 0 && (
                <li className="text-sm text-slate-400">Sem registos no período.</li>
              )}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-3 text-xs">
              {Object.entries(statusCounts).map(([status, count]) => (
                <span key={status} className="rounded-md bg-slate-800 px-2 py-1 text-slate-300">
                  {status}: <strong className="text-white">{count}</strong>
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {Object.entries(priorityCounts).map(([priority, count]) => (
                <span key={priority} className="rounded-md bg-slate-800 px-2 py-1 text-slate-300">
                  Prioridade {priority.toLowerCase()}: <strong className="text-white">{count}</strong>
                </span>
              ))}
            </div>
          </section>
        </div>

        {analytics.tuningCount > 0 && (
          <section className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sliders className="h-4 w-4 text-sky-300" />
              <div>
                <h2 className="text-sm font-bold text-white">Detalhe das afinações</h2>
                <p className="text-xs text-slate-400">A duração continua a representar a intervenção completa, incluindo períodos de funcionamento.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['Ações de mola', tuningDetails.springActions],
                ['Componentes mecânicos', tuningDetails.mechanicalComponents],
                ['Tipo de regulação', tuningDetails.adjustmentTypes],
              ].map(([label, entries]) => (
                <div key={label as string}>
                  <h3 className="mb-2 text-xs font-semibold text-slate-300">{label as string}</h3>
                  {(entries as [string, number][]).length === 0 ? (
                    <p className="text-xs text-slate-500">Sem detalhe registado.</p>
                  ) : (
                    <ul className="space-y-1">
                      {(entries as [string, number][]).slice(0, 6).map(([name, count]) => (
                        <li key={name} className="flex justify-between gap-2 text-xs">
                          <span className="truncate text-slate-300">{name}</span>
                          <span className="font-mono text-sky-300">{count}×</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white">Intervenções recentes</h2>
            <span className="text-xs text-slate-400">{scopedRecords.length} no âmbito selecionado</span>
          </div>
          {recentRecords.length === 0 ? (
            <p className="text-sm text-slate-400">Ainda não existem registos para estes filtros.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th scope="col" className="px-2 py-2 font-semibold">Data / hora</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Máquina</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Tipo / estado</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Parou?</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Decorrido</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Técnico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {recentRecords.map((record) => (
                    <tr key={record.id} className="text-slate-300">
                      <td className="whitespace-nowrap px-2 py-2">{record.date} {record.startTime}</td>
                      <td className="whitespace-nowrap px-2 py-2 font-mono text-amber-300">{record.machineId}</td>
                      <td className="px-2 py-2">
                        <span className="block font-medium text-slate-100">{record.stoppageType || 'Não especificado'}</span>
                        <span className="text-slate-400">{record.status || 'Resolvido'}</span>
                      </td>
                      <td className="px-2 py-2">{getRecordMachineState(record)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-mono">{formatDuration(record.durationMs || 0)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                        {getStageMinutes(record) > 0 ? `${getStageMinutes(record)} min` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
