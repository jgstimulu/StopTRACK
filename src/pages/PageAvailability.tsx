import React from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Machine } from '../types/manutrack';

export type MachineAvailabilityStatus = 'Disponível' | 'Em manutenção' | 'Indisponível';

export interface MachineAvailabilityState {
  status: MachineAvailabilityStatus;
  note: string;
}

interface PageAvailabilityProps {
  machines: Machine[];
  availability: Record<string, MachineAvailabilityState>;
  onChangeMachine: (machineId: string, state: MachineAvailabilityState) => void;
  onConfirm: () => void;
}

const STATUS_STYLES: Record<MachineAvailabilityStatus, { button: string; dot: string; label: string }> = {
  Disponível: {
    button: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20',
    dot: 'bg-emerald-400',
    label: 'Disponível',
  },
  'Em manutenção': {
    button: 'border-amber-500/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20',
    dot: 'bg-amber-400',
    label: 'Em manutenção',
  },
  Indisponível: {
    button: 'border-rose-500/50 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
    dot: 'bg-rose-400',
    label: 'Indisponível',
  },
};

const statusOptions: MachineAvailabilityStatus[] = ['Disponível', 'Em manutenção', 'Indisponível'];

export const PageAvailability: React.FC<PageAvailabilityProps> = ({
  machines,
  availability,
  onChangeMachine,
  onConfirm,
}) => {
  const groupedByLine = {
    'Linha 1': machines.filter((machine) => machine.section === 'Linha 1'),
    'Linha 2': machines.filter((machine) => machine.section === 'Linha 2'),
    'Linha 3': machines.filter((machine) => machine.section === 'Linha 3'),
  };

  return (
    <div className="flex min-h-[90vh] flex-col px-4 py-5">
      <div className="mb-4 rounded-2xl border border-sky-500/40 bg-sky-950/40 p-3.5 shadow-lg shadow-sky-900/20">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">Primeiro passo do dia</p>
        <h1 className="mt-2 text-xl font-black text-white">Disponibilidade do parque</h1>
        <p className="mt-1 text-xs text-slate-300">
          Registe o estado das máquinas antes de abrir as restantes funções do sistema.
        </p>
      </div>

      <div className="space-y-4 pb-24">
        {Object.entries(groupedByLine).map(([lineName, lineMachines]) => (
          <div key={lineName} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-300">{lineName}</h2>
              <span className="text-[11px] text-slate-400">
                {lineMachines.filter((machine) => (availability[machine.id]?.status ?? 'Disponível') !== 'Disponível').length}/{lineMachines.length} em alerta
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {lineMachines.map((machine) => {
                const state = availability[machine.id] ?? { status: 'Disponível', note: '' };
                const style = STATUS_STYLES[state.status];

                return (
                  <div key={machine.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                        <div>
                          <p className="text-sm font-black text-white">{machine.id}</p>
                          <p className="text-[10px] text-slate-400">{machine.name}</p>
                        </div>
                      </div>

                      <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${style.button}`}>
                        {style.label}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {statusOptions.map((status) => {
                        const selected = state.status === status;
                        const statusStyle = STATUS_STYLES[status];
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => onChangeMachine(machine.id, { ...state, status })}
                            className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors ${
                              selected
                                ? statusStyle.button
                                : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:border-slate-500 hover:text-white'
                            }`}
                          >
                            {status}
                          </button>
                        );
                      })}
                    </div>

                    <label className="mt-2 block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Observações
                      </span>
                      <input
                        value={state.note}
                        onChange={(event) => onChangeMachine(machine.id, { ...state, note: event.target.value })}
                        placeholder="Ex.: em manutenção, sem operador, aguardando material..."
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent px-4 pb-4 pt-6">
        <button
          type="button"
          onClick={onConfirm}
          className="flex w-full max-w-[440px] items-center justify-center gap-2 rounded-2xl border border-emerald-500/50 bg-emerald-500 px-4 py-3.5 text-sm font-black uppercase tracking-[0.12em] text-slate-950 shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400"
        >
          <CheckCircle2 className="h-4 w-4" />
          Confirmar disponibilidade
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
