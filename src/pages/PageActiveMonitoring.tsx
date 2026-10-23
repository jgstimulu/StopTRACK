import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Clock,
  Play,
  Square,
  User,
  CheckCircle,
  Plus,
  Wrench,
  Layers,
  Activity,
  ArrowRightLeft,
  ChevronRight,
  Maximize2,
} from 'lucide-react';
import { HeaderLogo } from '../components/HeaderLogo';
import {
  ActiveDowntime,
  Operator,
  StoppageStage,
  StoppageStageLevel,
  StoppageTypeItem,
} from '../types/manutrack';
import { StageTransitionModal } from '../components/StageTransitionModal';
import { playIndustrialClick, playStopChime } from '../utils/audio';

interface PageActiveMonitoringProps {
  activeDowntimes: ActiveDowntime[];
  onOpenTimer: (downtime: ActiveDowntime) => void;
  onStopCounting: (downtime: ActiveDowntime, endTimestamp: number) => void;
  onStartNewStoppage: () => void;
  onBackToHome: () => void;
  availableOperators?: Operator[];
  availableStoppageTypes?: StoppageTypeItem[];
  onUpdateActiveDowntime?: (updated: ActiveDowntime) => void;
  onTransitionStage?: (
    downtime: ActiveDowntime,
    transition: {
      completedStage: StoppageStage;
      nextStageName: string;
      nextTechnician: string;
      nextLevel: StoppageStageLevel;
    }
  ) => void;
}

export const PageActiveMonitoring: React.FC<PageActiveMonitoringProps> = ({
  activeDowntimes,
  onOpenTimer,
  onStopCounting,
  onStartNewStoppage,
  onBackToHome,
  availableOperators = [],
  availableStoppageTypes = [],
  onUpdateActiveDowntime,
  onTransitionStage,
}) => {
  // Live tick state to re-render all counters in real-time
  const [now, setNow] = useState<number>(Date.now());

  // Modal state for stage transition
  const [transitioningDowntime, setTransitioningDowntime] = useState<ActiveDowntime | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const handleStop = (downtime: ActiveDowntime, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      playStopChime();
    } catch {}
    const endTimestamp = Date.now();
    try {
      onStopCounting(downtime, endTimestamp);
    } catch (err) {
      console.error('Erro ao parar contagem:', err);
    }
  };

  const handleFocus = (downtime: ActiveDowntime) => {
    playIndustrialClick();
    onOpenTimer(downtime);
  };

  const handleOpenTransition = (downtime: ActiveDowntime) => {
    playIndustrialClick();
    setTransitioningDowntime(downtime);
  };

  const activeOps = availableOperators.filter((o) => o.active);

  return (
    <div className="flex min-h-[92vh] flex-col py-4 px-3 sm:px-6 pb-28">
      {/* Top Header */}
      <div>
        <HeaderLogo subtitle="Sala de Controlo · Cronómetros Ativos em Paralelo" />

        {/* Navigation & Action Bar */}
        <div className="mt-3 flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              onBackToHome();
            }}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar ao Menu</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              onStartNewStoppage();
            }}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-amber-500/50 bg-amber-500/20 px-3.5 py-2 text-xs font-black text-amber-300 hover:bg-amber-500/30 transition-all shadow-sm active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 text-amber-400" />
            <span>+ Parar Outra Máquina</span>
          </button>
        </div>

        {/* Overview Stats Bar */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-2.5">
            <span className="text-[10px] uppercase font-bold text-rose-300/80 block">
              Máquinas Paradas
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              </span>
              <span className="text-xl font-black text-rose-400 font-mono">
                {activeDowntimes.length}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              Supervisão Concorrente
            </span>
            <p className="text-xs font-semibold text-slate-200 mt-1">
              {activeDowntimes.length <= 1 ? '1 Máquina' : `${activeDowntimes.length} em Simultâneo`}
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              Parque Operacional
            </span>
            <p className="text-xs font-semibold text-slate-200 mt-1">
              {30 - activeDowntimes.length} de 30 a produzir
            </p>
          </div>
        </div>
      </div>

      {/* Main List: Active Machines Live Cards (Vertical Stacked, Full Width, Zero Hidden Buttons) */}
      <div className="my-4 flex-1">
        {activeDowntimes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <CheckCircle className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Nenhuma máquina parada de momento
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                Todas as 30 máquinas da linha estão em pleno funcionamento contínuo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                playIndustrialClick();
                onStartNewStoppage();
              }}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>Iniciar Registo de Paragem</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {activeDowntimes.map((downtime) => {
              // Total stoppage elapsed
              const totalElapsedMs = Math.max(0, now - downtime.startTimestamp);
              const totalSec = Math.floor(totalElapsedMs / 1000);
              const hh = Math.floor(totalSec / 3600).toString().padStart(2, '0');
              const mm = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
              const ss = (totalSec % 60).toString().padStart(2, '0');

              // Current stage elapsed
              const stageStart = downtime.stageStartTimestamp || downtime.startTimestamp;
              const stageElapsedMs = Math.max(0, now - stageStart);
              const stageSec = Math.floor(stageElapsedMs / 1000);
              const sMm = Math.floor((stageSec % 3600) / 60).toString().padStart(2, '0');
              const sSs = (stageSec % 60).toString().padStart(2, '0');

              const isLongStoppage = totalSec >= 1800; // > 30 min
              const isVeryLong = totalSec >= 3600; // > 1h

              const currentStageName = downtime.currentStage || 'Intervenção Mecânica';
              const completedCount = downtime.completedStages?.length || 0;

              return (
                <div
                  key={downtime.id || downtime.machineId}
                  className={`rounded-2xl border-2 overflow-hidden bg-slate-900 shadow-xl transition-all ${
                    isVeryLong
                      ? 'border-rose-500 shadow-rose-950/40'
                      : isLongStoppage
                      ? 'border-amber-500/80 shadow-amber-950/30'
                      : 'border-slate-700'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/90 px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-10 w-12 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-950 text-lg font-black text-rose-300 font-mono shadow-sm">
                        {downtime.machineId}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white leading-tight">
                            {downtime.machineName}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>
                            Parada
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Iniciou às {downtime.startTimeFormatted} · {downtime.shift || '1º Turno'}
                        </p>
                      </div>
                    </div>

                    {completedCount > 0 && (
                      <span className="text-[10px] font-bold font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                        {completedCount} {completedCount === 1 ? 'etapa gravada' : 'etapas gravadas'}
                      </span>
                    )}
                  </div>

                  {/* Card Body: Live Dual Clock & Assignment */}
                  <div className="p-3.5 space-y-3">
                    {/* Live Digital Display: Total Machine Stoppage */}
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                        Tempo Total de Paragem
                      </span>
                      <div
                        className={`mt-1 font-mono text-3xl font-black tabular-nums tracking-wider ${
                          isVeryLong
                            ? 'text-rose-400'
                            : isLongStoppage
                            ? 'text-amber-400'
                            : 'text-white'
                        }`}
                      >
                        {hh}:{mm}:{ss}
                      </div>
                    </div>

                    {/* Active Stage Live Status Box */}
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 flex items-center gap-1.5 font-semibold">
                          <Layers className="h-3.5 w-3.5 text-amber-400" />
                          <span>Fase em Curso:</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                              (downtime.currentLevel || 1) === 1
                                ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                                : (downtime.currentLevel || 1) === 2
                                ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                                : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                            }`}
                          >
                            {(downtime.currentLevel || 1) === 1
                              ? '1. Diagnóstico'
                              : (downtime.currentLevel || 1) === 2
                              ? '2. Intervenção'
                              : '3. Fecho'}
                          </span>
                          <strong className="text-white font-bold">{currentStageName}</strong>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-amber-500/20">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-amber-400" />
                          <span>Tempo nesta Etapa:</span>
                        </span>
                        <span className="font-mono font-bold text-amber-200">
                          {sMm}m {sSs}s
                        </span>
                      </div>

                      {/* Dynamic Technician Assignment */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-500/20">
                        <span className="text-slate-400 flex items-center gap-1.5 shrink-0 text-xs">
                          <Wrench className="h-3.5 w-3.5 text-amber-400" />
                          <span>Técnico Alocado:</span>
                        </span>
                        {onUpdateActiveDowntime ? (
                          <select
                            value={downtime.assignedTechnician || ''}
                            onChange={(e) => {
                              onUpdateActiveDowntime({
                                ...downtime,
                                assignedTechnician: e.target.value,
                              });
                            }}
                            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-amber-300 font-semibold focus:border-amber-500 focus:outline-none max-w-[190px] truncate"
                          >
                            <option value="">A aguardar técnico</option>
                            {activeOps.map((op) => (
                              <option key={op.id} value={`${op.name} (${op.role})`}>
                                {op.name} ({op.role})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-amber-300 font-semibold text-xs truncate">
                            {downtime.assignedTechnician || 'A aguardar técnico'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Compact Stacked Vertical Buttons (100% Width, NEVER Clipped, Touch-First >= 44px) */}
                    <div className="space-y-2 pt-1">
                      {/* 1. Trocar Etapa (e.g. Mecânico acabou -> Supervisor arranca com a máquina) */}
                      <button
                        type="button"
                        onClick={() => handleOpenTransition(downtime)}
                        className="min-h-[44px] w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/60 bg-amber-500/20 py-2.5 px-3 text-xs font-black uppercase tracking-wider text-amber-300 hover:bg-amber-500/30 transition-all shadow-sm active:scale-[0.98]"
                      >
                        <ArrowRightLeft className="h-4 w-4 text-amber-400 shrink-0" />
                        <span>Trocar Etapa / Passar a Arranque</span>
                      </button>

                      {/* 2. Focar Relógio Grande */}
                      <button
                        type="button"
                        onClick={() => handleFocus(downtime)}
                        className="min-h-[44px] w-full flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm active:scale-[0.98]"
                      >
                        <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                        <span>Focar Relógio Grande</span>
                      </button>

                      {/* 3. Fechar Paragem Definitivamente */}
                      <button
                        type="button"
                        onClick={() => handleStop(downtime)}
                        className="min-h-[44px] w-full flex items-center justify-center gap-2 rounded-xl border-2 border-rose-500 bg-rose-600 py-2.5 px-3 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-500 transition-all shadow-md shadow-rose-950/50 active:scale-[0.98]"
                      >
                        <Square className="h-4 w-4 fill-current shrink-0" />
                        <span>Fechar Paragem e Emitir Relatório</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Stage Transition Modal */}
      {transitioningDowntime && (
        <StageTransitionModal
          isOpen={Boolean(transitioningDowntime)}
          onClose={() => setTransitioningDowntime(null)}
          activeDowntime={transitioningDowntime}
          availableOperators={availableOperators}
          availableStoppageTypes={availableStoppageTypes}
          onConfirmTransition={(transitionData) => {
            if (onTransitionStage) {
              onTransitionStage(transitioningDowntime, transitionData);
            }
          }}
        />
      )}

      {/* Footer Info */}
      <div className="border-t border-slate-800 pt-3 text-center text-[11px] text-slate-500">
        StopTRACK · Monitorização Industrial Concorrente em Tempo Real
      </div>
    </div>
  );
};
