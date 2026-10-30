import React, { useMemo, useState } from 'react';
import {
  Pencil,
  X,
  Check,
  Power,
  Layers,
  Lock,
  AlertCircle,
  Calendar,
  Clock,
  Info,
} from 'lucide-react';
import {
  Operator,
  StoppageEditChanges,
  StoppageRecord,
  StoppageTypeItem,
} from '../types/manutrack';
import { StagesEditor } from './StagesEditor';
import { getAdminToken } from '../services/api';
import { playIndustrialClick } from '../utils/audio';
import {
  EDIT_PRIORITIES,
  EDIT_SHIFTS,
  EDIT_STATUSES,
  EditFormValues,
  MAX_TEXT_LENGTH,
  buildEditChanges,
  initialEditValues,
  validateEditChanges,
} from '../utils/stoppageEdit';

interface EditStoppageModalProps {
  isOpen: boolean;
  record: StoppageRecord | null;
  availableOperators?: Operator[];
  availableStoppageTypes?: StoppageTypeItem[];
  onClose: () => void;
  onSave: (
    id: string,
    changes: StoppageEditChanges,
    pin: string,
    baseLastEditedAt?: number
  ) => Promise<void>;
}

/** Garante que o valor atual aparece na lista, mesmo que já não exista nas opções configuradas. */
function withCurrent(options: string[], current: string): string[] {
  const list = Array.from(new Set(options.filter(Boolean)));
  if (current && !list.includes(current)) list.unshift(current);
  return list;
}

const FIELD_CARD = 'rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm';
const FIELD_LABEL = 'flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300';
const INPUT_BASE =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-semibold text-white focus:border-amber-500 focus:outline-none';
const TEXTAREA_BASE =
  'mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none';

function ChoiceButtons({
  options,
  value,
  onChange,
  columns,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  columns: string;
}) {
  return (
    <div className={`mt-2 grid gap-2 ${columns}`}>
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => {
              playIndustrialClick();
              onChange(option);
            }}
            className={`rounded-lg border px-2 py-2.5 text-xs font-bold transition-all ${
              selected
                ? 'border-amber-500 bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function EditStoppageForm({
  record,
  availableOperators,
  availableStoppageTypes,
  onClose,
  onSave,
}: Omit<EditStoppageModalProps, 'isOpen' | 'record'> & { record: StoppageRecord }) {
  const initial = useMemo(() => initialEditValues(record), [record]);
  const [values, setValues] = useState<EditFormValues>(initial);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStages, setShowStages] = useState(initial.stages.length > 0);

  // Administrador com sessão iniciada não precisa de PIN; os operadores precisam sempre.
  const requirePin = !getAdminToken();

  const activeOperators = (availableOperators || []).filter((operator) => operator.active);
  const starterNames = activeOperators.filter((o) => o.canStart).map((o) => o.name);
  const initiatorOptions = withCurrent(
    starterNames.length > 0 ? starterNames : activeOperators.map((o) => o.name),
    initial.initiatedBy
  );
  const closerOptions = withCurrent(activeOperators.map((o) => o.name), initial.closedBy);
  const typeOptions = withCurrent(
    (availableStoppageTypes || []).filter((type) => type.active).map((type) => type.name),
    initial.stoppageType
  );

  const changes = useMemo(() => buildEditChanges(initial, values), [initial, values]);
  const changedCount = Object.keys(changes).length;
  const set = <K extends keyof EditFormValues>(key: K, value: EditFormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setError(null);
  };

  const totalDurationMinutes = Math.max(1, Math.round((record.durationMs || 0) / 60000));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (changedCount === 0) {
      setError('Ainda não alterou nenhum campo.');
      return;
    }
    const validationError = validateEditChanges(changes);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (requirePin && !pin.trim()) {
      setError('Introduza o PIN de um operador autorizado a fechar paragens.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSave(record.id, changes, pin.trim(), record.lastEditedAt);
      // O ecrã do histórico fecha o formulário quando a gravação termina.
    } catch (err) {
      setIsSubmitting(false);
      setError(err instanceof Error ? err.message : 'Não foi possível guardar a edição.');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-slate-950/85 p-3 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="my-auto w-full max-w-xl overflow-hidden rounded-2xl border-2 border-slate-700 bg-slate-900 shadow-2xl"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/80 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-400">
              <Pencil className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Editar Paragem</h3>
              <p className="text-[11px] text-slate-400">
                {changedCount === 0
                  ? 'Altere os campos necessários'
                  : `${changedCount} ${changedCount === 1 ? 'campo alterado' : 'campos alterados'}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
            title="Fechar sem guardar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3.5 p-4">
          {/* Resumo (só leitura) */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-10 items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/20 font-mono text-xs font-black text-amber-300">
                  {record.machineId}
                </span>
                <span className="text-xs font-bold text-white">
                  {record.machineName || `Máquina ${record.machineId}`}
                </span>
              </div>
              <span className="font-mono text-xs font-black tabular-nums text-rose-400">
                {record.durationFormatted}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-800/80 pt-1.5 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {record.date}
              </span>
              <span className="flex items-center gap-1 font-mono">
                <Clock className="h-3 w-3" />
                {record.startTime} → {record.endTime}
              </span>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[10px] text-slate-500">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              <span>A máquina, a data, as horas e a duração não podem ser alteradas.</span>
            </p>
          </div>

          {/* Tipo de paragem */}
          <div className={FIELD_CARD}>
            <label className={FIELD_LABEL} htmlFor="edit-type">
              <Layers className="h-3.5 w-3.5 text-sky-400" />
              <span>Tipo de paragem</span>
            </label>
            <select
              id="edit-type"
              value={values.stoppageType}
              onChange={(e) => set('stoppageType', e.target.value)}
              className={`mt-2 ${INPUT_BASE}`}
            >
              {typeOptions.map((name) => (
                <option key={name} value={name} className="bg-slate-900 text-white">
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Prioridade */}
          <div className={FIELD_CARD}>
            <span className={FIELD_LABEL}>Prioridade da avaria</span>
            <ChoiceButtons
              options={EDIT_PRIORITIES}
              value={values.priority}
              onChange={(value) => set('priority', value)}
              columns="grid-cols-4"
            />
          </div>

          {/* Estado */}
          <div className={FIELD_CARD}>
            <span className={FIELD_LABEL}>Estado da avaria</span>
            <ChoiceButtons
              options={EDIT_STATUSES}
              value={values.status}
              onChange={(value) => set('status', value)}
              columns="grid-cols-3"
            />
          </div>

          {/* A máquina parou? */}
          <div className={FIELD_CARD}>
            <span className={FIELD_LABEL}>
              <Power className="h-3.5 w-3.5 text-rose-400" />
              <span>A máquina parou?</span>
              {values.machineStopped === undefined && (
                <span className="font-normal normal-case tracking-normal text-slate-500">
                  (por indicar)
                </span>
              )}
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                { label: 'Sim', value: true },
                { label: 'Não', value: false },
              ].map((option) => {
                const selected = values.machineStopped === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      playIndustrialClick();
                      set('machineStopped', option.value);
                    }}
                    className={`flex items-center justify-center gap-2 rounded-lg border-2 px-2 py-2.5 text-xs font-bold transition-all ${
                      selected
                        ? option.value
                          ? 'border-rose-500 bg-rose-500/15 text-rose-200'
                          : 'border-emerald-500 bg-emerald-500/15 text-emerald-200'
                        : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    {selected && <Check className="h-4 w-4" strokeWidth={3} />}
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Turno */}
          <div className={FIELD_CARD}>
            <span className={FIELD_LABEL}>Turno</span>
            <ChoiceButtons
              options={EDIT_SHIFTS}
              value={values.shift}
              onChange={(value) => set('shift', value)}
              columns="grid-cols-3"
            />
          </div>

          {/* Quem iniciou / quem fechou */}
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className={FIELD_CARD}>
              <label className={FIELD_LABEL} htmlFor="edit-initiated">
                Quem iniciou
              </label>
              <select
                id="edit-initiated"
                value={values.initiatedBy}
                onChange={(e) => set('initiatedBy', e.target.value)}
                className={`mt-2 ${INPUT_BASE}`}
              >
                {initiatorOptions.map((name) => (
                  <option key={name} value={name} className="bg-slate-900 text-white">
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className={FIELD_CARD}>
              <label className={FIELD_LABEL} htmlFor="edit-closed">
                Quem fechou
              </label>
              <select
                id="edit-closed"
                value={values.closedBy}
                onChange={(e) => set('closedBy', e.target.value)}
                className={`mt-2 ${INPUT_BASE}`}
              >
                {closerOptions.map((name) => (
                  <option key={name} value={name} className="bg-slate-900 text-white">
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Textos */}
          <div className={FIELD_CARD}>
            <label className={FIELD_LABEL} htmlFor="edit-description">
              Descrição da paragem (motivo / causa)
            </label>
            <textarea
              id="edit-description"
              rows={3}
              maxLength={MAX_TEXT_LENGTH}
              value={values.stoppageDescription}
              onChange={(e) => set('stoppageDescription', e.target.value)}
              className={TEXTAREA_BASE}
            />
          </div>
          <div className={FIELD_CARD}>
            <label className={FIELD_LABEL} htmlFor="edit-actions">
              Descrição do que foi feito (ação corretiva)
            </label>
            <textarea
              id="edit-actions"
              rows={3}
              maxLength={MAX_TEXT_LENGTH}
              value={values.actionsTaken}
              onChange={(e) => set('actionsTaken', e.target.value)}
              className={TEXTAREA_BASE}
            />
          </div>
          <div className={FIELD_CARD}>
            <label className={FIELD_LABEL} htmlFor="edit-observations">
              Outras observações (opcional)
            </label>
            <textarea
              id="edit-observations"
              rows={2}
              maxLength={MAX_TEXT_LENGTH}
              value={values.otherObservations}
              onChange={(e) => set('otherObservations', e.target.value)}
              className={TEXTAREA_BASE}
            />
          </div>

          {/* Etapas */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                playIndustrialClick();
                setShowStages((previous) => !previous);
              }}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                showStages
                  ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                  : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:border-slate-500 hover:text-white'
              }`}
            >
              <Layers className="h-4 w-4 text-amber-400" />
              <span>
                {showStages
                  ? 'Ocultar etapas'
                  : values.stages.length > 0
                  ? `Editar etapas (${values.stages.length})`
                  : '+ Decompor em etapas'}
              </span>
            </button>
            {showStages && (
              <StagesEditor
                stages={values.stages}
                onChange={(stages) => set('stages', stages)}
                totalDurationMinutes={totalDurationMinutes}
                availableOperators={activeOperators}
                availableStoppageTypes={availableStoppageTypes}
              />
            )}
          </div>

          {/* PIN */}
          <div className={FIELD_CARD}>
            <label className={FIELD_LABEL} htmlFor="edit-pin">
              <Lock className="h-3.5 w-3.5 text-amber-400" />
              <span>
                {requirePin ? 'PIN do operador (obrigatório)' : 'PIN do operador (opcional)'}
              </span>
            </label>
            <input
              id="edit-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                setError(null);
              }}
              disabled={isSubmitting}
              placeholder={requirePin ? 'PIN de quem está a editar' : 'Sessão de administrador ativa'}
              className={`mt-2 ${INPUT_BASE} tracking-[0.4em]`}
            />
            <p className="mt-1.5 text-[10px] text-slate-500">
              Só operadores autorizados a fechar paragens podem editar. O nome fica registado na paragem.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/60 bg-rose-950/60 p-3 text-xs font-semibold text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Ações */}
          <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-700 bg-slate-800 py-3 text-center text-xs font-bold text-slate-300 transition-all hover:bg-slate-700 hover:text-white active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || changedCount === 0}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500 bg-emerald-600 py-3 text-center text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-950/40 transition-all hover:bg-emerald-500 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>A guardar...</span>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Guardar alterações</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export const EditStoppageModal: React.FC<EditStoppageModalProps> = ({
  isOpen,
  record,
  availableOperators,
  availableStoppageTypes,
  onClose,
  onSave,
}) => {
  if (!isOpen || !record) return null;
  // A "key" reinicia o formulário sempre que se abre outra paragem.
  return (
    <EditStoppageForm
      key={record.id}
      record={record}
      availableOperators={availableOperators}
      availableStoppageTypes={availableStoppageTypes}
      onClose={onClose}
      onSave={onSave}
    />
  );
};
