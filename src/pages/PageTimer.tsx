import React, { useEffect, useState } from 'react';
import {
  Square,
  ArrowLeft,
  Clock,
  User,
  Calendar,
  AlertOctagon,
  ArrowRightLeft,
  Layers,
  Wrench,
  CheckCircle2,
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

interface PageTimerProps {
  activeDowntime: ActiveDowntime;
  onStopCounting: (finalActiveDowntime: ActiveDowntime, endTimestamp: number) => void;
  onBackToHome: () => void;
  allActiveDowntimes?: ActiveDowntime[];
  onSwitchDowntime?: (downtime: ActiveDowntime) => void;
  onOpenMonitoring?: () => void;
  onAddNewStoppage?: () => void;
  availableOperators?: Operator[];
  availableStoppageTypes?: StoppageTypeItem[];
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

export const PageTimer: React.FC<PageTimerProps> = ({
  activeDowntime,
  onStopCounting,
  onBackToHome,
  allActiveDowntimes = [],
  onSwitchDowntime,
  onOpenMonitoring,
  onAddNewStoppage,
  availableOperators = [],
  availableStoppageTypes = [],
  onTransitionStage,
}) => {
  const [elapsedMs, setElapsedMs] = useState<number>(() => {
    return Math.max(0, Date.now() - activeDowntime.startTimestamp);
  });

  const [currentWallClock, setCurrentWallClock] = useState<string>(() => {
    return new Date().toTimeString().split(' ')[0];
  });

  const [isTransitionModalOpen, setIsTransitionModalOpen] = useState<boolean>(false);

  // Tick the stopwatch every 100ms for smooth live updates without CPU waste
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setElapsedMs(Math.max(0, now - activeDowntime.startTimestamp));
      setCurrentWallClock(new Date().toTimeString().split(' ')[0]);
    }, 100);

    return () => clearInterval(interval);
  }, [activeDowntime.startTimestamp]);

  const handleStop = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      playStopChime();
    } catch {}
    const endTimestamp = Date.now();
    try {
      onStopCounting(activeDowntime, endTimestamp);
    } catch (err) {
      console.error('Erro ao parar contagem:', err);
    }
  };

  // Compute hours, minutes, seconds, deciseconds
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const deciseconds = Math.floor((elapsedMs % 1000) / 100);

  const formattedHours = hours.toString().padStart(2, '0');
  const formattedMinutes = minutes.toString().padStart(2, '0');
  const formattedSeconds = seconds.toString().padStart(2, '0');

  // Current stage elapsed time
  const stageStart = activeDowntime.stageStartTimestamp || activeDowntime.startTimestamp;
  const stageElapsedMs = Math.max(0, Date.now() - stageStart);
  const stageTotalSec = Math.floor(stageElapsedMs / 1000);
  const stageMin = Math.floor(stageTotalSec / 60);
  const stageSec = stageTotalSec % 60;

  const currentStageName = activeDowntime.currentStage || 'Intervenção Mecânica';
  const completedCount = activeDowntime.completedStages?.length || 0;

  return (
    <div className="flex min-h-screen flex-col justify-between py-4 px-3 sm:px-6 pb-28">
      {/* Top Header - Wireframe LOGOTIPO Box */}
      <div>
        <HeaderLogo subtitle="Cronometragem em Curso" />

        {/* Multi-stoppage switcher bar if supervisor has multiple machines down */}
        {allActiveDowntimes.length > 1 && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-950/30 p-2.5">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping"></span>
                <span>{allActiveDowntimes.length} Paragens Ativas Simultâneas:</span>
              </span>
              {onOpenMonitoring && (
                <button
                  type="button"
                  onClick={() => {
                    playIndustrialClick();
                    onOpenMonitoring();
                  }}
                  className="text-[10px] font-bold text-amber-400 hover:text-amber-300 underline"
                >
                  Ver Painel Paralelo
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {allActiveDowntimes.map((dt) => {
                const isCurrent = dt.machineId === activeDowntime.machineId;
                return (
                  <button
                    key={dt.id || dt.machineId}
                    type="button"
                    onClick={() => {
                      if (!isCurrent && onSwitchDowntime) {
                        playIndustrialClick();
                        onSwitchDowntime(dt);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition-all shrink-0 ${
                      isCurrent
                        ? 'border-rose-500 bg-rose-500/20 text-rose-300 ring-1 ring-rose-500'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500 hover:text-white'
                    }`}
                  >
                    <span>{dt.machineId}</span>
                    {isCurrent ? (
                      <span className="text-[9px] bg-rose-500 text-slate-950 px-1 rounded font-sans">Atual</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-sans">Trocar</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Machine Info Bar */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-14 items-center justify-center rounded-2xl border-2 border-rose-500 bg-rose-950/70 shadow-lg shadow-rose-950/40">
              <span className="text-xl font-black text-rose-300 font-mono">
                {activeDowntime.machineId}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white leading-tight">
                  {activeDowntime.machineName}
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>
                  Parada
                </span>
                {activeDowntime.shift && (
                  <span className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold font-mono text-amber-300">
                    {activeDowntime.shift}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <User className="h-3 w-3 text-slate-400" />
                <span>Iniciada por: <strong className="text-slate-200">{activeDowntime.initiatedBy}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenMonitoring && (
              <button
                type="button"
                onClick={() => {
                  playIndustrialClick();
                  onOpenMonitoring();
                }}
                className="hidden sm:flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20"
                title="Ver todas as paragens em paralelo"
              >
                <span>Painel</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                playIndustrialClick();
                onBackToHome();
              }}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
              title="Voltar ao início enquanto a contagem continua no fundo"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Início</span>
            </button>
          </div>
        </div>

        {/* Current Sub-stage Info Banner with 3-Level Lifecycle */}
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/90 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-amber-400 shrink-0" />
              <div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      (activeDowntime.currentLevel || 1) === 1
                        ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                        : (activeDowntime.currentLevel || 1) === 2
                        ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                        : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    }`}
                  >
                    {(activeDowntime.currentLevel || 1) === 1
                      ? '1. Diagnóstico'
                      : (activeDowntime.currentLevel || 1) === 2
                      ? '2. Intervenção'
                      : '3. Fecho'}
                  </span>
                  <span className="text-xs font-bold text-white">{currentStageName}</span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                  <span>
                    Técnico: <strong className="text-slate-200">{activeDowntime.assignedTechnician || 'A aguardar'}</strong>
                  </span>
                  <span>·</span>
                  <span className="font-mono text-amber-300 font-bold">
                    {stageMin}m {stageSec}s nesta etapa
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                playIndustrialClick();
                setIsTransitionModalOpen(true);
              }}
              className="min-h-[38px] flex items-center gap-1.5 rounded-lg border border-amber-500/60 bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition-all shadow-sm active:scale-[0.98] shrink-0"
            >
              <ArrowRightLeft className="h-3.5 w-3.5 text-amber-400" />
              <span>Trocar Etapa</span>
            </button>
          </div>

          {/* Stepper bar: 1. Diagnóstico -> 2. Intervenção -> 3. Fecho */}
          <div className="grid grid-cols-3 gap-1 pt-1 border-t border-slate-800 text-[10px] font-mono font-bold text-center">
            <span
              className={`py-0.5 rounded ${
                (activeDowntime.currentLevel || 1) === 1
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-500'
              }`}
            >
              1. Diagnóstico
            </span>
            <span
              className={`py-0.5 rounded ${
                (activeDowntime.currentLevel || 1) === 2
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-500'
              }`}
            >
              2. Intervenção {completedCount > 0 ? `(${completedCount + 1}ª)` : ''}
            </span>
            <span
              className={`py-0.5 rounded ${
                (activeDowntime.currentLevel || 1) === 3
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-500'
              }`}
            >
              3. Fecho
            </span>
          </div>
        </div>
      </div>

      {/* Central Zone - Large Circular Stopwatch */}
      <div className="my-auto flex flex-col items-center justify-center py-4">
        <div className="relative flex items-center justify-center">
          {/* Outer Pulsing Glow */}
          <div className="absolute inset-0 rounded-full bg-rose-600/10 blur-2xl animate-pulse"></div>

          {/* SVG Circular Gauge */}
          <div className="relative flex h-60 w-60 sm:h-68 sm:w-68 items-center justify-center rounded-full border-4 border-slate-700/80 bg-slate-900/95 shadow-2xl">
            {/* SVG Progress Ring */}
            <svg className="absolute inset-0 h-full w-full -rotate-90 p-1" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="rgba(51, 65, 85, 0.4)"
                strokeWidth="2.5"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#f43f5e"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray="282.7"
                strokeDashoffset={282.7 - (282.7 * ((seconds + deciseconds / 10) % 60)) / 60}
                className="transition-all duration-100 ease-linear"
              />
            </svg>

            {/* Inner Content */}
            <div className="flex flex-col items-center justify-center text-center z-10 px-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                TEMPO TOTAL DE PARAGEM
              </span>

              {/* Digital Stopwatch Display */}
              <div className="mt-2 flex items-baseline font-mono tracking-tight text-white">
                <span className="text-3xl sm:text-4xl font-black tabular-nums">
                  {formattedHours}:{formattedMinutes}:{formattedSeconds}
                </span>
                <span className="ml-1 text-base sm:text-lg font-bold text-rose-400 tabular-nums">
                  .{deciseconds}
                </span>
              </div>

              {/* Start Time & Current Time Reference */}
              <div className="mt-2 flex flex-col items-center gap-0.5 border-t border-slate-800 pt-1.5 text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-amber-400" />
                  <span>Início: <strong className="text-slate-200 font-mono">{activeDowntime.startTimeFormatted}</strong></span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Agora: <span className="font-mono">{currentWallClock}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Status Note */}
        <p className="mt-3 text-center text-xs text-slate-400 max-w-xs">
          A contagem continua até premir &quot;Parar Contagem&quot;. Pode trocar de etapa a qualquer instante.
        </p>
      </div>

      {/* Bottom Zone - Action Buttons: Trocar Etapa & Parar Contagem */}
      <div className="w-full max-w-sm mx-auto space-y-2.5 pt-1">
        {/* Button 1: Trocar Etapa (Passar a Arranque / Afinação sem parar relógio) */}
        <button
          type="button"
          onClick={() => {
            playIndustrialClick();
            setIsTransitionModalOpen(true);
          }}
          className="min-h-[44px] w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/60 bg-amber-500/20 py-3 px-4 text-xs font-black uppercase tracking-wider text-amber-300 hover:bg-amber-500/30 transition-all shadow-sm active:scale-[0.98]"
        >
          <ArrowRightLeft className="h-4 w-4 text-amber-400" />
          <span>Trocar Etapa (Ex: Passar a Arranque)</span>
        </button>

        {/* Button 2: Parar Contagem Definitivamente */}
        <button
          type="button"
          onClick={handleStop}
          className="min-h-[48px] group relative w-full overflow-hidden rounded-2xl border-2 border-rose-500 bg-gradient-to-b from-rose-600 to-rose-700 py-3.5 px-5 text-center shadow-xl shadow-rose-950/50 hover:brightness-110 active:scale-[0.98] transition-all"
        >
          <div className="flex items-center justify-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950/30 text-white shadow-inner">
              <Square className="h-4 w-4 fill-current" />
            </div>
            <div className="text-left">
              <span className="block text-lg font-black uppercase tracking-wider text-white font-mono leading-none">
                Parar contagem
              </span>
              <span className="text-[11px] font-semibold text-rose-200">
                Fechar paragem e registar relatório
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* Stage Transition Modal */}
      {isTransitionModalOpen && (
        <StageTransitionModal
          isOpen={isTransitionModalOpen}
          onClose={() => setIsTransitionModalOpen(false)}
          activeDowntime={activeDowntime}
          availableOperators={availableOperators}
          availableStoppageTypes={availableStoppageTypes}
          onConfirmTransition={(transitionData) => {
            if (onTransitionStage) {
              onTransitionStage(activeDowntime, transitionData);
            }
          }}
        />
      )}
    </div>
  );
};
