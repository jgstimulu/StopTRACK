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
  Gauge,
  Calendar,
  Filter,
  Sliders,
  Layers,
  Cpu,
  ChevronRight,
  Sparkles,
  Info,
  RotateCcw,
} from 'lucide-react';
import { HeaderLogo } from '../components/HeaderLogo';
import { StoppageRecord } from '../types/manutrack';
import { MACHINES_DATA, STOPPAGE_TYPES } from '../data/initialData';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';
import { exportOeeKpiCSV } from '../utils/csvExport';
import { getShiftFromTimeString } from '../utils/shift';
import {
  getReportingTotals,
  isRecordMachineStopped,
  isTuningRecord,
  formatSpringAdjustments,
  formatMechanicalAdjustments,
} from '../utils/taxonomy';

interface PageDashboardProps {
  records: StoppageRecord[];
  onBackToHome: () => void;
}

type TimeframeFilter = 'all' | 'today' | '7days' | '30days';
type LineFilter = 'all' | 'linha1' | 'linha2' | 'linha3';

// Standard 8 spring actions
const STANDARD_SPRING_ACTIONS = [
  'Fechar Baixo',
  'Abrir Baixo',
  'Corrigir Espiral',
  'Abrir Todo',
  'Fechar Todo',
  'Corrigir Escada',
  'Mola',
  'Outro',
] as const;

// Standard mechanical components
const STANDARD_MECH_COMPONENTS = [
  'Braços',
  'Pica',
  'Cabeça',
  'Borboleta',
  'Outro',
] as const;

export const PageDashboard: React.FC<PageDashboardProps> = ({ records, onBackToHome }) => {
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeframeFilter>('all');
  const [lineFilter, setLineFilter] = useState<LineFilter>('all');
  const [selectedMachineId, setSelectedMachineId] = useState<string>('all');
  const [tuningTab, setTuningTab] = useState<'mola' | 'mecanica'>('mola');

  // Helper to determine line of a machine
  const getMachineLine = (machineId: string): 'Linha 1' | 'Linha 2' | 'Linha 3' => {
    const num = parseInt(machineId.replace(/\D/g, ''), 10);
    if (num >= 21 && num <= 30) return 'Linha 3';
    if (num >= 11 && num <= 20) return 'Linha 2';
    return 'Linha 1';
  };

  // Filter records based on selected timeframe and line
  const filteredRecords = useMemo(() => {
    let result = records;

    // Time filter
    if (timeFilter !== 'all') {
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      result = result.filter((r) => {
        const recordTime =
          r.startTimestamp ||
          (r.date ? new Date(`${r.date} ${r.startTime || '00:00'}`).getTime() : 0);
        if (!recordTime) return true;
        const diffMs = now - recordTime;

        if (timeFilter === 'today') return diffMs <= oneDayMs;
        if (timeFilter === '7days') return diffMs <= 7 * oneDayMs;
        if (timeFilter === '30days') return diffMs <= 30 * oneDayMs;
        return true;
      });
    }

    // Line filter
    if (lineFilter !== 'all') {
      const targetLine =
        lineFilter === 'linha1'
          ? 'Linha 1'
          : lineFilter === 'linha2'
          ? 'Linha 2'
          : 'Linha 3';

      result = result.filter((r) => getMachineLine(r.machineId) === targetLine);
    }

    return result;
  }, [records, timeFilter, lineFilter]);

  // Overall totals for the active filtered scope
  const {
    totalCount,
    downtimeCount,
    tuningCount,
    downtimeDurationMs,
    downtimeMinutes: totalMinutes,
    tuningMinutes,
    mttrMinutes,
  } = useMemo(() => getReportingTotals(filteredRecords), [filteredRecords]);

  const downtimeRecords = useMemo(
    () => filteredRecords.filter(isRecordMachineStopped),
    [filteredRecords]
  );

  const tuningRecords = useMemo(
    () => filteredRecords.filter(isTuningRecord),
    [filteredRecords]
  );

  const totalHours = (totalMinutes / 60).toFixed(1);
  const tuningHours = (tuningMinutes / 60).toFixed(1);

  // Industrial OEE Availability Calculations
  // Machine scope: 30 machines total, or 10 per specific line
  const activeMachineCount = lineFilter === 'all' ? 30 : 10;
  const plannedHoursScope = useMemo(() => {
    if (timeFilter === 'today') return activeMachineCount * 16; // 1 day of 2 active shifts (16h)
    if (timeFilter === '7days') return activeMachineCount * 16 * 7;
    if (timeFilter === '30days') return activeMachineCount * 16 * 30;
    // For "all", estimate based on minimum scope for the active machines
    return Math.max(100, activeMachineCount * 16 * 5);
  }, [timeFilter, activeMachineCount]);

  const plannedMinutesScope = plannedHoursScope * 60;

  // 1. Technical Availability (Disponibilidade Técnica - exclui afinações)
  const operatingMinutesTechnical = Math.max(0, plannedMinutesScope - totalMinutes);
  const rawAvailabilityTechnical =
    plannedMinutesScope > 0 ? (operatingMinutesTechnical / plannedMinutesScope) * 100 : 100;
  const availabilityPercent = Math.min(100, Math.max(0, parseFloat(rawAvailabilityTechnical.toFixed(1))));

  // 2. Total Operational Availability (Disponibilidade Operacional Total - incluindo tempos de afinação)
  const totalLostMinutes = totalMinutes + tuningMinutes;
  const operatingMinutesTotal = Math.max(0, plannedMinutesScope - totalLostMinutes);
  const rawAvailabilityTotal =
    plannedMinutesScope > 0 ? (operatingMinutesTotal / plannedMinutesScope) * 100 : 100;
  const totalAvailabilityPercent = Math.min(100, Math.max(0, parseFloat(rawAvailabilityTotal.toFixed(1))));

  // Tuning Impact delta in percentage points
  const tuningImpactPoints = (availabilityPercent - totalAvailabilityPercent).toFixed(1);

  // MTBF (Mean Time Between Failures in Operating Hours)
  const mtbfHours =
    downtimeCount > 0
      ? (operatingMinutesTechnical / 60 / downtimeCount).toFixed(1)
      : (plannedHoursScope / activeMachineCount).toFixed(1);

  // Availability Benchmark Classification
  const getAvailabilityRating = (pct: number) => {
    if (pct >= 90) {
      return {
        label: 'Excelente (Classe Mundial)',
        color: 'text-emerald-400',
        stroke: '#10b981',
        badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
      };
    }
    if (pct >= 85) {
      return {
        label: 'Benchmark Industrial (>=85%)',
        color: 'text-sky-400',
        stroke: '#38bdf8',
        badge: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
      };
    }
    if (pct >= 75) {
      return {
        label: 'Regular / Atenção Necessária',
        color: 'text-amber-400',
        stroke: '#f59e0b',
        badge: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
      };
    }
    return {
      label: 'Crítico / Intervenção Urgente',
      color: 'text-rose-400',
      stroke: '#f43f5e',
      badge: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    };
  };
  const rating = getAvailabilityRating(availabilityPercent);
  const totalRating = getAvailabilityRating(totalAvailabilityPercent);

  // Group by machine (only actual machine stoppages)
  const machineCountMap = new Map<
    string,
    { count: number; durationMs: number; machineName: string; tuningCount: number; tuningMs: number }
  >();

  filteredRecords.forEach((r) => {
    const cur = machineCountMap.get(r.machineId) || {
      count: 0,
      durationMs: 0,
      machineName: r.machineName || r.machineId,
      tuningCount: 0,
      tuningMs: 0,
    };

    if (isRecordMachineStopped(r)) {
      cur.count += 1;
      cur.durationMs += r.durationMs || 0;
    }
    if (isTuningRecord(r)) {
      cur.tuningCount += 1;
      cur.tuningMs += r.durationMs || 0;
    }

    machineCountMap.set(r.machineId, cur);
  });

  const sortedMachines = Array.from(machineCountMap.entries())
    .filter(([, data]) => data.durationMs > 0)
    .sort((a, b) => b[1].durationMs - a[1].durationMs)
    .slice(0, 5);

  // Group by stoppage type dynamically (only actual machine stoppages)
  const typeDurationMap = new Map<string, { count: number; durationMs: number }>();
  downtimeRecords.forEach((r) => {
    const type = r.stoppageType || 'Não Especificado';
    const cur = typeDurationMap.get(type) || { count: 0, durationMs: 0 };
    typeDurationMap.set(type, {
      count: cur.count + 1,
      durationMs: cur.durationMs + (r.durationMs || 0),
    });
  });

  const sortedTypes = Array.from(typeDurationMap.entries()).sort(
    (a, b) => b[1].durationMs - a[1].durationMs
  );

  // Group by shift
  const shiftStats = {
    '1º Turno': { count: 0, durationMs: 0, label: '1º Turno', hours: '05:00 - 14:30', color: 'amber' },
    '2º Turno': { count: 0, durationMs: 0, label: '2º Turno', hours: '14:30 - 00:00', color: 'blue' },
    'Turno Noturno': { count: 0, durationMs: 0, label: 'Turno Noturno', hours: '00:00 - 05:00', color: 'purple' },
  };

  downtimeRecords.forEach((r) => {
    const sName = r.shift || (r.startTime ? getShiftFromTimeString(r.startTime).name : '1º Turno');
    if (sName.includes('1')) {
      shiftStats['1º Turno'].count++;
      shiftStats['1º Turno'].durationMs += r.durationMs || 0;
    } else if (sName.includes('2')) {
      shiftStats['2º Turno'].count++;
      shiftStats['2º Turno'].durationMs += r.durationMs || 0;
    } else {
      shiftStats['Turno Noturno'].count++;
      shiftStats['Turno Noturno'].durationMs += r.durationMs || 0;
    }
  });

  // Priority and Status stats
  const priorityStats: { [key: string]: number } = {
    Crítica: 0,
    Alta: 0,
    Média: 0,
    Baixa: 0,
  };
  const statusStats: { [key: string]: number } = {
    Resolvido: 0,
    'Em Decorrer': 0,
    Pendente: 0,
  };

  filteredRecords.forEach((r) => {
    const p = (r.priority as string) || 'Média';
    if (priorityStats[p] !== undefined) priorityStats[p]++;
    else priorityStats['Média']++;

    const s = (r.status as string) || 'Resolvido';
    if (statusStats[s] !== undefined) statusStats[s]++;
    else statusStats['Resolvido']++;
  });

  // ==========================================
  // DETAILED TUNING TAXONOMY STATS
  // ==========================================
  const springStats = useMemo(() => {
    const actionCounts: { [key: string]: number } = {};
    STANDARD_SPRING_ACTIONS.forEach((a) => {
      actionCounts[a] = 0;
    });

    let totalSpringInterventions = 0;
    let totalSpringDurationMs = 0;
    let totalActionsTicked = 0;

    filteredRecords
      .filter((r) => r.stoppageType === 'Afinação Mola' || (r.springAdjustments && r.springAdjustments.length > 0))
      .forEach((r) => {
        totalSpringInterventions += 1;
        totalSpringDurationMs += r.durationMs || 0;

        const adjustments = r.springAdjustments || [];
        adjustments.forEach((adj) => {
          totalActionsTicked += 1;
          actionCounts[adj] = (actionCounts[adj] || 0) + 1;
        });
      });

    const springMinutes = Math.round(totalSpringDurationMs / 60000);
    const sortedActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]);

    return {
      totalSpringInterventions,
      springMinutes,
      springHours: (springMinutes / 60).toFixed(1),
      totalActionsTicked,
      sortedActions,
    };
  }, [filteredRecords]);

  const mechanicalStats = useMemo(() => {
    const componentCounts: { [key: string]: number } = {};
    STANDARD_MECH_COMPONENTS.forEach((c) => {
      componentCounts[c] = 0;
    });

    const adjustmentTypeCounts: { [key: string]: number } = {
      Curso: 0,
      Tempo: 0,
      Ajuste: 0,
    };

    let totalMechInterventions = 0;
    let totalMechDurationMs = 0;
    let totalComponentsTicked = 0;

    filteredRecords
      .filter((r) => r.stoppageType === 'Afinação Mecânica' || (r.mechanicalAdjustments && r.mechanicalAdjustments.length > 0))
      .forEach((r) => {
        totalMechInterventions += 1;
        totalMechDurationMs += r.durationMs || 0;

        const adjustments = r.mechanicalAdjustments || [];
        adjustments.forEach((adj) => {
          totalComponentsTicked += 1;
          componentCounts[adj.component] = (componentCounts[adj.component] || 0) + 1;
          adj.adjustmentTypes?.forEach((type) => {
            if (adjustmentTypeCounts[type] !== undefined) {
              adjustmentTypeCounts[type] += 1;
            }
          });
        });
      });

    const mechMinutes = Math.round(totalMechDurationMs / 60000);
    const sortedComponents = Object.entries(componentCounts).sort((a, b) => b[1] - a[1]);

    return {
      totalMechInterventions,
      mechMinutes,
      mechHours: (mechMinutes / 60).toFixed(1),
      totalComponentsTicked,
      sortedComponents,
      adjustmentTypeCounts,
    };
  }, [filteredRecords]);

  // ==========================================
  // INDIVIDUAL MACHINE DEEP-DIVE (RAIO-X)
  // ==========================================
  const selectedMachineData = useMemo(() => {
    if (selectedMachineId === 'all') return null;

    const machInfo = MACHINES_DATA.find((m) => m.id === selectedMachineId);
    const machRecords = filteredRecords.filter((r) => r.machineId === selectedMachineId);
    const machTotals = getReportingTotals(machRecords);

    // Planned hours for a single machine
    let singleMachinePlannedHours = 16;
    if (timeFilter === 'today') singleMachinePlannedHours = 16;
    else if (timeFilter === '7days') singleMachinePlannedHours = 16 * 7;
    else if (timeFilter === '30days') singleMachinePlannedHours = 16 * 30;
    else singleMachinePlannedHours = 16 * 5;

    const singlePlannedMinutes = singleMachinePlannedHours * 60;
    const singleOpMinutes = Math.max(0, singlePlannedMinutes - machTotals.downtimeMinutes);
    const singleAvailability =
      singlePlannedMinutes > 0
        ? Math.min(100, Math.max(0, parseFloat(((singleOpMinutes / singlePlannedMinutes) * 100).toFixed(1))))
        : 100;

    // Single machine MTBF
    const singleMtbf =
      machTotals.downtimeCount > 0
        ? (singleOpMinutes / 60 / machTotals.downtimeCount).toFixed(1)
        : singleMachinePlannedHours.toString();

    // Top causes for this specific machine
    const machCausesMap = new Map<string, number>();
    machRecords.forEach((r) => {
      const type = r.stoppageType || 'Não especificado';
      machCausesMap.set(type, (machCausesMap.get(type) || 0) + 1);
    });
    const sortedMachCauses = Array.from(machCausesMap.entries()).sort((a, b) => b[1] - a[1]);

    // Recent 5 interventions
    const recentRecords = [...machRecords]
      .sort((a, b) => {
        const tA = a.startTimestamp || (a.date ? new Date(`${a.date} ${a.startTime || '00:00'}`).getTime() : 0);
        const tB = b.startTimestamp || (b.date ? new Date(`${b.date} ${b.startTime || '00:00'}`).getTime() : 0);
        return tB - tA;
      })
      .slice(0, 5);

    return {
      machInfo,
      machRecords,
      machTotals,
      singleAvailability,
      singleMtbf,
      sortedMachCauses,
      recentRecords,
    };
  }, [selectedMachineId, filteredRecords, timeFilter]);

  // List of machines available under the current line filter
  const availableMachines = useMemo(() => {
    if (lineFilter === 'all') return MACHINES_DATA;
    const targetLine =
      lineFilter === 'linha1' ? 'Linha 1' : lineFilter === 'linha2' ? 'Linha 2' : 'Linha 3';
    return MACHINES_DATA.filter((m) => m.section === targetLine);
  }, [lineFilter]);

  const handleExportOee = () => {
    playSuccessChime();
    const prefix = lineFilter === 'all' ? `stoptrack_kpi_oee_${timeFilter}` : `stoptrack_kpi_oee_${lineFilter}_${timeFilter}`;
    exportOeeKpiCSV(filteredRecords, prefix);
    setSuccessMsg('Relatório OEE e Métricas exportado com sucesso em CSV!');
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // Radial Progress Gauge calculations (Circumference for r=46: 2 * PI * 46 ≈ 289)
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * availabilityPercent) / 100;
  const totalStrokeDashoffset = circumference - (circumference * totalAvailabilityPercent) / 100;

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

        {/* DUAL FILTER BAR: TIMEFRAME & PRODUCTION LINE */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {/* Time Window Filter Tabs */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-1.5">
            <div className="flex items-center gap-1 text-[11px] font-bold">
              <span className="flex items-center gap-1 text-slate-400 px-2 shrink-0">
                <Calendar className="h-3 w-3 text-amber-400" />
                <span className="hidden sm:inline">Período:</span>
              </span>
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'today', label: 'Hoje (24h)' },
                  { id: '7days', label: '7 Dias' },
                  { id: '30days', label: '30 Dias' },
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

          {/* Production Line Filter Tabs (F01-F10, F11-F20, F21-F30) */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-1.5">
            <div className="flex items-center gap-1 text-[11px] font-bold">
              <span className="flex items-center gap-1 text-slate-400 px-2 shrink-0">
                <Layers className="h-3 w-3 text-sky-400" />
                <span className="hidden sm:inline">Linha:</span>
              </span>
              {(
                [
                  { id: 'all', label: 'Todas (30)' },
                  { id: 'linha1', label: 'Linha 1 (F01-F10)' },
                  { id: 'linha2', label: 'Linha 2 (F11-F20)' },
                  { id: 'linha3', label: 'Linha 3 (F21-F30)' },
                ] as const
              ).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    playIndustrialClick();
                    setLineFilter(l.id);
                    // Reset selected machine if it doesn't belong to the new line
                    if (l.id !== 'all' && selectedMachineId !== 'all') {
                      const mach = MACHINES_DATA.find((m) => m.id === selectedMachineId);
                      const expectedSection =
                        l.id === 'linha1' ? 'Linha 1' : l.id === 'linha2' ? 'Linha 2' : 'Linha 3';
                      if (mach && mach.section !== expectedSection) {
                        setSelectedMachineId('all');
                      }
                    }
                  }}
                  className={`flex-1 rounded-lg py-1.5 px-1.5 text-center transition-all truncate ${
                    lineFilter === l.id
                      ? 'bg-sky-500 text-slate-950 font-black shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* HERO OEE AVAILABILITY & RELIABILITY CARD WITH DUAL AVAILABILITY */}
        <div className="mt-4 overflow-hidden rounded-2xl border-2 border-slate-700 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-4 sm:p-5 shadow-xl">
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-3 mb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <Gauge className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
                    Disponibilidade Operacional (OEE Availability)
                  </h3>
                  <span className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                    {lineFilter === 'all'
                      ? '30 Máquinas (F01–F30)'
                      : lineFilter === 'linha1'
                      ? 'Linha 1 (F01–F10 · 10 Máquinas)'
                      : lineFilter === 'linha2'
                      ? 'Linha 2 (F11–F20 · 10 Máquinas)'
                      : 'Linha 3 (F21–F30 · 10 Máquinas)'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Análise Dupla: Fiabilidade Técnica (Sem Afinações) vs. Rendimento Total (Com Afinações)
                </p>
              </div>
            </div>

            <span
              className={`self-start px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border ${rating.badge}`}
            >
              {rating.label}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            {/* DUAL GAUGES / COMPARISON */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center py-2">
              <div className="flex items-center justify-center gap-4 sm:gap-6">
                {/* Gauge 1: Disponibilidade Técnica (Avarias Reais) */}
                <div className="flex flex-col items-center">
                  <div className="relative flex items-center justify-center">
                    <svg className="w-28 h-28 sm:w-32 sm:h-32 transform -rotate-90">
                      <circle
                        cx="56"
                        cy="56"
                        r="42"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="transparent"
                        className="text-slate-800"
                      />
                      <circle
                        cx="56"
                        cy="56"
                        r="42"
                        stroke={rating.stroke}
                        strokeWidth="8"
                        strokeDasharray={2 * Math.PI * 42}
                        strokeDashoffset={
                          2 * Math.PI * 42 - (2 * Math.PI * 42 * availabilityPercent) / 100
                        }
                        strokeLinecap="round"
                        fill="transparent"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center text-center">
                      <span
                        className={`text-lg sm:text-xl font-black font-mono tabular-nums tracking-tighter ${rating.color}`}
                      >
                        {availabilityPercent}%
                      </span>
                    </div>
                  </div>
                  <span className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-300 text-center">
                    Disp. Técnica
                  </span>
                  <span className="text-[9px] text-slate-500 text-center">
                    (Sem Afinações)
                  </span>
                </div>

                {/* Gauge 2: Disponibilidade Operacional Total (Com Afinações) */}
                <div className="flex flex-col items-center">
                  <div className="relative flex items-center justify-center">
                    <svg className="w-28 h-28 sm:w-32 sm:h-32 transform -rotate-90">
                      <circle
                        cx="56"
                        cy="56"
                        r="42"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="transparent"
                        className="text-slate-800"
                      />
                      <circle
                        cx="56"
                        cy="56"
                        r="42"
                        stroke={totalRating.stroke}
                        strokeWidth="8"
                        strokeDasharray={2 * Math.PI * 42}
                        strokeDashoffset={
                          2 * Math.PI * 42 - (2 * Math.PI * 42 * totalAvailabilityPercent) / 100
                        }
                        strokeLinecap="round"
                        fill="transparent"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center text-center">
                      <span
                        className={`text-lg sm:text-xl font-black font-mono tabular-nums tracking-tighter ${totalRating.color}`}
                      >
                        {totalAvailabilityPercent}%
                      </span>
                    </div>
                  </div>
                  <span className="mt-1 text-[10px] font-black uppercase tracking-wider text-sky-300 text-center">
                    Disp. Total
                  </span>
                  <span className="text-[9px] text-slate-500 text-center">
                    (Com Afinações)
                  </span>
                </div>
              </div>

              {/* Impact Callout */}
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-950/60 px-3 py-1 text-[11px] font-semibold text-sky-300">
                <Sliders className="h-3 w-3 text-sky-400" />
                <span>
                  Impacto das Afinações:{' '}
                  <strong className="font-mono font-black text-amber-300">
                    -{tuningImpactPoints}%
                  </strong>{' '}
                  ({tuningMinutes}m perdidos)
                </span>
              </div>
            </div>

            {/* Industrial Reliability Indicators (MTTR & MTBF) */}
            <div className="lg:col-span-7 grid grid-cols-2 gap-3">
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
                  Tempo Médio de Reparação ({downtimeCount} paragens)
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
                  <span className="text-xs text-slate-400 font-mono break-words">
                    h ({totalMinutes}m)
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Avarias / Paradas efetivas
                </p>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="flex min-w-0 items-center gap-1.5 text-slate-400 text-xs">
                  <Sliders className="h-3.5 w-3.5 text-sky-400" />
                  <span className="min-w-0 font-bold uppercase text-[10px]">Tempo de Afinação</span>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-1">
                  <span className="text-2xl font-black font-mono text-sky-300">
                    {tuningHours}
                  </span>
                  <span className="text-xs text-slate-400 font-mono break-words">
                    h ({tuningMinutes}m)
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Total de afinações ({tuningCount} registos)
                </p>
              </div>
            </div>
          </div>

          <p className="mt-3 border-t border-slate-800 pt-2 text-[10px] leading-relaxed text-slate-500">
            A Disponibilidade Técnica avalia apenas paragens não programadas (avarias mecânicas). A
            Disponibilidade Total inclui também todo o tempo despendido em afinações de mola e afinações
            mecânicas na linha.
          </p>
        </div>

        {/* 4 Responsive KPI Summary Cards */}
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-center">
            <span className="text-[10px] font-bold uppercase text-slate-400 block truncate">
              Total Intervenções
            </span>
            <p className="mt-1 text-2xl font-black text-white font-mono">{totalCount}</p>
            <span className="text-[10px] text-slate-400">
              {downtimeCount} paragens · {tuningCount} afinações
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-center">
            <span className="text-[10px] font-bold uppercase text-slate-400 block truncate">
              Tempo em Paragem
            </span>
            <p className="mt-1 text-2xl font-black text-rose-400 font-mono">{totalMinutes}m</p>
            <span className="text-[10px] text-slate-400">{totalHours} horas reais</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-center">
            <span className="text-[10px] font-bold uppercase text-slate-400 block truncate">
              Tempo em Afinações
            </span>
            <p className="mt-1 text-2xl font-black text-sky-300 font-mono">{tuningMinutes}m</p>
            <span className="text-[10px] text-slate-400">{tuningHours} horas de afinação</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-center">
            <span className="text-[10px] font-bold uppercase text-slate-400 block truncate">
              MTTR Médio
            </span>
            <p className="mt-1 text-2xl font-black text-amber-300 font-mono">{mttrMinutes}m</p>
            <span className="text-[10px] text-slate-400">por avaria</span>
          </div>
        </div>

        {/* ========================================================= */}
        {/* ENHANCEMENT: DETAILED TUNING TAXONOMY BREAKDOWN CARD */}
        {/* ========================================================= */}
        <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-900/90 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-sky-400 shrink-0" />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Análise Detalhada de Afinações Padronizadas
                </h3>
                <p className="text-[10px] text-slate-400">
                  Tempo acumulado e frequência das intervenções de mola e órgãos mecânicos
                </p>
              </div>
            </div>

            {/* Sub-tabs for Mola vs Mecânica */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  playIndustrialClick();
                  setTuningTab('mola');
                }}
                className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${
                  tuningTab === 'mola'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Afinação Mola ({springStats.totalSpringInterventions})
              </button>
              <button
                type="button"
                onClick={() => {
                  playIndustrialClick();
                  setTuningTab('mecanica');
                }}
                className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${
                  tuningTab === 'mecanica'
                    ? 'bg-sky-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Afinação Mecânica ({mechanicalStats.totalMechInterventions})
              </button>
            </div>
          </div>

          {tuningTab === 'mola' ? (
            <div>
              {/* Summary KPIs for Spring Tuning */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-center">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">
                    Intervenções de Mola
                  </span>
                  <span className="text-lg font-black font-mono text-amber-400">
                    {springStats.totalSpringInterventions}
                  </span>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-center">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">
                    Tempo Total Mola
                  </span>
                  <span className="text-lg font-black font-mono text-white">
                    {springStats.springMinutes}m ({springStats.springHours}h)
                  </span>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-center">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">
                    Ações Executadas
                  </span>
                  <span className="text-lg font-black font-mono text-amber-300">
                    {springStats.totalActionsTicked}
                  </span>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-center">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">
                    Média por Afinação
                  </span>
                  <span className="text-lg font-black font-mono text-white">
                    {springStats.totalSpringInterventions > 0
                      ? Math.round(
                          springStats.springMinutes / springStats.totalSpringInterventions
                        )
                      : 0}
                    m
                  </span>
                </div>
              </div>

              {/* Breakdown of the 8 Standard Spring Actions */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Frequência das 8 Ações Padrão de Mola
                </h4>
                {springStats.sortedActions.map(([actionName, count]) => {
                  const pct =
                    springStats.totalActionsTicked > 0
                      ? Math.round((count / springStats.totalActionsTicked) * 100)
                      : 0;
                  return (
                    <div key={actionName} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                          <span className="font-semibold text-slate-200">{actionName}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-slate-400 text-[11px]">{count}x</span>
                          <span className="font-bold text-amber-300 tabular-nums">
                            {pct}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(count > 0 ? 5 : 0, pct))}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              {/* Summary KPIs for Mechanical Tuning */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2 text-center">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">
                    Intervenções Mecânicas
                  </span>
                  <span className="text-lg font-black font-mono text-sky-400">
                    {mechanicalStats.totalMechInterventions}
                  </span>
                </div>
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2 text-center">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">
                    Tempo Total Mecânica
                  </span>
                  <span className="text-lg font-black font-mono text-white">
                    {mechanicalStats.mechMinutes}m ({mechanicalStats.mechHours}h)
                  </span>
                </div>
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2 text-center">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">
                    Órgãos Regulados
                  </span>
                  <span className="text-lg font-black font-mono text-sky-300">
                    {mechanicalStats.totalComponentsTicked}
                  </span>
                </div>
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2 text-center">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">
                    Média por Afinação
                  </span>
                  <span className="text-lg font-black font-mono text-white">
                    {mechanicalStats.totalMechInterventions > 0
                      ? Math.round(
                          mechanicalStats.mechMinutes /
                            mechanicalStats.totalMechInterventions
                        )
                      : 0}
                    m
                  </span>
                </div>
              </div>

              {/* Sub-Breakdown: Components & Adjustment Types */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Components */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Órgãos Mecânicos Mais Ajustados
                  </h4>
                  {mechanicalStats.sortedComponents.map(([compName, count]) => {
                    const pct =
                      mechanicalStats.totalComponentsTicked > 0
                        ? Math.round((count / mechanicalStats.totalComponentsTicked) * 100)
                        : 0;
                    return (
                      <div key={compName} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-400"></span>
                            <span className="font-semibold text-slate-200">{compName}</span>
                          </div>
                          <div className="flex items-center gap-2 font-mono">
                            <span className="text-slate-400 text-[11px]">{count}x</span>
                            <span className="font-bold text-sky-300 tabular-nums">
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-300 transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(count > 0 ? 5 : 0, pct))}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Adjustment Mode Distribution (Curso, Tempo, Ajuste) */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Tipo de Regulação Aplicada
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Curso', 'Tempo', 'Ajuste'] as const).map((type) => {
                      const count = mechanicalStats.adjustmentTypeCounts[type] || 0;
                      return (
                        <div
                          key={type}
                          className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-center"
                        >
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            {type}
                          </span>
                          <span className="text-xl font-black font-mono text-sky-300 block mt-1">
                            {count}
                          </span>
                          <span className="text-[9px] text-slate-500 block">ocorrências</span>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[10px] text-slate-500 mt-2">
                    Permite aos preparadores e afinadores identificar se os desvios decorrem de timing de ciclo (Tempo), de amplitude mecânica (Curso) ou de folgas gerais (Ajuste).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* ENHANCEMENT: INDIVIDUAL MACHINE RAY-X / DEEP DIVE (F01-F30) */}
        {/* ========================================================= */}
        <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-900/90 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-emerald-400 shrink-0" />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Ficha / Raio-X Individual por Máquina
                </h3>
                <p className="text-[10px] text-slate-400">
                  Selecione uma máquina específica (F01–F30) para diagnóstico detalhado
                </p>
              </div>
            </div>

            {/* Quick selector dropdown */}
            <div className="flex items-center gap-2">
              <label htmlFor="mach-picker" className="text-[11px] font-bold text-slate-400 shrink-0">
                Máquina:
              </label>
              <select
                id="mach-picker"
                value={selectedMachineId}
                onChange={(e) => {
                  playIndustrialClick();
                  setSelectedMachineId(e.target.value);
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
              >
                <option value="all">Visão Geral (Todas as Máquinas)</option>
                {availableMachines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} - {m.name} ({m.section})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedMachineData ? (
            <div className="space-y-4 pt-1">
              {/* Machine Header Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/80 p-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-base font-black px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {selectedMachineData.machInfo?.code}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      {selectedMachineData.machInfo?.name}
                    </h4>
                    <span className="text-[10px] font-medium text-slate-400">
                      {selectedMachineData.machInfo?.section}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">
                      Disponibilidade
                    </span>
                    <span className="text-lg font-black font-mono text-emerald-400">
                      {selectedMachineData.singleAvailability}%
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">
                      MTBF
                    </span>
                    <span className="text-lg font-black font-mono text-sky-300">
                      {selectedMachineData.singleMtbf}h
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playIndustrialClick();
                      setSelectedMachineId('all');
                    }}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    title="Fechar Ficha Individual"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Machine Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-center">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">
                    Paragens Reais
                  </span>
                  <span className="text-xl font-black font-mono text-rose-400">
                    {selectedMachineData.machTotals.downtimeCount}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {selectedMachineData.machTotals.downtimeMinutes} min parados
                  </span>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-center">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">
                    MTTR Individual
                  </span>
                  <span className="text-xl font-black font-mono text-amber-300">
                    {selectedMachineData.machTotals.mttrMinutes}m
                  </span>
                  <span className="text-[10px] text-slate-500">por paragem</span>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-center">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">
                    Afinações
                  </span>
                  <span className="text-xl font-black font-mono text-sky-300">
                    {selectedMachineData.machTotals.tuningCount}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {selectedMachineData.machTotals.tuningMinutes} min afinação
                  </span>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-center">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">
                    Total Intervenções
                  </span>
                  <span className="text-xl font-black font-mono text-white">
                    {selectedMachineData.machTotals.totalCount}
                  </span>
                  <span className="text-[10px] text-slate-500">no período</span>
                </div>
              </div>

              {/* Causes & Recent History */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Causes Breakdown for this machine */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-2">
                    Causas Mais Frequentes nesta Máquina
                  </h5>
                  {selectedMachineData.sortedMachCauses.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">Sem paragens registadas.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedMachineData.sortedMachCauses.map(([cause, count]) => (
                        <div
                          key={cause}
                          className="flex items-center justify-between text-xs py-1 border-b border-slate-800/80 last:border-0"
                        >
                          <span className="text-slate-300 font-medium truncate">{cause}</span>
                          <span className="font-mono font-bold text-amber-300">{count}x</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Interventions Log */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-2">
                    Últimas Intervenções Registadas
                  </h5>
                  {selectedMachineData.recentRecords.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">Nenhum registo recente.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedMachineData.recentRecords.map((r) => (
                        <div
                          key={r.id}
                          className="rounded border border-slate-800 bg-slate-900/60 p-2 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-slate-200">
                              {r.stoppageType}
                            </span>
                            <span className="font-mono text-amber-300 font-semibold">
                              {Math.round(r.durationMs / 60000)}m
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>{r.date} {r.startTime}</span>
                            <span>{r.closedBy ? `Téc: ${r.closedBy}` : 'Operador'}</span>
                          </div>
                          {r.stoppageDescription && (
                            <p className="text-[10px] text-slate-400 italic line-clamp-1">
                              &ldquo;{r.stoppageDescription}&rdquo;
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-2">
              <p className="text-xs text-slate-400 mb-2">
                Selecione uma máquina acima ou clique num dos botões para inspecionar diretamente:
              </p>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                {availableMachines.map((m) => {
                  const data = machineCountMap.get(m.id);
                  const hasDowntime = (data?.durationMs || 0) > 0;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        playIndustrialClick();
                        setSelectedMachineId(m.id);
                      }}
                      className={`rounded py-1.5 text-center font-mono text-xs font-black transition-all border ${
                        hasDowntime
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-850'
                      }`}
                    >
                      {m.code}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
            <span className="text-[10px] font-mono text-slate-400">
              {lineFilter === 'all' ? 'F01–F30' : lineFilter.toUpperCase()}
            </span>
          </div>

          <div className="space-y-3">
            {sortedMachines.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">
                Sem registos de paragens no período e linha selecionados.
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
                        <button
                          type="button"
                          onClick={() => {
                            playIndustrialClick();
                            setSelectedMachineId(mId);
                          }}
                          className="font-mono font-black text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded text-xs hover:bg-amber-500/20 transition-colors shrink-0"
                          title="Clique para ver Raio-X da máquina"
                        >
                          {mId}
                        </button>
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
              Distribuição do Tempo em Paragem por Turno
            </h3>
          </div>

          <div className="space-y-3">
            {Object.entries(shiftStats).map(([key, item]) => {
              const mins = Math.round(item.durationMs / 60000);
              const percent =
                downtimeDurationMs > 0 ? Math.round((item.durationMs / downtimeDurationMs) * 100) : 0;
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">{item.label}</span>
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
                      <span className="text-slate-200 font-medium truncate">{type}</span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="font-mono text-slate-400 text-[11px]">{data.count}x</span>
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
                <span className="text-xl font-black font-mono text-white">
                  {priorityStats['Crítica']}
                </span>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
                <span className="text-[10px] uppercase font-bold text-amber-400 block">Alta</span>
                <span className="text-xl font-black font-mono text-white">
                  {priorityStats['Alta']}
                </span>
              </div>
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5">
                <span className="text-[10px] uppercase font-bold text-sky-400 block">Média</span>
                <span className="text-xl font-black font-mono text-white">
                  {priorityStats['Média']}
                </span>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">Baixa</span>
                <span className="text-xl font-black font-mono text-white">
                  {priorityStats['Baixa']}
                </span>
              </div>
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-emerald-400 shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Estado das Intervenções
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-center">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block truncate">
                  Resolvido
                </span>
                <span className="text-xl font-black font-mono text-white">
                  {statusStats['Resolvido']}
                </span>
              </div>
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5 text-center">
                <span className="text-[10px] uppercase font-bold text-sky-400 block truncate">
                  Em Curso
                </span>
                <span className="text-xl font-black font-mono text-white">
                  {statusStats['Em Decorrer']}
                </span>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-center">
                <span className="text-[10px] uppercase font-bold text-amber-400 block truncate">
                  Pendente
                </span>
                <span className="text-xl font-black font-mono text-white">
                  {statusStats['Pendente']}
                </span>
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

