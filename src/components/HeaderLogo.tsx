import React from 'react';
import { Activity, Clock, Cloud, QrCode } from 'lucide-react';

interface HeaderLogoProps {
  subtitle?: string;
  activeCount?: number;
  onOpenActiveList?: () => void;
  onOpenShare?: () => void;
  isCloudConnected?: boolean;
  compact?: boolean;
}

export const HeaderLogo: React.FC<HeaderLogoProps> = ({
  subtitle = 'Sistema de Controlo de Paragens',
  activeCount = 0,
  onOpenActiveList,
  onOpenShare,
  isCloudConnected = true,
  compact = false,
}) => {
  return (
    <header className="w-full">
      {/* Outer rounded border box with industrial stop-track styling */}
      <div
        className={`w-full rounded-2xl border-2 border-slate-700/80 bg-slate-900/90 shadow-lg backdrop-blur-md transition-all ${
          compact ? 'py-2.5 px-4' : 'py-3 px-5'
        }`}
      >
        <div className="flex items-center justify-between gap-2.5">
          {/* Logo Brand Mark & Wordmark */}
          <div className="flex items-center gap-3 min-w-0">
            {/* StopTRACK Industrial Octagon + Precision Track Reticle Logo */}
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600/25 via-rose-500/10 to-amber-500/10 border border-rose-500/40 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.25)]">
              <svg
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
              >
                {/* Octagonal Stop Perimeter */}
                <polygon
                  points="10,3 22,3 29,10 29,22 22,29 10,29 3,22 3,10"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  className="text-rose-500"
                />
                {/* Inner Tracking Crosshair Rings */}
                <circle
                  cx="16"
                  cy="16"
                  r="6.5"
                  stroke="#fbbf24"
                  strokeWidth="1.6"
                  strokeDasharray="3 2"
                  className="text-amber-400"
                />
                {/* Center Stop Square / Precision Point */}
                <rect
                  x="13"
                  y="13"
                  width="6"
                  height="6"
                  rx="1"
                  fill="#f43f5e"
                />
                {/* 4 Precision Reticle Ticks */}
                <line x1="16" y1="5.5" x2="16" y2="8" stroke="#f43f5e" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="16" y1="24" x2="16" y2="26.5" stroke="#f43f5e" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="5.5" y1="16" x2="8" y2="16" stroke="#f43f5e" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="24" y1="16" x2="26.5" y2="16" stroke="#f43f5e" strokeWidth="1.8" strokeLinecap="round" />
              </svg>

              {/* Status pulse dot */}
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 border border-slate-900"></span>
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight font-mono">
                  <span className="text-rose-500 font-black">Stop</span>
                  <span className="text-white font-extrabold tracking-wider">TRACK</span>
                </span>
                <span className="rounded bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 text-[9px] font-bold text-rose-300 uppercase tracking-widest font-mono">
                  INDUSTRIAL
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium truncate">
                {subtitle}
              </p>
            </div>
          </div>

          {/* Right Action Icons: Cloud Sync / QR Share / Active badge */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenShare && (
              <button
                type="button"
                onClick={onOpenShare}
                className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 p-2 text-slate-300 hover:text-rose-400 hover:border-slate-500 transition-colors shadow-sm"
                title="Partilhar e abrir no telemóvel via QR Code"
              >
                <QrCode className="h-4 w-4" />
              </button>
            )}

            {/* Right indicator if active stoppages exist */}
            {activeCount > 0 && onOpenActiveList && (
              <button
                onClick={onOpenActiveList}
                className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/50 transition-colors shadow-sm"
                title="Ver paragens ativas em curso"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                <span className="tabular-nums font-mono font-bold">{activeCount}</span>
                <span className="hidden sm:inline text-[11px]">ativas</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
