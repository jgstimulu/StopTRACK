import React, { useState } from 'react';
import { User, LogOut, ArrowLeft, Plus, Clock, AlertCircle } from 'lucide-react';
import { HeaderLogo } from '../components/HeaderLogo';
import { Machine, ActiveDowntime, Operator } from '../types/manutrack';
import { MACHINES_DATA } from '../data/initialData';
import { playIndustrialClick } from '../utils/audio';
import { getShiftInfo } from '../utils/shift';

interface PageSelectMachineProps {
  onSelectMachine: (machine: Machine, operator: string, shift: string) => void;
  onExit: () => void;
  activeDowntimes: ActiveDowntime[];
  onOpenActiveTimer: (downtime: ActiveDowntime) => void;
  currentOperator: string;
  onSetOperator: (name: string) => void;
  availableOperators?: Operator[];
  onOpenAdmin?: () => void;
}

export const PageSelectMachine: React.FC<PageSelectMachineProps> = ({
  onSelectMachine,
  onExit,
  activeDowntimes,
  onOpenActiveTimer,
  currentOperator,
  onSetOperator,
  availableOperators = [],
  onOpenAdmin,
}) => {
  const [customOperators, setCustomOperators] = useState<string[]>([]);
  const [isAddingOperator, setIsAddingOperator] = useState(false);
  const [newOperatorName, setNewOperatorName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Automatically calculated industrial shift based on current time:
  // 05:00 - 14:30 -> 1º Turno | 14:30 - 00:00 -> 2º Turno | 00:00 - 05:00 -> Turno Noturno
  const currentShift = getShiftInfo();

  // Only operators authorized to start stoppages + custom additions
  const startAuthorized = availableOperators.filter((o) => o.canStart && o.active);
  const baseNames = startAuthorized.map((o) => o.name);
  const allAvailableNames = Array.from(new Set([...baseNames, ...customOperators]));

  // Map of active downtime by machine code for quick O(1) lookup
  const activeMap = new Map<string, ActiveDowntime>();
  activeDowntimes.forEach((d) => activeMap.set(d.machineId, d));

  const handleMachineClick = (machine: Machine) => {
    playIndustrialClick();
    const existing = activeMap.get(machine.code);
    if (existing) {
      // Machine already has an active downtime running -> allow inspecting timer
      onOpenActiveTimer(existing);
    } else {
      // Starting a new stoppage -> operator MUST be selected
      if (!currentOperator || !currentOperator.trim()) {
        setValidationError('Seleção obrigatória: Escolha quem inicia a paragem antes de clicar na máquina.');
        return;
      }
      setValidationError(null);
      // Start downtime immediately on this machine with shift recorded
      onSelectMachine(machine, currentOperator.trim(), currentShift.name);
    }
  };

  const handleOperatorChange = (val: string) => {
    onSetOperator(val);
    if (val.trim()) {
      setValidationError(null);
    }
  };

  const handleAddOperator = (e: React.FormEvent) => {
    e.preventDefault();
    if (newOperatorName.trim()) {
      const trimmed = newOperatorName.trim();
      if (!allAvailableNames.includes(trimmed)) {
        setCustomOperators((prev) => [...prev, trimmed]);
      }
      onSetOperator(trimmed);
      setNewOperatorName('');
      setIsAddingOperator(false);
      setValidationError(null);
    }
  };

  return (
    <div className="flex min-h-[92vh] flex-col justify-between py-5 px-3.5 sm:px-6">
      {/* Top Header */}
      <div>
        <HeaderLogo subtitle="Seleção de Máquina para Paragem" />

        {/* Shift Badge Strip - Automatically calculated */}
        <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-700/80 bg-slate-900/95 px-3.5 py-2.5 shadow-md">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-amber-400 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Turno Atual:
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-xs font-bold font-mono ${currentShift.badgeColor}`}
                >
                  <span className="h-2 w-2 rounded-full bg-current animate-pulse"></span>
                  {currentShift.label}
                </span>
              </div>
            </div>
          </div>
          <span className="text-[10px] text-slate-400 hidden sm:inline font-mono">
            Deteção Automática
          </span>
        </div>

        {/* Section: Quem Inicia - Strict Mandatory & NOT prefilled */}
        <div
          className={`mt-3 rounded-xl border p-3.5 shadow-md transition-all ${
            validationError
              ? 'border-rose-500 bg-rose-950/20 ring-1 ring-rose-500'
              : 'border-slate-700/80 bg-slate-900/90'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <User className={`h-4 w-4 ${validationError ? 'text-rose-400' : 'text-amber-400'}`} />
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Quem Inicia a Paragem <span className="text-rose-400">*</span>
              </label>
            </div>
            {!isAddingOperator && (
              <button
                type="button"
                onClick={() => setIsAddingOperator(true)}
                className="flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-300"
              >
                <Plus className="h-3 w-3" />
                <span>Outro nome</span>
              </button>
            )}
          </div>

          {isAddingOperator ? (
            <form onSubmit={handleAddOperator} className="flex gap-2">
              <input
                type="text"
                value={newOperatorName}
                onChange={(e) => setNewOperatorName(e.target.value)}
                placeholder="Nome do operador ou técnico..."
                autoFocus
                className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
              >
                Definir
              </button>
              <button
                type="button"
                onClick={() => setIsAddingOperator(false)}
                className="rounded-lg border border-slate-600 px-2 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
            </form>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <select
                  value={currentOperator}
                  onChange={(e) => handleOperatorChange(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-xs font-semibold text-white focus:outline-none ${
                    validationError
                      ? 'border-rose-500 bg-slate-800 focus:border-rose-400 ring-1 ring-rose-500/50'
                      : 'border-slate-700 bg-slate-800/90 focus:border-amber-500'
                  }`}
                >
                  <option value="" className="bg-slate-900 text-slate-400">
                    -- Selecione o Operador que Inicia (Obrigatório) --
                  </option>
                  {allAvailableNames.map((op) => (
                    <option key={op} value={op} className="bg-slate-900 text-white">
                      {op}
                    </option>
                  ))}
                </select>
                {onOpenAdmin && (
                  <button
                    type="button"
                    onClick={onOpenAdmin}
                    title="Configurar lista de operadores no backend"
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2.5 text-slate-400 hover:text-amber-400 hover:border-slate-600 transition-colors shrink-0"
                  >
                    <User className="h-4 w-4" />
                  </button>
                )}
              </div>

              {validationError && (
                <p className="mt-2 text-[11px] font-semibold text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{validationError}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Instructions banner */}
        <div className="mt-3 flex items-center justify-between text-xs px-1 text-slate-400">
          <span>Selecione a máquina (F01–F30):</span>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-500 inline-block"></span>
              Disponível
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500 inline-block"></span>
              Parada
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid - Exact 5-Column Grid F01 to F30 */}
      <div className="my-4">
        <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
          {MACHINES_DATA.map((machine) => {
            const active = activeMap.get(machine.code);
            const isStopped = !!active;

            return (
              <button
                key={machine.code}
                type="button"
                onClick={() => handleMachineClick(machine)}
                className={`relative flex min-h-[58px] sm:min-h-[64px] flex-col items-center justify-center rounded-xl border-2 p-1.5 transition-all active:scale-[0.95] ${
                  isStopped
                    ? 'border-rose-500 bg-rose-950/60 text-white shadow-md shadow-rose-950/40 ring-1 ring-rose-500'
                    : 'border-slate-700 bg-slate-900/90 text-slate-100 hover:border-amber-500 hover:bg-slate-800 shadow-sm'
                }`}
              >
                {/* Active Indicator if machine has ongoing downtime */}
                {isStopped && (
                  <span className="absolute -top-1.5 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </span>
                )}

                <span className="text-base sm:text-lg font-black tracking-tight font-mono">
                  {machine.code}
                </span>

                <span
                  className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-tight mt-0.5 ${
                    isStopped ? 'text-rose-300' : 'text-slate-400'
                  }`}
                >
                  {isStopped ? 'Parada' : 'Livre'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Area - Wireframe 'SAIR' Button placed on bottom right */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => {
            playIndustrialClick();
            onExit();
          }}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2 py-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Voltar</span>
        </button>

        {/* Wireframe Button "SAIR" */}
        <button
          type="button"
          onClick={() => {
            playIndustrialClick();
            onExit();
          }}
          className="rounded-xl border-2 border-slate-700 bg-slate-900/90 px-6 py-2.5 text-center shadow-md hover:border-slate-500 hover:bg-slate-800 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-2 text-slate-200">
            <LogOut className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-bold uppercase tracking-wider font-mono">
              SAIR
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};
