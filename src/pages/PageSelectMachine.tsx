import React, { useState } from 'react';
import { User, LogOut, ArrowLeft, Clock, AlertCircle, Lock } from 'lucide-react';
import { HeaderLogo } from '../components/HeaderLogo';
import { Machine, ActiveDowntime, Operator } from '../types/manutrack';
import { MACHINES_DATA } from '../data/initialData';
import { playIndustrialClick } from '../utils/audio';
import { getShiftInfo } from '../utils/shift';

interface PageSelectMachineProps {
  onSelectMachine: (machine: Machine, operator: string, shift: string, operatorId: string, pin: string) => Promise<void>;
  onExit: () => void;
  activeDowntimes: ActiveDowntime[];
  onOpenActiveTimer: (downtime: ActiveDowntime) => void;
  currentOperator: string;
  onSetOperator: (name: string) => void;
  availableOperators?: Operator[];
  onOpenAdmin?: () => void;
  dailyMachinePlan: { date: string; machineIds: string[] };
  onSetDailyMachinePlanned: (machine: Machine, planned: boolean) => Promise<void>;
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
  dailyMachinePlan,
  onSetDailyMachinePlanned,
}) => {
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const [operatorPin, setOperatorPin] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false);
  const [planUpdateError, setPlanUpdateError] = useState<string | null>(null);

  // Automatically calculated industrial shift based on current time:
  // 05:00 - 14:30 -> 1º Turno | 14:30 - 00:00 -> 2º Turno | 00:00 - 05:00 -> Turno Noturno
  const currentShift = getShiftInfo();

  // Only operators authorized to start stoppages
  const startAuthorized = availableOperators.filter((o) => o.canStart && o.active);

  // Map of active downtime by machine code for quick O(1) lookup
  const activeMap = new Map<string, ActiveDowntime>();
  activeDowntimes.forEach((d) => activeMap.set(d.machineId, d));

  const handleMachineClick = async (machine: Machine) => {
    playIndustrialClick();
    const existing = activeMap.get(machine.code);
    const isPlanned = dailyMachinePlan.machineIds.includes(machine.code);
    if (isEditingPlan) {
      setIsUpdatingPlan(true);
      setPlanUpdateError(null);
      try {
        await onSetDailyMachinePlanned(machine, !isPlanned);
      } catch (error) {
        setPlanUpdateError(error instanceof Error ? error.message : 'Não foi possível atualizar o plano diário.');
      } finally {
        setIsUpdatingPlan(false);
      }
      return;
    }
    if (existing) {
      // Machine already has an active downtime running -> allow inspecting timer
      onOpenActiveTimer(existing);
    } else if (!isPlanned) {
      return;
    } else {
      // Starting a new stoppage -> operator MUST be selected
      if (!currentOperator || !currentOperator.trim()) {
        setValidationError('Seleção obrigatória: Escolha quem inicia a paragem antes de clicar na máquina.');
        return;
      }
      const operator = startAuthorized.find((entry) => entry.id === selectedOperatorId);
      if (!operator || !operatorPin) {
        setValidationError('Selecione o operador e introduza o seu PIN individual.');
        return;
      }
      setValidationError(null);
      setIsStarting(true);
      try {
        await onSelectMachine(machine, currentOperator.trim(), currentShift.name, operator.id, operatorPin);
        setOperatorPin('');
      } catch (error) {
        setValidationError(error instanceof Error ? error.message : 'Não foi possível iniciar a paragem.');
      } finally {
        setIsStarting(false);
      }
    }
  };

  const handleOperatorChange = (operatorId: string) => {
    setSelectedOperatorId(operatorId);
    setOperatorPin('');
    onSetOperator(startAuthorized.find((operator) => operator.id === operatorId)?.name || '');
    if (operatorId) {
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
          </div>

          <div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedOperatorId}
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
                  {startAuthorized.map((operator) => (
                    <option key={operator.id} value={operator.id} className="bg-slate-900 text-white">
                      {operator.name}
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

              {selectedOperatorId && (
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={operatorPin}
                  onChange={(event) => setOperatorPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="PIN individual (4 a 8 dígitos)"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none"
                />
              )}

              {validationError && (
                <p className="mt-2 text-[11px] font-semibold text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{validationError}</span>
                </p>
              )}
            </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-700/80 bg-slate-900/90 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Plano diário {dailyMachinePlan.date ? `· ${dailyMachinePlan.date.split('-').reverse().join('/')}` : ''}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {isEditingPlan ? 'Toque nas máquinas para incluir ou retirar do plano.' : 'Máquinas bloqueadas não podem iniciar paragens.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsEditingPlan((editing) => !editing);
                setPlanUpdateError(null);
              }}
              disabled={isUpdatingPlan}
              className={`shrink-0 rounded-lg border px-3 py-2 text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isEditingPlan
                  ? 'border-emerald-500/60 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-900/50'
                  : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-amber-500 hover:text-amber-300'
              }`}
            >
              {isEditingPlan ? 'Concluir edição' : 'Editar plano do dia'}
            </button>
          </div>
          {planUpdateError && (
            <p className="mt-2 text-[11px] font-semibold text-rose-400" role="alert">{planUpdateError}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Planeada</span>
            <span className="flex items-center gap-1"><Lock className="h-3 w-3 text-rose-400" /> Fora do plano</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Parada</span>
          </div>
        </div>
      </div>

      {/* Main Grid - Exact 5-Column Grid F01 to F30 */}
      <div className="my-4">
        <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
          {MACHINES_DATA.map((machine) => {
            const active = activeMap.get(machine.code);
            const isStopped = !!active;
            const isPlanned = dailyMachinePlan.machineIds.includes(machine.code);
            const isLocked = !isPlanned;
            const isDisabled = isStarting || (isUpdatingPlan && isEditingPlan) || (!isEditingPlan && isLocked && !isStopped);
            const planColor = isPlanned
              ? 'border-emerald-500 bg-emerald-950/50 text-white hover:bg-emerald-900/60'
              : 'border-rose-500/70 bg-rose-950/40 text-rose-200 hover:bg-rose-900/50';

            return (
              <button
                key={machine.code}
                type="button"
                onClick={() => handleMachineClick(machine)}
                disabled={isDisabled}
                aria-label={`${machine.code}, ${isStopped ? 'parada ativa' : isPlanned ? 'planeada' : 'bloqueada'}`}
                title={!isEditingPlan && isLocked && !isStopped ? 'Inclua no plano diário para iniciar uma paragem' : undefined}
                className={`relative flex min-h-[58px] sm:min-h-[64px] flex-col items-center justify-center rounded-xl border-2 p-1.5 transition-all active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-80 ${
                  isEditingPlan
                    ? planColor
                    : isStopped
                      ? 'border-rose-500 bg-rose-950/60 text-white shadow-md shadow-rose-950/40 ring-1 ring-rose-500'
                      : isPlanned
                        ? 'border-emerald-500 bg-emerald-950/50 text-white hover:border-emerald-400 hover:bg-emerald-900/60 shadow-sm'
                        : 'border-rose-500/70 bg-rose-950/40 text-rose-200 shadow-sm'
                }`}
              >
                {isLocked && (
                  <Lock className="absolute -left-1 -top-1 h-4 w-4 rounded-full bg-slate-950 p-0.5 text-rose-400" />
                )}
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
                    isStopped ? 'text-rose-300' : isPlanned ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {isStopped ? 'Parada' : isPlanned ? 'Planeada' : 'Bloqueada'}
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
