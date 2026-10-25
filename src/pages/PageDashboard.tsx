import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  BarChart3,
  AlertTriangle,
  Clock,
  Wrench,
  CheckCircle2,
  TrendingUp,
  Download,
  CheckCircle,
  Flame,
  Activity,
  Layers,
  Gauge,
  Calendar,
  Filter,
} from 'lucide-react';
import { HeaderLogo } from '../components/HeaderLogo';
import { StoppageRecord } from '../types/manutrack';
import { STOPPAGE_TYPES } from '../data/initialData';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';
import { exportOeeKpiCSV } from '../utils/csvExport';
import { getShiftFromTimeString } from '../utils/shift';

interface PageDashboardProps {
  records: StoppageRecord[];
  onBackToHome: () => void;
}

type TimeframeFilter = 'all' | 'today' | '7days' | '30days';

export const PageDashboard: React.FC<PageDashboardProps> = ({ records, onBackToHome }) => {
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeframeFilter>('all');

  // Filter records based on selected timeframe
  const filteredRecords = useMemo(() => {
    if (timeFilter === 'all') return records;

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    return records.filter((r) => {
      const recordTime = r.startTimestamp || (r.date ? new Date(`${r.date} ${r.startTime || '00:00'}`).getTime() : 0);
      if (!recordTime) return true;
      const diffMs = now - recordTime;

      if (timeFilter === 'today') {
        return diffMs <= oneDayMs;
      }
      if (timeFilter === '7days') {
        return diffMs <= 7 * oneDayMs;
      }
      if (timeFilter === '30days') {
        return diffMs <= 30 * oneDayMs;
      }
      return true;
    });
  }, [records, timeFilter]);

  const totalCount = filteredRecords.length;
  const totalDurationMs = filteredRecords.reduce((acc, r) => acc + (r.durationMs || 0), 0);
  const totalMinutes = Math.round(totalDurationMs / 60000);
  const totalHours = (totalMinutes / 60).toFixed(1);

  // MTTR (Mean Time to Repair in minutes)
  const mttrMinutes = totalCount > 0 ? Math.round(totalMinutes / totalCount) : 0;

  // Industrial OEE Availability Calculation
  // Standard plant parameters: 30 machines, shift duration = 8h (480 min) per shift, 2 shifts = 16h/day
  // For the active scope, calculate Planned Production Time vs Downtime
  const plannedHoursScope = useMemo(() => {
    const machineCount = 30; // F01 to F30
    if (timeFilter === 'today') return machineCount * 16; // 1 day of 2 active shifts
    if (timeFilter === '7days') return machineCount * 16 * 7;
    if (timeFilter === '30days') return machineCount * 16 * 30;
    // For "all", estimate based on days span or minimum 100h
    return Math.max(300, machineCount * 16 * 5);
  }, [timeFilter]);

  const plannedMinutesScope = plannedHoursScope * 60;
  const operatingMinutes = Math.max(0, plannedMinutesScope - totalMinutes);
  const rawAvailability = plannedMinutesScope > 0 ? (operatingMinutes / plannedMinutesScope) * 100 : 100;
  const availabilityPercent = Math.min(100, Math.max(0, parseFloat(rawAvailability.toFixed(1))));

  // MTBF (Mean Time Between Failures in Operating Hours)
  const mtbfHours = totalCount > 0 ? ((operatingMinutes / 60) / totalCount).toFixed(1) : (plannedHoursScope / 30).toFixed(1);

  // Availability Benchmark Classification
  const getAvailabilityRating = (pct: number) => {
    if (pct >= 90) return { label: 'Excelente (Classe Mundial)', color: 'text-emerald-400', stroke: '#10b981', badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' };
    if (pct >= 85) return { label: 'Benchmark Industrial (>=85%)', color: 'text-sky-400', stroke: '#38bdf8', badge: 'border-sky-500/40 bg-sky-500/10 text-sky-300' };
    if (pct >= 75) return { label: 'Regular / Atenção Necessária', color: 'text-amber-400', stroke: '#f59e0b', badge: 'border-amber-500/40 bg-amber-500/10 text-amber-300' };
    return { label: 'Crítico / Intervenção Urgente', color: 'text-rose-400', stroke: '#f43f5e', badge: 'border-rose-500/40 bg-rose-500/10 text-rose-300' };
  };
  const rating = getAvailabilityRating(availabilityPercent);

  // Group by machine
  const machineCountMap = new Map<string, { count: number; durationMs: number; machineName: string }>();
  filteredRecords.forEach((r) => {
    const cur = machineCountMap.get(r.machineId) || { count: 0, durationMs: 0, machineName: r.machineName || r.machineId };
    machineCountMap.set(r.machineId, {
      count: cur.count + 1,
      durationMs: cur.durationMs + (r.durationMs || 0),
      machineName: r.machineName || cur.machineName,
    });
  });

  const sortedMachines = Array.from(machineCountMap.entries())
    .sort((a, b) => b[1].durationMs - a[1].durationMs)
    .slice(0, 5);

  // Group by stoppage type dynamically
  const typeDurationMap = new Map<string, { count: number; durationMs: number }>();
  filteredRecords.forEach((r) => {
    const type = r.stoppageType || 'Não Especificado';
    const cur = typeDurationMap.get(type) || { count: 0, durationMs: 0 };
    typeDurationMap.set(type, {
      count: cur.count + 1,
      durationMs: cur.durationMs + (r.durationMs || 0),
    });
  });

  const sortedTypes = Array.from(typeDurationMap.entries())
    .sort((a, b) => b[1].durationMs - a[1].durationMs);

  // Group by shift
  const shiftStats = {
    '1º Turno': { count: 0, durationMs: 0, label: '1º Turno', hours: '05:00 - 14:30', color: 'amber' },
    '2º Turno': { count: 0, durationMs: 0, label: '2º Turno', hours: '14:30 - 00:00', color: 'blue' },
    'Turno Noturno': { count: 0, durationMs: 0, label: 'Turno Noturno', hours: '00:00 - 05:00', color: 'purple' },
  };

  filteredRecords.forEach((r) => {
    const sName = r.shift || (r.startTime ? getShiftFromTimeString(r.startTime).name : '1º Turno');
    if (sName.includes('1')) {
      shiftStats['1º Turno'].count++;
      shiftStats['1º Turno'].durationMs += (r.durationMs || 0);
    } else if (sName.includes('2')) {
      shiftStats['2º Turno'].count++;
      shiftStats['2º Turno'].durationMs += (r.durationMs || 0);
    } else {
      shiftStats['Turno Noturno'].count++;
      shiftStats['Turno Noturno'].durationMs += (r.durationMs || 0);
    }
  });

  // Priority stats
  const priorityStats: { [key: string]: number } = {
    'Crítica': 0,
    'Alta': 0,
    'Média': 0,
    'Baixa': 0,
  };
  // Status stats
  const statusStats: { [key: string]: number } = {
    'Resolvido': 0,
    'Em Decorrer': 0,
    'Pendente': 0,
  };

  filteredRecords.forEach((r) => {
    const p = (r.priority as string) || 'Média';
    if (priorityStats[p] !== undefined) {
      priorityStats[p]++;
    } else {
      priorityStats['Média']++;
    }

    const s = (r.status as string) || 'Resolvido';
    if (statusStats[s] !== undefined) {
      statusStats[s]++;
    } else {
      statusStats['Resolvido']++;
    }
  });

  const handleExportOee = () => {
    playSuccessChime();
    exportOeeKpiCSV(filteredRecords, `stoptrack_kpi_oee_${timeFilter}`);
    setSuccessMsg('Relatório OEE e Métricas exportado com sucesso em CSV!');
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // Radial Progress Gauge calculations (Circumference for r=46: 2 * PI * 46 ≈ 289)
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * availabilityPercent) / 100;

  return (
    <div className="flex min-h-screen flex-col py-5 px-3.5 sm:px-6 pb-28">
      {/* Top Header */}
      <div>
        <HeaderLogo subtitle="Dashboard OEE & Indicadores de Manutenção" />

        {/* Navigation & Action Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              onBackToHome();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar ao Menu Principal</span>
          </button>

          <button
            type="button"
            onClick={handleExportOee}
            className="flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-950/70 px-3.5 py-2 text-xs font-bold text-sky-300 hover:bg-sky-900/60 shadow-sm transition-colors active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exportar CSV (OEE)</span>
          </button>
        </div>

        {/* Success toast */}
        {successMsg && (
          <div className="mt-3 rounded-xl border border-sky-500/40 bg-sky-950/90 p-3 text-xs font-semibold text-sky-200 shadow-md flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-sky-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Time Window Filter Tabs */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/80 p-1.5">
          <div className="flex items-center gap-1 text-[11px] font-bold">
            <span className="flex items-center gap-1 text-slate-400 px-2 hidden sm:flex">
              <Filter className="h-3 w-3" />
              <span>Período:</span>
            </span>
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'today', label: 'Hoje (24h)' },
                { id: '7days', label: 'Últimos 7 Dias' },
                { id: '30days', label: 'Últimos 30 Dias' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  playIndustrialClick();
                  setTimeFilter(t.id);
                }}
                className={`flex-1 rounded-lg py-1.5 px-2 text-center transition-all ${
                  timeFilter === t.id
                    ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* HERO OEE AVAILABILITY & RELIABILITY CARD */}
        <div className="mt-4 overflow-hidden rounded-2xl border-2 border-slate-700 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-4 sm:p-5 shadow-xl">
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-3 mb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <Gauge className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 break-words">
                  Disponibilidade Operacional (OEE Availability)
                </h3>
                <p className="text-[10px] text-slate-400">
                  Tempo Operacional Real / Tempo Planeado de Produção
                </p>
              </div>
            </div>

            <span className={`self-start px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border ${rating.badge}`}>
              {rating.label}
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-center">
            {/* Radial Gauge SVG */}
            <div className="xl:col-span-5 flex flex-col items-center justify-center py-2">
              <div className="relative flex items-center justify-center">
                <svg className="w-36 h-36 transform -rotate-90">
                  {/* Background Track */}
                  <circle
                    cx="72"
                    cy="72"
                    r={radius}
                    stroke="currentColor"
                    strokeWidth="10"
                    fill="transparent"
                    className="text-slate-800"
                  />
                  {/* Value Arc */}
                  <circle
                    cx="72"
                    cy="72"
                    r={radius}
                    stroke={rating.stroke}
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>

                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className={`text-xl font-black font-mono tabular-nums tracking-tighter ${rating.color}`}>
                    {availabilityPercent}%
                  </span>
                </div>
              </div>

              <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Disponibilidade
              </span>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                <span>Meta Mundial: &ge; 85%</span>
              </div>
            </div>

            {/* Industrial Reliability Indicators (MTTR & MTBF) */}
            <div className="xl:col-span-7 grid grid-cols-2 gap-3">
              <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="flex min-w-0 items-center gap-1.5 text-slate-400 text-xs">
                  <Wrench className="h-3.5 w-3.5 text-amber-400" />
                  <span className="min-w-0 font-bold uppercase text-[10px]">MTTR Médio</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-black font-mono text-amber-300">
                    {mttrMinutes}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">min</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Tempo Médio de Reparação
                </p>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="flex min-w-0 items-center gap-1.5 text-slate-400 text-xs">
                  <Activity className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="min-w-0 font-bold uppercase text-[10px]">MTBF Estimado</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-black font-mono text-emerald-300">
                    {mtbfHours}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">h</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Tempo Médio Entre Falhas
                </p>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="flex min-w-0 items-center gap-1.5 text-slate-400 text-xs">
                  <Clock className="h-3.5 w-3.5 text-rose-400" />
                  <span className="min-w-0 font-bold uppercase text-[10px]">Tempo em Paragem</span>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-1">
                  <span className="text-2xl font-black font-mono text-rose-400">
                    {totalHours}
                  </span>
                  <span className="text-xs text-slate-400 font-mono break-words">h ({totalMinutes}m)</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Total de minutos perdidos
                </p>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="flex min-w-0 items-center gap-1.5 text-slate-400 text-xs">
                  <Layers className="h-3.5 w-3.5 text-sky-400" />
                  <span className="min-w-0 font-bold uppercase text-[10px]">Total Intervenções</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-black font-mono text-white">
                    {totalCount}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">registos</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Ocorrências no período
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Responsive KPI Summary Cards */}
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-center">
            <span className="text-[10px] font-bold uppercase text-slate-400 block truncate">
              Total Paragens
            </span>
            <p className="mt-1 text-2xl font-black text-white font-mono">{totalCount}</p>
            <span className="text-[10px] text-slate-400">ocorrências</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-center">
            <span className="text-[10px] font-bold uppercase text-slate-400 block truncate">
              Tempo Perdido
            </span>
            <p className="mt-1 text-2xl font-black text-rose-400 font-mono">{totalMinutes}m</p>
            <span className="text-[10px] text-slate-400">{totalHours} horas</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-center">
            <span className="text-[10px] font-bold uppercase text-slate-400 block truncate">
              MTTR Médio
            </span>
            <p className="mt-1 text-2xl font-black text-amber-300 font-mono">{mttrMinutes}m</p>
            <span className="text-[10px] text-slate-400">por paragem</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-center">
            <span className="text-[10px] font-bold uppercase text-slate-400 block truncate">
              Disponibilidade
            </span>
            <p className={`mt-1 text-2xl font-black font-mono ${rating.color}`}>
              {availabilityPercent}%
            </p>
            <span className="text-[10px] text-slate-400">taxa OEE</span>
          </div>
        </div>

        {/* TOP 5 MACHINES WITH HIGHEST DOWNTIME (PARETO) */}
        <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-900/90 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-rose-400 shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Top Máquinas com Maior Tempo de Paragem (Pareto)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">F01–F30</span>
          </div>

          <div className="space-y-3">
            {sortedMachines.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">
                Sem registos de paragens no período selecionado.
              </p>
            ) : (
              sortedMachines.map(([mId, data], index) => {
                const mins = Math.round(data.durationMs / 60000);
                const percent = totalMinutes > 0 ? Math.round((mins / totalMinutes) * 100) : 0;
                return (
                  <div key={mId} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-black font-mono bg-slate-800 text-slate-400 shrink-0">
                          #{index + 1}
                        </span>
                        <span className="font-mono font-black text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded text-xs shrink-0">
                          {mId}
                        </span>
                        <span className="text-slate-300 truncate font-medium">
                          {data.machineName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-slate-400 hidden sm:inline">
                          {data.count} {data.count === 1 ? 'paragem' : 'paragens'}
                        </span>
                        <span className="font-mono font-bold text-white tabular-nums">
                          {mins}m ({percent}%)
                        </span>
                      </div>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(8, percent))}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* DISTRIBUTION BY WORK SHIFT */}
        <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-900/90 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-amber-400 shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Distribuição por Turno de Trabalho
            </h3>
          </div>

          <div className="space-y-3">
            {Object.entries(shiftStats).map(([key, item]) => {
              const mins = Math.round(item.durationMs / 60000);
              const percent = totalDurationMs > 0 ? Math.round((item.durationMs / totalDurationMs) * 100) : 0;
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">
                        {item.label}
                      </span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                        {item.hours}
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        ({item.count} {item.count === 1 ? 'ocorrência' : 'ocorrências'})
                      </span>
                    </div>
                    <span className="font-mono font-bold text-amber-300 tabular-nums shrink-0">
                      {mins}m ({percent}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        key.includes('1')
                          ? 'bg-amber-500'
                          : key.includes('2')
                          ? 'bg-blue-500'
                          : 'bg-purple-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* BREAKDOWN BY STOPPAGE CAUSE / TYPE (DYNAMIC) */}
        <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-900/90 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-amber-400 shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Distribuição por Causa de Paragem
              </h3>
            </div>
            <span className="text-[10px] text-slate-400">
              {sortedTypes.length} {sortedTypes.length === 1 ? 'motivo' : 'motivos'}
            </span>
          </div>

          <div className="space-y-2">
            {sortedTypes.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">
                Nenhum registo no período selecionado.
              </p>
            ) : (
              sortedTypes.map(([type, data]) => {
                const mins = Math.round(data.durationMs / 60000);
                const percent = totalMinutes > 0 ? Math.round((mins / totalMinutes) * 100) : 0;

                return (
                  <div
                    key={type}
                    className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800 last:border-0 gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0"></span>
                      <span className="text-slate-200 font-medium truncate">
                        {type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="font-mono text-slate-400 text-[11px]">
                        {data.count}x
                      </span>
                      <span className="font-mono font-bold text-white tabular-nums min-w-[70px] text-right">
                        {mins}m ({percent}%)
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* BREAKDOWN BY PRIORITY & STATUS */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Priority Breakdown */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="h-4 w-4 text-rose-400 shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Distribuição por Gravidade
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5">
                <span className="text-[10px] uppercase font-bold text-rose-400 block">Crítica</span>
                <span className="text-xl font-black font-mono text-white">{priorityStats['Crítica']}</span>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
                <span className="text-[10px] uppercase font-bold text-amber-400 block">Alta</span>
                <span className="text-xl font-black font-mono text-white">{priorityStats['Alta']}</span>
              </div>
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5">
                <span className="text-[10px] uppercase font-bold text-sky-400 block">Média</span>
                <span className="text-xl font-black font-mono text-white">{priorityStats['Média']}</span>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">Baixa</span>
                <span className="text-xl font-black font-mono text-white">{priorityStats['Baixa']}</span>
              </div>
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-emerald-400 shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Estado das Avarias
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-center">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block truncate">Resolvido</span>
                <span className="text-xl font-black font-mono text-white">{statusStats['Resolvido']}</span>
              </div>
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5 text-center">
                <span className="text-[10px] uppercase font-bold text-sky-400 block truncate">Em Curso</span>
                <span className="text-xl font-black font-mono text-white">{statusStats['Em Decorrer']}</span>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-center">
                <span className="text-[10px] uppercase font-bold text-amber-400 block truncate">Pendente</span>
                <span className="text-xl font-black font-mono text-white">{statusStats['Pendente']}</span>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM RETURN BUTTON (WITH SAFE PADDING, NEVER CUT OFF) */}
        <div className="mt-6 pt-2">
          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              onBackToHome();
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-md active:scale-[0.98]"
          >
            Voltar ao Início
          </button>
        </div>
      </div>
    </div>
  );
};
