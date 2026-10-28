import React, { useState } from 'react';
import {
  Save,
  Clock,
  Calendar,
  Wrench,
  User,
  CheckCircle,
  FileText,
  AlertCircle,
  Cpu,
  Layers,
  Sunrise,
  Sun,
  Moon,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Flame,
  ShieldAlert,
  Power,
  Check,
} from 'lucide-react';
import { HeaderLogo } from '../components/HeaderLogo';
import {
  ActiveDowntime,
  StoppageRecord,
  Operator,
  StoppageTypeItem,
  StoppagePriority,
  StoppageStatus,
  StoppageStage,
  StoppageStageLevel,
} from '../types/manutrack';
import { StagesEditor } from '../components/StagesEditor';
import { INITIAL_STOPPAGE_TYPES } from '../data/initialData';
import { formatDurationMs, formatTimeOnly } from '../utils/formatters';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';
import { getShiftInfo } from '../utils/shift';

interface PageCloseStoppageProps {
  activeDowntime: ActiveDowntime;
  endTimestamp: number;
  onSaveAndExit: (record: StoppageRecord) => Promise<void>;
  onCancel: () => void;
  operators?: string[];
  availableOperators?: Operator[];
  availableStoppageTypes?: StoppageTypeItem[];
  onOpenAdmin?: () => void;
}

export const PageCloseStoppage: React.FC<PageCloseStoppageProps> = ({
  activeDowntime,
  endTimestamp,
  onSaveAndExit,
  onCancel,
  availableOperators = [],
  availableStoppageTypes = INITIAL_STOPPAGE_TYPES,
  onOpenAdmin,
}) => {
  // Calculated duration and times
  const durationMs = Math.max(0, endTimestamp - activeDowntime.startTimestamp);
  const durationFormatted = formatDurationMs(durationMs);
  const endDate = new Date(endTimestamp);
  const endTimeFormatted = formatTimeOnly(endDate);
  const dateFormatted = activeDowntime.startDateFormatted;

  // Automatically calculate shift based on start time / current occurrence:
  // 05:00 - 14:30 -> 1º Turno | 14:30 - 00:00 -> 2º Turno | 00:00 - 05:00 -> Turno Noturno
  const detectedShift = activeDowntime.shift
    ? {
        name: activeDowntime.shift,
        timeRange:
          activeDowntime.shift.includes('1')
            ? '05:00 - 14:30'
            : activeDowntime.shift.includes('2')
            ? '14:30 - 00:00'
            : '00:00 - 05:00',
        badgeColor: activeDowntime.shift.includes('1')
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
          : activeDowntime.shift.includes('2')
          ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
          : 'border-purple-500/40 bg-purple-500/10 text-purple-300',
      }
    : getShiftInfo(activeDowntime.startTimestamp);

  const [shift, setShift] = useState<string>(detectedShift.name);

  // Filter operators
  const activeOps = availableOperators.filter((o) => o.active);
  const starterOps = activeOps.filter((o) => o.canStart);

  const defaultStoppageType = availableStoppageTypes.length > 0
    ? availableStoppageTypes[0].name
    : 'Avaria Mecânica';

  // Per user instruction: No automatic pre-selection of names, fields strictly mandatory!
  // initiatedBy takes whatever was explicitly chosen at start, or empty string.
  const [initiatedBy, setInitiatedBy] = useState<string>(activeDowntime.initiatedBy || '');
  // The selected closer is recorded for information only; closing does not require a PIN.
  const [closedBy, setClosedBy] = useState<string>('');

  const [isCustomInitiator, setIsCustomInitiator] = useState<boolean>(
    Boolean(initiatedBy && !activeOps.some((o) => o.name === initiatedBy))
  );

  const [stoppageType, setStoppageType] = useState<string>(defaultStoppageType);
  const [priority, setPriority] = useState<StoppagePriority>('Média');
  const [status, setStatus] = useState<StoppageStatus>('Resolvido');
  // "A máquina parou?" — resposta simples com um tique (por defeito: parou).
  const [machineStopped, setMachineStopped] = useState<boolean>(true);
  const [stoppageDescription, setStoppageDescription] = useState<string>('');
  const [actionsTaken, setActionsTaken] = useState<string>('');
  const [otherObservations, setOtherObservations] = useState<string>('');

  // Sub-stages decomposition
  const totalDurationMinutes = Math.max(1, Math.round(durationMs / 60000));
  const hasPredefinedStages = Boolean(
    activeDowntime.completedStages && activeDowntime.completedStages.length > 0
  );
  const [isDecomposingStages, setIsDecomposingStages] = useState<boolean>(hasPredefinedStages);
  const [stages, setStages] = useState<StoppageStage[]>(() => {
    if (activeDowntime.completedStages && activeDowntime.completedStages.length > 0) {
      const list = [...activeDowntime.completedStages];
      const lastStageLevel: StoppageStageLevel = activeDowntime.currentLevel || 3;
      const lastStageStart = activeDowntime.stageStartTimestamp || activeDowntime.startTimestamp;
      const lastStageElapsedMs = Math.max(0, endTimestamp - lastStageStart);
      const lastStageMin = Math.max(1, Math.round(lastStageElapsedMs / 60000));
      list.push({
        id: `stage-${Date.now()}-${list.length + 1}`,
        order: list.length + 1,
        level: lastStageLevel,
        levelLabel:
          lastStageLevel === 1
            ? '1. Diagnóstico'
            : lastStageLevel === 2
            ? '2. Intervenção'
            : '3. Fecho',
        type:
          activeDowntime.currentStage ||
          (lastStageLevel === 3 ? 'Arranque e Validação' : 'Qualidade / Afinação'),
        description: `Finalização e arranque da máquina`,
        technician: activeDowntime.assignedTechnician || 'Supervisor',
        durationMinutes: lastStageMin,
      });
      return list;
    }
    return [];
  });

  // Validation
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const validate = () => {
    const errs: { [key: string]: string } = {};
    if (!initiatedBy.trim()) {
      errs.initiatedBy = 'Indique quem iniciou a paragem';
    }
    if (!closedBy.trim()) {
      errs.closedBy = 'Selecione quem está a fechar a paragem';
    }
    if (!shift.trim()) {
      errs.shift = 'Turno é obrigatório';
    }

    // Auto-fill sensible default description if left blank
    let finalDesc = stoppageDescription.trim();
    if (!finalDesc) {
      finalDesc = `${stoppageType} na máquina ${activeDowntime.machineId}`;
      setStoppageDescription(finalDesc);
    }

    // Auto-fill actions taken if left blank from stages or default
    let finalActions = actionsTaken.trim();
    if (!finalActions) {
      if (stages && stages.length > 0) {
        finalActions = stages
          .map((s) => `${s.type} (${s.technician || 'Técnico'})`)
          .join(' → ');
      } else {
        finalActions = 'Intervenção técnica realizada e máquina reposta em funcionamento';
      }
      setActionsTaken(finalActions);
    }

    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      const firstKey = Object.keys(errs)[0];
      setTimeout(() => {
        const el = document.getElementById(`field-${firstKey}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return false;
    }

    return true;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!validate()) {
      return;
    }

    const record: StoppageRecord = {
      id: `stop-${Date.now()}-${activeDowntime.machineId}`,
      machineId: activeDowntime.machineId,
      machineName: activeDowntime.machineName,
      date: dateFormatted,
      startTime: activeDowntime.startTimeFormatted,
      endTime: endTimeFormatted,
      startTimestamp: activeDowntime.startTimestamp,
      endTimestamp: endTimestamp,
      durationMs: durationMs,
      durationFormatted: durationFormatted,
      shift: shift.trim(),
      priority,
      status,
      machineStopped,
      initiatedBy: initiatedBy.trim(),
      closedBy: closedBy.trim(),
      stoppageType: stoppageType,
      stoppageDescription:
        stoppageDescription.trim() || `${stoppageType} na máquina ${activeDowntime.machineId}`,
      actionsTaken:
        actionsTaken.trim() ||
        (stages.length > 0
          ? stages.map((s) => `${s.type} (${s.technician || 'Técnico'})`).join(' → ')
          : 'Intervenção técnica realizada e máquina testada'),
      otherObservations: otherObservations.trim() || undefined,
      stages: isDecomposingStages && stages.length > 0 ? stages : undefined,
      createdAt: Date.now(),
    };

    setIsSaving(true);
    try {
      await onSaveAndExit(record);
      playSuccessChime();
    } catch (error) {
      setErrors((previous) => ({
        ...previous,
        closedBy: error instanceof Error ? error.message : 'Não foi possível guardar a paragem.',
      }));
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-between py-5 px-3.5 sm:px-6 pb-28">
      {/* Top Header */}
      <div>
        <HeaderLogo subtitle="Registo e Fecho de Paragem (Página 4)" />

        {/* TOP SUMMARY CARD */}
        <div className="mt-4 overflow-hidden rounded-2xl border-2 border-slate-700 bg-slate-900 shadow-xl">
          {/* Machine Header Banner */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/80 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-12 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/20 text-base font-black text-amber-300 font-mono">
                {activeDowntime.machineId}
              </span>
              <div>
                <h2 className="text-sm font-bold text-white leading-tight">
                  {activeDowntime.machineName}
                </h2>
                <span className="text-[11px] text-slate-400">Resumo da Ocorrência</span>
              </div>
            </div>

            <div className="text-right">
              <div className="flex items-center gap-1 text-xs text-slate-300">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-semibold">{dateFormatted}</span>
              </div>
            </div>
          </div>

          {/* Calculated Times Strip */}
          <div className="grid grid-cols-2 gap-px bg-slate-800/60 p-4">
            {/* Duração da paragem */}
            <div className="pr-3 border-r border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Duração da Paragem
              </span>
              <p className="mt-0.5 text-2xl font-black text-rose-400 font-mono tabular-nums tracking-tight">
                {durationFormatted}
              </p>
              <span className="text-[11px] text-slate-400">
                Total acumulado
              </span>
            </div>

            {/* Hora de Início e Fim */}
            <div className="pl-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Hora Início e Fim
              </span>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-white font-mono">
                <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>{activeDowntime.startTimeFormatted}</span>
                <span className="text-slate-400">→</span>
                <span>{endTimeFormatted}</span>
              </div>
              <span className="text-[11px] text-slate-400">
                Cronometrado automaticamente
              </span>
            </div>
          </div>

          {/* Turno Detetado Automaticamente Strip */}
          <div className="border-t border-slate-800 bg-slate-900/90 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Turno da Paragem:
              </span>
              <span className="font-mono font-bold text-xs text-amber-300 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/30">
                {shift}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {shift.includes('1') ? '05:00 - 14:30' : shift.includes('2') ? '14:30 - 00:00' : '00:00 - 05:00'}
            </span>
          </div>
        </div>
      </div>

      {/* FORM QUESTIONS */}
      <form onSubmit={handleSave} className="my-4 space-y-4">
        {/* Automatic Shift Selection / Confirmation */}
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span>Turno da Paragem <span className="text-rose-400">*</span></span>
            </label>
            <span className="text-[10px] text-slate-400 font-mono">Cálculo Automático</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: '1º Turno', label: '1º Turno', range: '05:00 - 14:30', icon: Sunrise },
              { id: '2º Turno', label: '2º Turno', range: '14:30 - 00:00', icon: Sun },
              { id: 'Turno Noturno', label: 'Turno Noturno', range: '00:00 - 05:00', icon: Moon },
            ].map((s) => {
              const IconComp = s.icon;
              const isSelected = shift === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setShift(s.id)}
                  className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/20 text-amber-300 font-bold ring-1 ring-amber-500/50 shadow-sm'
                      : 'border-slate-700 bg-slate-800/80 text-slate-400 hover:text-white hover:border-slate-600'
                  }`}
                >
                  <IconComp className={`h-4 w-4 mb-1 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold font-mono">{s.label}</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">{s.range}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 1. Quem Iniciou a Paragem - Mandatory, NOT pre-associated */}
        <div
          id="field-initiatedBy"
          className={`rounded-xl border p-3.5 shadow-sm transition-all ${
            errors.initiatedBy
              ? 'border-rose-500 bg-rose-950/20 ring-1 ring-rose-500'
              : 'border-slate-700/80 bg-slate-900/90'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <User className={`h-3.5 w-3.5 ${errors.initiatedBy ? 'text-rose-400' : 'text-amber-400'}`} />
              <span>Quem iniciou a paragem <span className="text-rose-400">*</span></span>
            </label>
            <button
              type="button"
              onClick={() => setIsCustomInitiator(!isCustomInitiator)}
              className="text-[11px] font-medium text-amber-400 hover:text-amber-300"
            >
              {isCustomInitiator ? 'Selecionar da lista' : 'Digitar outro nome'}
            </button>
          </div>

          {isCustomInitiator ? (
            <input
              type="text"
              value={initiatedBy}
              onChange={(e) => {
                setInitiatedBy(e.target.value);
                if (e.target.value.trim() && errors.initiatedBy) {
                  setErrors((prev) => ({ ...prev, initiatedBy: '' }));
                }
              }}
              placeholder="Digite o nome de quem iniciou..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-medium text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none"
            />
          ) : (
            <select
              value={initiatedBy}
              onChange={(e) => {
                setInitiatedBy(e.target.value);
                if (e.target.value.trim() && errors.initiatedBy) {
                  setErrors((prev) => ({ ...prev, initiatedBy: '' }));
                }
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-semibold text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="" className="bg-slate-900 text-slate-400">
                -- Selecione quem iniciou (Obrigatório) --
              </option>
              {starterOps.map((op) => (
                <option key={op.id} value={op.name} className="bg-slate-900 text-white">
                  {op.name} ({op.role})
                </option>
              ))}
              {starterOps.length === 0 && activeOps.map((op) => (
                <option key={op.id} value={op.name} className="bg-slate-900 text-white">
                  {op.name}
                </option>
              ))}
            </select>
          )}

          {errors.initiatedBy && (
            <p className="mt-1.5 text-[11px] font-semibold text-rose-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.initiatedBy}
            </p>
          )}
        </div>

        {/* 2. Quem Fechou a Paragem - Mandatory, NOT pre-associated */}
        <div
          id="field-closedBy"
          className={`rounded-xl border p-3.5 shadow-sm transition-all ${
            errors.closedBy
              ? 'border-rose-500 bg-rose-950/20 ring-1 ring-rose-500'
              : 'border-slate-700/80 bg-slate-900/90'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <User className={`h-3.5 w-3.5 ${errors.closedBy ? 'text-rose-400' : 'text-emerald-400'}`} />
              <span>Quem fechou a paragem (informativo) <span className="text-rose-400">*</span></span>
            </label>
          </div>

          <>
            <select
              value={closedBy}
              onChange={(e) => {
                setClosedBy(e.target.value);
                if (e.target.value.trim() && errors.closedBy) {
                  setErrors((prev) => ({ ...prev, closedBy: '' }));
                }
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-semibold text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="" className="bg-slate-900 text-slate-400">
                -- Selecione quem está a fechar a paragem (Obrigatório) --
              </option>
              {activeOps.map((op) => (
                <option key={op.id} value={op.name} className="bg-slate-900 text-white">
                  {op.name} ({op.role})
                </option>
              ))}
            </select>
          </>

          {errors.closedBy && (
            <p className="mt-1.5 text-[11px] font-semibold text-rose-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.closedBy}
            </p>
          )}
        </div>

        {/* 3. Tipo de Paragem */}
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Layers className="h-3.5 w-3.5 text-sky-400" />
              <span>Tipo de paragem <span className="text-rose-400">*</span></span>
            </label>
            {onOpenAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                title="Configurar tipos de avaria no backend"
                className="text-[11px] font-medium text-amber-400 hover:text-amber-300"
              >
                + Gerir tipos
              </button>
            )}
          </div>
          <div className="mt-2">
            <select
              value={stoppageType}
              onChange={(e) => setStoppageType(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-semibold text-white focus:border-sky-500 focus:outline-none"
            >
              {availableStoppageTypes.map((st) => (
                <option key={st.id || st.name} value={st.name} className="bg-slate-900 text-white">
                  {st.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 4. Prioridade da Avaria */}
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              <span>Prioridade da Avaria <span className="text-rose-400">*</span></span>
            </label>
            <span className="text-[11px] font-mono">
              {priority === 'Crítica' && <span className="text-rose-400 font-bold">Crítica (Urgente)</span>}
              {priority === 'Alta' && <span className="text-amber-400 font-semibold">Alta Prioridade</span>}
              {priority === 'Média' && <span className="text-sky-400">Média (Normal)</span>}
              {priority === 'Baixa' && <span className="text-emerald-400">Baixa Prioridade</span>}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {(['Baixa', 'Média', 'Alta', 'Crítica'] as StoppagePriority[]).map((p) => {
              const isSelected = priority === p;
              let activeClasses = '';
              let badgeDot = '';
              if (p === 'Baixa') {
                activeClasses = 'border-emerald-500 bg-emerald-500/20 text-emerald-300';
                badgeDot = 'bg-emerald-400';
              } else if (p === 'Média') {
                activeClasses = 'border-sky-500 bg-sky-500/20 text-sky-300';
                badgeDot = 'bg-sky-400';
              } else if (p === 'Alta') {
                activeClasses = 'border-amber-500 bg-amber-500/20 text-amber-300';
                badgeDot = 'bg-amber-400';
              } else {
                activeClasses = 'border-rose-500 bg-rose-500/25 text-rose-300 font-black';
                badgeDot = 'bg-rose-400 animate-pulse';
              }

              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    playIndustrialClick();
                    setPriority(p);
                  }}
                  className={`flex flex-col items-center justify-center rounded-lg border py-2.5 px-1.5 transition-all ${
                    isSelected
                      ? `${activeClasses} ring-1 ring-white/20 shadow-md`
                      : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold">
                    <span className={`h-2 w-2 rounded-full ${isSelected ? badgeDot : 'bg-slate-600'}`} />
                    {p}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. Estado da Avaria */}
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              <span>Estado da Avaria <span className="text-rose-400">*</span></span>
            </label>
            <span className="text-[11px] font-mono">
              {status === 'Resolvido' && <span className="text-emerald-400 font-semibold">Resolvido</span>}
              {status === 'Em Decorrer' && <span className="text-sky-400 font-semibold">Em Decorrer</span>}
              {status === 'Pendente' && <span className="text-amber-400 font-semibold">Pendente</span>}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { key: 'Resolvido', label: 'Resolvido', icon: CheckCircle2, color: 'emerald' },
                { key: 'Em Decorrer', label: 'Em Decorrer', icon: Activity, color: 'sky' },
                { key: 'Pendente', label: 'Pendente', icon: AlertTriangle, color: 'amber' },
              ] as const
            ).map((item) => {
              const isSelected = status === item.key;
              const IconComp = item.icon;
              let selectedStyle = '';
              if (item.color === 'emerald') {
                selectedStyle = 'border-emerald-500 bg-emerald-500/20 text-emerald-300';
              } else if (item.color === 'sky') {
                selectedStyle = 'border-sky-500 bg-sky-500/20 text-sky-300';
              } else {
                selectedStyle = 'border-amber-500 bg-amber-500/20 text-amber-300';
              }

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    playIndustrialClick();
                    setStatus(item.key as StoppageStatus);
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border py-2.5 px-2 text-xs font-bold transition-all ${
                    isSelected
                      ? `${selectedStyle} ring-1 ring-white/20 shadow-md`
                      : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <IconComp className={`h-3.5 w-3.5 ${isSelected ? '' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5.1 A máquina parou? — resposta simples com um tique */}
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
            <Power className="h-3.5 w-3.5 text-rose-400" />
            <span>A máquina parou?</span>
          </label>

          <button
            type="button"
            role="checkbox"
            aria-checked={machineStopped}
            onClick={() => {
              playIndustrialClick();
              setMachineStopped((prev) => !prev);
            }}
            className={`mt-2 flex w-full items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition-all active:scale-[0.99] ${
              machineStopped
                ? 'border-rose-500 bg-rose-500/15 text-rose-200'
                : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500'
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
                machineStopped
                  ? 'border-rose-400 bg-rose-500 text-white'
                  : 'border-slate-500 bg-slate-900 text-transparent'
              }`}
            >
              <Check className="h-5 w-5" strokeWidth={3} />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-bold">
                {machineStopped ? 'Sim, a máquina parou' : 'Não, a máquina não parou'}
              </span>
              <span className="text-[11px] text-slate-400">
                {machineStopped
                  ? 'Toque para desmarcar se a máquina continuou a trabalhar'
                  : 'Toque para marcar se a máquina chegou a parar'}
              </span>
            </span>
          </button>
        </div>

        {/* 6. Descrição da Paragem */}
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
            <FileText className="h-3.5 w-3.5 text-amber-400" />
            <span>Descrição da paragem (Motivo / Causa) <span className="text-rose-400">*</span></span>
          </label>
          <textarea
            rows={2}
            value={stoppageDescription}
            onChange={(e) => setStoppageDescription(e.target.value)}
            placeholder="Ex: Alarme térmico no motor de tração, sensor encravado, falta de cartão..."
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none"
          />
          {errors.stoppageDescription && (
            <p className="mt-1 text-[11px] font-semibold text-rose-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.stoppageDescription}
            </p>
          )}
        </div>

        {/* 7. Descrição do que foi feito */}
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
            <Wrench className="h-3.5 w-3.5 text-emerald-400" />
            <span>Descrição do que foi feito (Ação Corretiva) <span className="text-rose-400">*</span></span>
          </label>
          <textarea
            rows={2}
            value={actionsTaken}
            onChange={(e) => setActionsTaken(e.target.value)}
            placeholder="Ex: Desbloqueio mecânico, limpeza de fotocélula, substituição de fusível..."
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
          />
          {errors.actionsTaken && (
            <p className="mt-1 text-[11px] font-semibold text-rose-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.actionsTaken}
            </p>
          )}
        </div>

        {/* 8. Outras Observações */}
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
            <FileText className="h-3.5 w-3.5 text-slate-400" />
            <span>Outras observações (Opcional)</span>
          </label>
          <textarea
            rows={2}
            value={otherObservations}
            onChange={(e) => setOtherObservations(e.target.value)}
            placeholder="Peças utilizadas, referências de catálogo, notas para o próximo turno..."
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-400 focus:border-slate-500 focus:outline-none"
          />
        </div>

        {/* 9. Decomposição de Etapas da Paragem (Opcional) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                playIndustrialClick();
                setIsDecomposingStages(!isDecomposingStages);
              }}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                isDecomposingStages
                  ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                  : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:border-slate-500'
              }`}
            >
              <Layers className="h-4 w-4 text-amber-400" />
              <span>
                {isDecomposingStages
                  ? 'Ocultar Decomposição de Etapas'
                  : '+ Decompor Paragem em Etapas (ex: 1h Mecânica + 30m Afinação)'}
              </span>
            </button>

            {isDecomposingStages && stages.length > 0 && (
              <span className="text-xs font-mono font-bold text-amber-300">
                {stages.length} etapas definidas ({stages.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0)}m)
              </span>
            )}
          </div>

          {isDecomposingStages && (
            <StagesEditor
              stages={stages}
              onChange={setStages}
              totalDurationMinutes={totalDurationMinutes}
              availableOperators={activeOps}
              availableStoppageTypes={availableStoppageTypes}
            />
          )}
        </div>

        {/* Bottom Action - Wireframe "Gravar e sair" */}
        <div className="pt-2 pb-6">
          {/* Validation Errors Notice */}
          {Object.keys(errors).length > 0 && (
            <div className="mb-3 rounded-xl border-2 border-rose-500 bg-rose-950/90 p-3.5 text-xs text-rose-200 shadow-xl space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 font-black text-rose-300 uppercase tracking-wide">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>Atenção: Por favor complete os campos em falta</span>
              </div>
              <div className="space-y-1 pl-6 text-[11px]">
                {Object.entries(errors).map(([k, msg]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(`field-${k}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    className="block text-left text-rose-300 hover:text-white underline font-semibold"
                  >
                    • {msg} (clique para ir ao campo)
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className={`group relative w-full overflow-hidden rounded-2xl border-2 border-emerald-500 bg-gradient-to-b from-emerald-600 to-emerald-700 py-4 px-6 text-center shadow-xl shadow-emerald-950/50 hover:brightness-110 active:scale-[0.98] transition-all ${
              isSaving ? 'opacity-70 cursor-wait' : ''
            }`}
          >
            <div className="flex items-center justify-center gap-2.5 text-white">
              <Save className="h-5 w-5" />
              <span className="text-lg font-black uppercase tracking-wider font-mono">
                {isSaving ? 'A Gravar...' : 'Gravar e Sair'}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              onCancel();
            }}
            className="mt-2.5 w-full rounded-xl border border-slate-700 bg-slate-800/80 py-3 text-center text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            ← Cancelar e Continuar a Contar
          </button>

          <p className="mt-2 text-center text-[11px] text-slate-400">
            O registo será guardado no histórico (com Turno {shift}) e a máquina voltará a estar operacional.
          </p>
        </div>
      </form>
    </div>
  );
};
