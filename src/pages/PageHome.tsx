import React from 'react';
import { Play, LogOut, History, CheckCircle2, ChevronRight, BarChart3, Settings2, QrCode } from 'lucide-react';
import { HeaderLogo } from '../components/HeaderLogo';
import { ActiveDowntime } from '../types/manutrack';
import { playIndustrialClick } from '../utils/audio';

interface PageHomeProps {
  onStartStoppage: () => void;
  onExit: () => void;
  activeDowntimes: ActiveDowntime[];
  onOpenActiveTimer: (downtime: ActiveDowntime) => void;
  onOpenActiveMonitoring?: () => void;
  onOpenManualEntry?: () => void;
  onOpenHistory: () => void;
  onOpenDashboard: () => void;
  onOpenAdmin: () => void;
  onOpenAvailability: () => void;
  onOpenShare?: () => void;
  totalSavedRecords: number;
}

export const PageHome: React.FC<PageHomeProps> = ({
  onStartStoppage,
  onExit,
  activeDowntimes,
  onOpenActiveTimer,
  onOpenActiveMonitoring,
  onOpenManualEntry,
  onOpenHistory,
  onOpenDashboard,
  onOpenAdmin,
  onOpenAvailability,
  onOpenShare,
  totalSavedRecords,
}) => {
  const handleStart = () => {
    playIndustrialClick();
    onStartStoppage();
  };

  const handleExit = () => {
    playIndustrialClick();
    onExit();
  };

  return (
    <div className="flex min-h-[90vh] flex-col justify-between py-6 px-4 sm:px-6">
      {/* Top Header - Exact Wireframe 'LOGOTIPO' Box */}
      <div>
        <HeaderLogo
          subtitle="Registo de Paragens de Linha"
          activeCount={activeDowntimes.length}
          onOpenShare={onOpenShare}
        />

        {/* Status Banner if there are active stoppages currently timing */}
        {activeDowntimes.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5 shadow-md">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
                <div>
                  <p className="text-xs font-bold text-amber-200">
                    {activeDowntimes.length === 1
                      ? '1 Máquina Parada em Contagem'
                      : `${activeDowntimes.length} Máquinas Paradas em Paralelo`}
                  </p>
                  <p className="text-[11px] text-amber-300/80 font-mono">
                    {activeDowntimes.map((d) => d.machineId).join(', ')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeDowntimes.length > 1 && onOpenActiveMonitoring && (
                  <button
                    onClick={() => {
                      playIndustrialClick();
                      onOpenActiveMonitoring();
                    }}
                    className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors shadow-sm"
                  >
                    <span>Painel ({activeDowntimes.length})</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => onOpenActiveTimer(activeDowntimes[0])}
                  className="flex items-center gap-1 rounded-lg border border-rose-500/50 bg-rose-500/20 px-2.5 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/30 transition-colors"
                >
                  <span>Ver {activeDowntimes[0].machineId}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Center Zone - Wireframe Primary Action "Iniciar Paragem" */}
      <div className="my-auto flex flex-col items-center justify-center py-6">
        <div className="w-full max-w-sm text-center">
          {/* Main Action Button - Matches Wireframe 'Iniciar Paragem' */}
          <button
            onClick={handleStart}
            className="group relative w-full overflow-hidden rounded-2xl border-2 border-amber-500 bg-gradient-to-b from-amber-500 to-amber-600 py-6 px-6 shadow-xl shadow-amber-500/20 active:scale-[0.98] transition-all hover:brightness-105"
          >
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950/20 text-white shadow-inner group-hover:scale-105 transition-transform">
                <Play className="h-8 w-8 fill-current translate-x-0.5" />
              </div>
              <div>
                <span className="text-2xl font-black uppercase tracking-wider text-slate-950 font-mono">
                  Iniciar Paragem
                </span>
                <p className="mt-1 text-xs font-semibold text-amber-950/80">
                  Selecionar máquina F01–F30 e cronometrar
                </p>
              </div>
            </div>
          </button>

          {/* Parallel Monitoring & Manual Entry Direct Row */}
          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            {onOpenActiveMonitoring && (
              <button
                onClick={() => {
                  playIndustrialClick();
                  onOpenActiveMonitoring();
                }}
                className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition-all active:scale-[0.98] ${
                  activeDowntimes.length > 0
                    ? 'border-rose-500/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50'
                    : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
              >
                <span className="relative flex h-2 w-2">
                  {activeDowntimes.length > 0 && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      activeDowntimes.length > 0 ? 'bg-rose-500' : 'bg-slate-500'
                    }`}
                  ></span>
                </span>
                <span className="truncate">
                  Painel Paralelo ({activeDowntimes.length})
                </span>
              </button>
            )}

            {onOpenManualEntry && (
              <button
                onClick={() => {
                  playIndustrialClick();
                  onOpenManualEntry();
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-all active:scale-[0.98] shadow-sm"
              >
                <span className="text-amber-400 font-mono font-bold">+</span>
                <span className="truncate">Registo Manual</span>
              </button>
            )}
          </div>

          {/* Quick Shortcuts to History, Dashboard */}
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <button
              onClick={() => {
                playIndustrialClick();
                onOpenAvailability();
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-sky-950/40 py-2.5 px-3 text-xs font-semibold text-sky-200 hover:bg-sky-900/50 transition-all active:scale-[0.98]"
            >
              <CheckCircle2 className="h-4 w-4 text-sky-400 shrink-0" />
              <span className="truncate">Disponibilidade</span>
            </button>

            <button
              onClick={() => {
                playIndustrialClick();
                onOpenDashboard();
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-700/80 hover:text-white transition-all active:scale-[0.98]"
            >
              <BarChart3 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="truncate">Dashboard OEE</span>
            </button>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <button
              onClick={() => {
                playIndustrialClick();
                onOpenHistory();
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-700/80 hover:text-white transition-all active:scale-[0.98]"
            >
              <History className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="truncate">Histórico ({totalSavedRecords})</span>
            </button>

            <button
              onClick={() => {
                playIndustrialClick();
                onOpenAdmin();
              }}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 py-2 px-2 text-xs font-bold text-slate-200 hover:border-amber-500 hover:text-amber-300 transition-all active:scale-[0.98]"
            >
              <Settings2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Backend & Pessoal</span>
            </button>
          </div>

          {onOpenShare && (
            <div className="mt-2.5 flex justify-center">
              <button
                onClick={() => {
                  playIndustrialClick();
                  onOpenShare();
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-950/20 py-2 px-2 text-xs font-bold text-amber-300 hover:bg-amber-900/30 hover:border-amber-500/50 transition-all active:scale-[0.98]"
              >
                <QrCode className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="truncate">Partilhar QR</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Zone - Wireframe Action "Sair" */}
      <div className="w-full max-w-sm mx-auto pt-4">
        <button
          onClick={handleExit}
          className="w-full rounded-2xl border-2 border-slate-700 bg-slate-900/90 py-4 px-6 text-center shadow-md hover:bg-slate-800 hover:border-slate-600 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center justify-center gap-2.5 text-slate-300">
            <LogOut className="h-5 w-5 text-slate-400" />
            <span className="text-lg font-bold uppercase tracking-wider font-mono">
              Sair
            </span>
          </div>
        </button>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          StopTRACK v2.4 · 30 Máquinas Industriais Monitorizadas (F01–F30)
        </p>
      </div>
    </div>
  );
};
