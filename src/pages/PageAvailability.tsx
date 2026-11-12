import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, Lock, Wrench } from 'lucide-react';
import { Machine, MachineAvailabilityState, MachineAvailabilityStatus } from '../types/manutrack';

export type { MachineAvailabilityState, MachineAvailabilityStatus } from '../types/manutrack';

interface PageAvailabilityProps {
  machines: Machine[];
  availability: Record<string, MachineAvailabilityState>;
  onChangeMachine: (machineId: string, state: MachineAvailabilityState) => void;
  onConfirm: () => Promise<void>;
  onContinueWithoutChanges?: () => void;
  availabilityDate: string;
  isConfirmed: boolean;
  hasChanges: boolean;
  isSaving: boolean;
  saveError: string | null;
  savedAt: string | null;
}

const STATUS_STYLES: Record<
  MachineAvailabilityStatus,
  { button: string; label: string; shortLabel: string; icon: typeof CheckCircle2 }
> = {
  Disponível: {
    button: 'border-emerald-500/70 bg-emerald-950/50 text-emerald-100 hover:border-emerald-300 hover:bg-emerald-900/70',
    label: 'Disponível',
    shortLabel: 'Disponível',
    icon: CheckCircle2,
  },
  'Em manutenção': {
    button: 'border-amber-500/70 bg-amber-950/50 text-amber-100 hover:border-amber-300 hover:bg-amber-900/70',
    label: 'Em manutenção',
    shortLabel: 'Manutenção',
    icon: Wrench,
  },
  Indisponível: {
    button: 'border-rose-500/70 bg-rose-950/50 text-rose-100 hover:border-rose-300 hover:bg-rose-900/70',
    label: 'Indisponível',
    shortLabel: 'Indisponível',
    icon: Lock,
  },
};

const statusOptions: MachineAvailabilityStatus[] = ['Disponível', 'Em manutenção', 'Indisponível'];

function formatAvailabilityDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-PT');
}

export const PageAvailability: React.FC<PageAvailabilityProps> = ({
  machines,
  availability,
  onChangeMachine,
  onConfirm,
  onContinueWithoutChanges,
  availabilityDate,
  isConfirmed,
  hasChanges,
  isSaving,
  saveError,
  savedAt,
}) => {
  const [selectedMachineId, setSelectedMachineId] = useState(machines[0]?.id ?? '');
  const selectedMachine = machines.find((machine) => machine.id === selectedMachineId);
  const selectedState = selectedMachine
    ? availability[selectedMachine.id] ?? { status: 'Indisponível' as const, note: '' }
    : null;
  const availableCount = machines.filter(
    (machine) => (availability[machine.id]?.status ?? 'Indisponível') === 'Disponível'
  ).length;
  const needsAttention = machines.length - availableCount;

  return (
    <div className="flex min-h-[90vh] flex-col px-4 py-5">
      <div className="mb-4 rounded-2xl border border-slate-700/80 bg-slate-900/95 p-3.5 shadow-md">
        <h1 className="text-xl font-black text-white">Disponibilidade do parque</h1>
        <p className="mt-1 text-xs text-slate-300">
          As máquinas começam paradas. Toque nas que vão trabalhar para as disponibilizar.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/60 px-2.5 py-1 text-[11px] font-bold text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {availableCount} disponíveis
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/60 px-2.5 py-1 text-[11px] font-bold text-rose-200">
            <Lock className="h-3.5 w-3.5" />
            {needsAttention} paradas
          </span>
          <span className="ml-auto text-[11px] font-medium text-slate-400">
            Registo diário · {formatAvailabilityDate(availabilityDate)}
          </span>
        </div>
      </div>

      <div className="space-y-4 pb-44">
        <section aria-labelledby="machine-grid-heading" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="machine-grid-heading" className="text-sm font-bold uppercase tracking-[0.15em] text-slate-300">
              Todas as máquinas
            </h2>
            <span className="text-[11px] text-slate-400">{machines.length} máquinas</span>
          </div>

          <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
            {machines.map((machine) => {
              const state = availability[machine.id] ?? { status: 'Indisponível', note: '' };
              const style = STATUS_STYLES[state.status];
              const Icon = style.icon;
              const selected = selectedMachineId === machine.id;

              return (
                <button
                  key={machine.id}
                  type="button"
                  aria-label={`${machine.code}, ${style.label}. Toque para ${state.status === 'Disponível' ? 'parar' : 'disponibilizar'} a máquina e editar observações.`}
                  onClick={() => {
                    setSelectedMachineId(machine.id);
                    onChangeMachine(machine.id, {
                      ...state,
                      status: state.status === 'Disponível' ? 'Indisponível' : 'Disponível',
                    });
                  }}
                  className={`relative flex min-h-[58px] flex-col items-center justify-center rounded-xl border-2 p-1.5 transition-all active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${style.button} ${
                    selected ? 'ring-2 ring-white/70 ring-offset-1 ring-offset-slate-950' : 'shadow-sm'
                  }`}
                >
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-current opacity-80" aria-hidden="true" />
                  <Icon className="mb-0.5 h-3.5 w-3.5" aria-hidden="true" />
                  <span className="text-xs font-black tracking-tight">{machine.code}</span>
                  <span className="mt-0.5 text-[8px] font-bold uppercase leading-tight">{style.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </section>

        {selectedMachine && selectedState && (
          <section
            aria-labelledby="selected-machine-heading"
            className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="selected-machine-heading" className="text-sm font-bold text-white">
                  {selectedMachine.code} · {selectedMachine.name}
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-400">{selectedMachine.name}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold ${STATUS_STYLES[selectedState.status].button}`}>
                {React.createElement(STATUS_STYLES[selectedState.status].icon, { className: 'h-3.5 w-3.5' })}
                {STATUS_STYLES[selectedState.status].label}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {statusOptions.map((status) => {
                const selected = selectedState.status === status;
                const statusStyle = STATUS_STYLES[status];
                const StatusIcon = statusStyle.icon;
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChangeMachine(selectedMachine.id, { ...selectedState, status })}
                    className={`flex min-h-10 items-center justify-center gap-1 rounded-lg border px-2 py-2 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                      selected
                        ? statusStyle.button
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500 hover:text-white'
                    }`}
                  >
                    <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{status === 'Em manutenção' ? 'Manutenção' : status}</span>
                  </button>
                );
              })}
            </div>

            <label className="mt-3 block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Observações da máquina
              </span>
              <textarea
                value={selectedState.note}
                maxLength={500}
                rows={2}
                onChange={(event) => onChangeMachine(selectedMachine.id, { ...selectedState, note: event.target.value })}
                placeholder="Ex.: sem operador, aguardando material..."
                className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              />
            </label>
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent px-4 pb-4 pt-6">
        <div className="w-full max-w-[440px] space-y-2">
          {saveError && (
            <p role="alert" className="mb-2 rounded-lg border border-rose-500/50 bg-rose-950 px-3 py-2 text-xs font-medium text-rose-200">
              {saveError}
            </p>
          )}
          {isConfirmed && savedAt && (
            <p className="mb-2 text-center text-[10px] font-medium text-emerald-200">
              Registo no Supabase atualizado às {new Date(savedAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {onContinueWithoutChanges && !hasChanges && (
            <>
              {!isConfirmed && (
                <p className="text-center text-[10px] leading-relaxed text-slate-300">
                  Sem guardar, mantém-se o plano diário já registado; máquinas fora desse plano continuam bloqueadas.
                </p>
              )}
              <button
                type="button"
                onClick={onContinueWithoutChanges}
                disabled={isSaving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-200 transition-colors hover:border-slate-400 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-wait disabled:opacity-70"
              >
                Ir para o menu inicial sem alterar
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/50 bg-emerald-500 px-4 py-3.5 text-sm font-black uppercase tracking-[0.08em] text-slate-950 shadow-md shadow-emerald-950/40 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-wait disabled:opacity-70"
          >
            {isSaving ? <Circle className="h-4 w-4 animate-pulse" /> : <CheckCircle2 className="h-4 w-4" />}
            {isSaving ? 'A guardar no Supabase…' : isConfirmed ? 'Guardar alterações e continuar' : 'Guardar disponibilidade'}
            {!isSaving && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
