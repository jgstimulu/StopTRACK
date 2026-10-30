import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Save,
  Clock,
  Calendar,
  Wrench,
  User,
  AlertCircle,
  FileText,
  Layers,
  Sunrise,
  Sun,
  Moon,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Flame,
  Check,
  RotateCcw,
  Pencil,
  Power,
  Edit3,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import {
  StoppageRecord,
  StoppageStage,
  Operator,
  StoppageTypeItem,
  StoppagePriority,
  StoppageStatus,
} from '../types/manutrack';
import { MACHINES_DATA, INITIAL_STOPPAGE_TYPES } from '../data/initialData';
import { StagesEditor } from './StagesEditor';
import {
  formatDurationMs,
  normalizeDateToYMD,
  formatDatePt,
  getLocalYMD,
} from '../utils/formatters';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';

interface EditStoppageModalProps {
  isOpen: boolean;
  record: StoppageRecord | null;
  onClose: () => void;
  onSave: (updatedRecord: StoppageRecord, pin?: string) => Promise<void>;
  availableOperators?: Operator[];
  availableStoppageTypes?: StoppageTypeItem[];
  initialPin?: string;
}

export const EditStoppageModal: React.FC<EditStoppageModalProps> = ({
  isOpen,
  record,
  onClose,
  onSave,
  availableOperators = [],
  availableStoppageTypes = INITIAL_STOPPAGE_TYPES,
  initialPin = '',
}) => {
  const [pin, setPin] = useState<string>(initialPin);
  const [machineId, setMachineId] = useState<string>('F01');
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('08:00');
  const [endTime, setEndTime] = useState<string>('09:00');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [shift, setShift] = useState<string>('1º Turno');
  const [priority, setPriority] = useState<StoppagePriority>('Média');
  const [status, setStatus] = useState<StoppageStatus>('Resolvido');
  const [machineStopped, setMachineStopped] = useState<boolean>(true);
  const [stoppageType, setStoppageType] = useState<string>('Avaria Mecânica');
  const [initiatedBy, setInitiatedBy] = useState<string>('');
  const [closedBy, setClosedBy] = useState<string>('');
  const [isCustomInitiator, setIsCustomInitiator] = useState<boolean>(false);
  const [isCustomCloser, setIsCustomCloser] = useState<boolean>(false);
  const [stoppageDescription, setStoppageDescription] = useState<string>('');
  const [actionsTaken, setActionsTaken] = useState<string>('');
  const [otherObservations, setOtherObservations] = useState<string>('');
  const [isDecomposingStages, setIsDecomposingStages] = useState<boolean>(false);
  const [stages, setStages] = useState<StoppageStage[]>([]);

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const formRef = useRef<HTMLDivElement>(null);
  const loadedRecordIdRef = useRef<string | null>(null);

  const activeOps = useMemo(
    () => availableOperators.filter((o) => o.active),
    [availableOperators]
  );

  // Combined types list: default/configured types + current record stoppageType
  const typesList = useMemo(() => {
    const list: string[] = [];
    availableStoppageTypes.forEach((st) => {
      if (st.name && !list.includes(st.name)) list.push(st.name);
    });
    if (record?.stoppageType && !list.includes(record.stoppageType)) {
      list.push(record.stoppageType);
    }
    return list;
  }, [availableStoppageTypes, record]);

  // Combined operator names list: active operators + current record names
  const operatorNamesList = useMemo(() => {
    const names = new Set<string>();
    activeOps.forEach((op) => names.add(op.name));
    if (record?.initiatedBy && record.initiatedBy.trim()) {
      names.add(record.initiatedBy.trim());
    }
    if (record?.closedBy && record.closedBy.trim()) {
      names.add(record.closedBy.trim());
    }
    return Array.from(names);
  }, [activeOps, record]);

  // Populate form fields ONLY when opening or when a new record is loaded (never while actively editing)
  useEffect(() => {
    if (!isOpen || !record) {
      loadedRecordIdRef.current = null;
      return;
    }

    if (loadedRecordIdRef.current === record.id) {
      return;
    }
    loadedRecordIdRef.current = record.id;

    setMachineId(record.machineId || 'F01');
    const ymd = normalizeDateToYMD(record.date, record.startTimestamp) || getLocalYMD();
    setDate(ymd);

    const sTime = record.startTime ? record.startTime.slice(0, 5) : '08:00';
    const eTime = record.endTime ? record.endTime.slice(0, 5) : '09:00';
    setStartTime(sTime);
    setEndTime(eTime);

    const mins = Math.max(1, Math.round((record.durationMs || 3600000) / 60000));
    setDurationMinutes(mins);

    setShift(record.shift || '1º Turno');
    setPriority((record.priority as StoppagePriority) || 'Média');
    setStatus((record.status as StoppageStatus) || 'Resolvido');
    setMachineStopped(record.machineStopped !== false);
    setStoppageType(record.stoppageType || 'Avaria Mecânica');
    setInitiatedBy(record.initiatedBy || '');
    setClosedBy(record.closedBy || '');
    setIsCustomInitiator(!availableOperators.some((op) => op.active && op.name === record.initiatedBy));
    setIsCustomCloser(!availableOperators.some((op) => op.active && op.name === record.closedBy));
    setStoppageDescription(record.stoppageDescription || '');
    setActionsTaken(record.actionsTaken || '');
    setOtherObservations(record.otherObservations || '');

    const initialStages = Array.isArray(record.stages) ? record.stages : [];
    setStages(initialStages);
    setIsDecomposingStages(initialStages.length > 0);

    setErrors({});
    setIsSubmitting(false);
    setPin(initialPin || '');
  }, [isOpen, record?.id, initialPin]);

  if (!isOpen || !record) return null;

  // Selected Machine metadata
  const selectedMachine = MACHINES_DATA.find((m) => m.code === machineId) || MACHINES_DATA[0];

  // Duration in milliseconds & formatted string
  const durationMs = durationMinutes * 60 * 1000;
  const durationFormatted = formatDurationMs(durationMs);

  // Recalculate duration & auto-detect shift when start or end time changes
  const handleTimeChange = (newStart: string, newEnd: string) => {
    setStartTime(newStart);
    setEndTime(newEnd);

    if (!newStart || !newEnd) return;
    const [sh, sm] = newStart.split(':').map(Number);
    const [eh, em] = newEnd.split(':').map(Number);
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return;

    let startTotalMins = sh * 60 + sm;
    let endTotalMins = eh * 60 + em;

    if (endTotalMins < startTotalMins) {
      endTotalMins += 24 * 60;
    }

    const diff = Math.max(1, endTotalMins - startTotalMins);
    setDurationMinutes(diff);

    // Auto-detect shift
    if (startTotalMins >= 300 && startTotalMins < 870) {
      setShift('1º Turno');
    } else if (startTotalMins >= 870 && startTotalMins < 1440) {
      setShift('2º Turno');
    } else {
      setShift('Turno Noturno');
    }
  };

  const handleDurationPreset = (addedMins: number) => {
    playIndustrialClick();
    if (!startTime) return;
    const [sh, sm] = startTime.split(':').map(Number);
    if (isNaN(sh) || isNaN(sm)) return;

    const startTotal = sh * 60 + sm;
    const endTotal = (startTotal + addedMins) % (24 * 60);
    const eh = Math.floor(endTotal / 60).toString().padStart(2, '0');
    const em = (endTotal % 60).toString().padStart(2, '0');
    setEndTime(`${eh}:${em}`);
    setDurationMinutes(addedMins);
  };

  const validate = (): boolean => {
    const errs: { [key: string]: string } = {};

    if (!date.trim()) {
      errs.date = 'Indique a data da paragem.';
    }
    if (!startTime.trim()) {
      errs.startTime = 'Indique a hora de início.';
    }
    if (!endTime.trim()) {
      errs.endTime = 'Indique a hora de fim.';
    }
    if (!initiatedBy.trim()) {
      errs.initiatedBy = 'Indique quem iniciou a paragem.';
    }
    if (!closedBy.trim()) {
      errs.closedBy = 'Indique quem fechou a paragem.';
    }
    if (!stoppageType.trim()) {
      errs.stoppageType = 'Selecione o tipo de paragem.';
    }
    if (!pin.trim()) {
      errs.pin = 'Indique o PIN de autorização obrigatório.';
    } else if (pin.trim().length < 4) {
      errs.pin = 'O PIN deve ter pelo menos 4 caracteres.';
    }

    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      const firstKey = Object.keys(errs)[0];
      const el = document.getElementById(`field-${firstKey}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return false;
    }

    return true;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    if (!validate()) {
      playIndustrialClick();
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Calculate timestamps based on date and time
      const [year, month, day] = date.split('-').map(Number);
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);

      const startDateObj = new Date(year, month - 1, day, sh, sm, 0, 0);
      let endDateObj = new Date(year, month - 1, day, eh, em, 0, 0);
      if (endDateObj.getTime() < startDateObj.getTime()) {
        // Wrapped past midnight
        endDateObj = new Date(year, month - 1, day + 1, eh, em, 0, 0);
      }

      const calculatedStartTimestamp = !isNaN(startDateObj.getTime())
        ? startDateObj.getTime()
        : record.startTimestamp;
      const calculatedEndTimestamp = !isNaN(endDateObj.getTime())
        ? endDateObj.getTime()
        : calculatedStartTimestamp + durationMs;

      const formattedPtDate = formatDatePt(startDateObj);

      // Preserve seconds from record if existing, otherwise append 00
      const cleanStartTime = startTime.length === 5 ? `${startTime}:00` : startTime;
      const cleanEndTime = endTime.length === 5 ? `${endTime}:00` : endTime;

      const updatedRecord: StoppageRecord = {
        ...record,
        machineId: selectedMachine.code,
        machineName: selectedMachine.name,
        date: formattedPtDate,
        startTime: cleanStartTime,
        endTime: cleanEndTime,
        startTimestamp: calculatedStartTimestamp,
        endTimestamp: calculatedEndTimestamp,
        durationMs,
        durationFormatted,
        shift: shift.trim(),
        priority,
        status,
        machineStopped,
        initiatedBy: initiatedBy.trim(),
        closedBy: closedBy.trim(),
        stoppageType: stoppageType.trim(),
        stoppageDescription: stoppageDescription.trim() || `${stoppageType} na ${selectedMachine.code}`,
        actionsTaken: actionsTaken.trim() || 'Intervenção efetuada e validada.',
        otherObservations: otherObservations.trim() || undefined,
        stages: isDecomposingStages && stages.length > 0 ? stages : undefined,
      };

      await onSave(updatedRecord, pin.trim());
      playSuccessChime();
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setErrors({ form: err.message || 'Falha ao gravar correções da paragem na base de dados central.' });
      playIndustrialClick();
      // Scroll to bottom or top where error is visible
      if (formRef.current) {
        formRef.current.scrollTop = 0;
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl max-h-[94vh] flex flex-col rounded-2xl border-2 border-slate-700 bg-slate-900 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/90 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <Pencil className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Editar Paragem Fechada
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                  {record.machineId}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Correção retroativa de máquina, datas, avaria, operadores e etapas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div ref={formRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Top Error Alert if API error */}
          {errors.form && (
            <div className="rounded-xl border border-rose-500/60 bg-rose-950/80 p-3.5 text-xs font-semibold text-rose-200 flex items-start gap-2.5 shadow-lg animate-shake">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-300">Erro ao gravar correções:</p>
                <p className="text-slate-300 mt-0.5">{errors.form}</p>
              </div>
            </div>
          )}

          {/* Section 1: Machine, Date & Time Range */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-amber-400" />
              <span>Máquina e Horário da Paragem</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Machine selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Máquina <span className="text-rose-400">*</span>
                </label>
                <select
                  value={machineId}
                  onChange={(e) => {
                    playIndustrialClick();
                    setMachineId(e.target.value);
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
                >
                  {MACHINES_DATA.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.code} - {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div id="field-date">
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Data (AAAA-MM-DD) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      if (errors.date) setErrors((prev) => ({ ...prev, date: '' }));
                    }}
                    className={`w-full rounded-xl border pl-8 pr-3 py-2 text-xs font-bold text-white focus:outline-none ${
                      errors.date
                        ? 'border-rose-500 bg-rose-950/30'
                        : 'border-slate-700 bg-slate-800 focus:border-amber-400'
                    }`}
                  />
                </div>
                {errors.date && <p className="text-[10px] text-rose-400 mt-1 font-semibold">{errors.date}</p>}
              </div>

              {/* Shift */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Turno Industrial
                </label>
                <select
                  value={shift}
                  onChange={(e) => {
                    playIndustrialClick();
                    setShift(e.target.value);
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-amber-300 focus:border-amber-400 focus:outline-none"
                >
                  <option value="1º Turno">1º Turno (05:00 - 14:30)</option>
                  <option value="2º Turno">2º Turno (14:30 - 00:00)</option>
                  <option value="Turno Noturno">Turno Noturno (00:00 - 05:00)</option>
                </select>
              </div>
            </div>

            {/* Time row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div id="field-startTime">
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Hora de Início (HH:MM) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => {
                      handleTimeChange(e.target.value, endTime);
                      if (errors.startTime) setErrors((prev) => ({ ...prev, startTime: '' }));
                    }}
                    className={`w-full rounded-xl border pl-8 pr-3 py-2 text-xs font-mono font-bold text-white focus:outline-none ${
                      errors.startTime
                        ? 'border-rose-500 bg-rose-950/30'
                        : 'border-slate-700 bg-slate-800 focus:border-amber-400'
                    }`}
                  />
                </div>
                {errors.startTime && <p className="text-[10px] text-rose-400 mt-1 font-semibold">{errors.startTime}</p>}
              </div>

              <div id="field-endTime">
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Hora de Fim (HH:MM) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => {
                      handleTimeChange(startTime, e.target.value);
                      if (errors.endTime) setErrors((prev) => ({ ...prev, endTime: '' }));
                    }}
                    className={`w-full rounded-xl border pl-8 pr-3 py-2 text-xs font-mono font-bold text-white focus:outline-none ${
                      errors.endTime
                        ? 'border-rose-500 bg-rose-950/30'
                        : 'border-slate-700 bg-slate-800 focus:border-amber-400'
                    }`}
                  />
                </div>
                {errors.endTime && <p className="text-[10px] text-rose-400 mt-1 font-semibold">{errors.endTime}</p>}
              </div>

              {/* Calculated Duration Display */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Duração Calculada
                </label>
                <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2">
                  <span className="text-xs font-mono font-black text-rose-400">
                    {durationFormatted}
                  </span>
                  <span className="text-[11px] font-bold text-amber-300 font-mono">
                    {durationMinutes} min
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Duration Preset Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[10px] font-semibold text-slate-400">Ajuste Rápido:</span>
              {[15, 30, 45, 60, 90, 120].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => handleDurationPreset(mins)}
                  className={`px-2 py-0.5 rounded-lg border text-[10px] font-mono font-bold transition-all ${
                    durationMinutes === mins
                      ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Type, Priority, Status & Machine Stopped */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-amber-400" />
              <span>Classificação e Estado</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Stoppage Type */}
              <div id="field-stoppageType">
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Tipo de Paragem <span className="text-rose-400">*</span>
                </label>
                <select
                  value={stoppageType}
                  onChange={(e) => {
                    playIndustrialClick();
                    setStoppageType(e.target.value);
                    if (errors.stoppageType) setErrors((prev) => ({ ...prev, stoppageType: '' }));
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
                >
                  {typesList.map((typeName) => (
                    <option key={typeName} value={typeName}>
                      {typeName}
                    </option>
                  ))}
                </select>
                {errors.stoppageType && (
                  <p className="text-[10px] text-rose-400 mt-1 font-semibold">{errors.stoppageType}</p>
                )}
              </div>

              {/* Machine Stopped Toggle */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  A máquina parou?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      playIndustrialClick();
                      setMachineStopped(true);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-all ${
                      machineStopped
                        ? 'border-rose-500 bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <Power className="h-3.5 w-3.5 text-rose-400" />
                    <span>Sim (Parou)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playIndustrialClick();
                      setMachineStopped(false);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-all ${
                      !machineStopped
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Não (A brandar)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Priority & Status Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Prioridade
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['Baixa', 'Média', 'Alta', 'Crítica'] as StoppagePriority[]).map((p) => {
                    const isSel = priority === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          playIndustrialClick();
                          setPriority(p);
                        }}
                        className={`py-1.5 px-1 rounded-lg border text-[10px] font-bold text-center transition-all ${
                          isSel
                            ? p === 'Crítica'
                              ? 'border-rose-500 bg-rose-500/25 text-rose-200 ring-1 ring-rose-500/50'
                              : p === 'Alta'
                              ? 'border-amber-500 bg-amber-500/25 text-amber-200 ring-1 ring-amber-500/50'
                              : p === 'Média'
                              ? 'border-sky-500 bg-sky-500/25 text-sky-200 ring-1 ring-sky-500/50'
                              : 'border-emerald-500 bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-500/50'
                            : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Estado
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Resolvido', 'Em Decorrer', 'Pendente'] as StoppageStatus[]).map((s) => {
                    const isSel = status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          playIndustrialClick();
                          setStatus(s);
                        }}
                        className={`py-1.5 px-1 rounded-lg border text-[10px] font-bold text-center transition-all ${
                          isSel
                            ? s === 'Resolvido'
                              ? 'border-emerald-500 bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-500/50'
                              : s === 'Em Decorrer'
                              ? 'border-sky-500 bg-sky-500/25 text-sky-200 ring-1 ring-sky-500/50'
                              : 'border-amber-500 bg-amber-500/25 text-amber-200 ring-1 ring-amber-500/50'
                            : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Responsible Operators */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-amber-400" />
              <span>Intervenientes & Responsáveis</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Initiated By */}
              <div id="field-initiatedBy">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-400">
                    Iniciado por <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCustomInitiator(!isCustomInitiator)}
                    className="text-[10px] text-amber-400 hover:underline"
                  >
                    {isCustomInitiator ? 'Selecionar da lista' : 'Digitar nome'}
                  </button>
                </div>

                {isCustomInitiator ? (
                  <input
                    type="text"
                    value={initiatedBy}
                    onChange={(e) => {
                      setInitiatedBy(e.target.value);
                      if (errors.initiatedBy) setErrors((prev) => ({ ...prev, initiatedBy: '' }));
                    }}
                    placeholder="Nome do operador que iniciou..."
                    className={`w-full rounded-xl border px-3 py-2 text-xs font-bold text-white focus:outline-none ${
                      errors.initiatedBy
                        ? 'border-rose-500 bg-rose-950/30'
                        : 'border-slate-700 bg-slate-800 focus:border-amber-400'
                    }`}
                  />
                ) : (
                  <select
                    value={initiatedBy}
                    onChange={(e) => {
                      setInitiatedBy(e.target.value);
                      if (errors.initiatedBy) setErrors((prev) => ({ ...prev, initiatedBy: '' }));
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-xs font-bold text-white focus:outline-none ${
                      errors.initiatedBy
                        ? 'border-rose-500 bg-rose-950/30'
                        : 'border-slate-700 bg-slate-800 focus:border-amber-400'
                    }`}
                  >
                    <option value="">Selecione o operador...</option>
                    {operatorNamesList.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
                {errors.initiatedBy && (
                  <p className="text-[10px] text-rose-400 mt-1 font-semibold">{errors.initiatedBy}</p>
                )}
              </div>

              {/* Closed By */}
              <div id="field-closedBy">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-400">
                    Fechado / Corrigido por <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCustomCloser(!isCustomCloser)}
                    className="text-[10px] text-amber-400 hover:underline"
                  >
                    {isCustomCloser ? 'Selecionar da lista' : 'Digitar nome'}
                  </button>
                </div>

                {isCustomCloser ? (
                  <input
                    type="text"
                    value={closedBy}
                    onChange={(e) => {
                      setClosedBy(e.target.value);
                      if (errors.closedBy) setErrors((prev) => ({ ...prev, closedBy: '' }));
                    }}
                    placeholder="Nome de quem fechou ou corrigiu..."
                    className={`w-full rounded-xl border px-3 py-2 text-xs font-bold text-white focus:outline-none ${
                      errors.closedBy
                        ? 'border-rose-500 bg-rose-950/30'
                        : 'border-slate-700 bg-slate-800 focus:border-amber-400'
                    }`}
                  />
                ) : (
                  <select
                    value={closedBy}
                    onChange={(e) => {
                      setClosedBy(e.target.value);
                      if (errors.closedBy) setErrors((prev) => ({ ...prev, closedBy: '' }));
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-xs font-bold text-white focus:outline-none ${
                      errors.closedBy
                        ? 'border-rose-500 bg-rose-950/30'
                        : 'border-slate-700 bg-slate-800 focus:border-amber-400'
                    }`}
                  >
                    <option value="">Selecione quem fechou...</option>
                    {operatorNamesList.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
                {errors.closedBy && (
                  <p className="text-[10px] text-rose-400 mt-1 font-semibold">{errors.closedBy}</p>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Descriptions & Action details */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-amber-400" />
              <span>Descrição da Ocorrência e Resolução</span>
            </h4>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Descrição da Paragem (Motivo / Causa)
              </label>
              <textarea
                value={stoppageDescription}
                onChange={(e) => setStoppageDescription(e.target.value)}
                rows={2}
                placeholder="Ex.: Motor principal sobreaqueceu e desarmou o disjuntor Q1..."
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Ação Realizada / Resolução
              </label>
              <textarea
                value={actionsTaken}
                onChange={(e) => setActionsTaken(e.target.value)}
                rows={2}
                placeholder="Ex.: Substituição da correia dentada, reaperto de bornes e teste em vazio..."
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-emerald-200 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Outras Observações (Opcional)
              </label>
              <textarea
                value={otherObservations}
                onChange={(e) => setOtherObservations(e.target.value)}
                rows={1}
                placeholder="Ex.: Necessário encomendar rolamento suplente para armazém..."
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-slate-300 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Section 5: Stages Decomposition */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  playIndustrialClick();
                  setIsDecomposingStages(!isDecomposingStages);
                }}
                className="flex items-center gap-2 text-xs font-bold text-amber-400 hover:text-amber-300"
              >
                <Layers className="h-4 w-4" />
                <span>
                  {isDecomposingStages
                    ? 'Fechar Decomposição em Etapas'
                    : 'Editar / Adicionar Decomposição por Etapas (3 Níveis)'}
                </span>
              </button>
              {stages.length > 0 && (
                <span className="text-[10px] font-mono text-slate-400">
                  {stages.length} {stages.length === 1 ? 'etapa' : 'etapas'} registadas
                </span>
              )}
            </div>

            {isDecomposingStages && (
              <StagesEditor
                stages={stages}
                onChange={setStages}
                totalDurationMinutes={durationMinutes}
                availableOperators={availableOperators}
                availableStoppageTypes={availableStoppageTypes}
              />
            )}
          </div>

          {/* Section 6: Mandatory PIN Security Authorization */}
          <div id="field-pin" className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-bold text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-amber-400" />
                <span>PIN de Autorização Obrigatório</span>
                <span className="text-rose-400">*</span>
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">Segurança</span>
            </div>

            <p className="text-[11px] text-slate-300">
              Para evitar alterações indevidas, é obrigatório indicar o PIN de operador autorizado ou credencial de administrador.
            </p>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    if (errors.pin) setErrors((prev) => ({ ...prev, pin: '' }));
                    if (errors.form) setErrors((prev) => ({ ...prev, form: '' }));
                  }}
                  placeholder="Introduza o PIN (ex.: 2026)..."
                  className={`w-full rounded-xl border pl-9 pr-3 py-2 text-xs font-mono font-bold tracking-widest text-white focus:outline-none ${
                    errors.pin
                      ? 'border-rose-500 bg-rose-950/30'
                      : 'border-slate-700 bg-slate-800 focus:border-amber-400'
                  }`}
                  autoComplete="off"
                />
              </div>

              {pin.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPin('')}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                >
                  Limpar
                </button>
              )}
            </div>

            {errors.pin && (
              <p className="text-[10px] text-rose-400 font-semibold flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{errors.pin}</span>
              </p>
            )}
          </div>
        </div>

        {/* Modal Footer with Validation Notice & Action Buttons */}
        <div className="border-t border-slate-800 bg-slate-800/95 p-3 sm:px-4 shrink-0 space-y-2.5">
          {/* Validation Errors Notice banner right above the action button */}
          {Object.keys(errors).length > 0 && (
            <div className="rounded-xl border border-rose-500/60 bg-rose-950/90 p-2.5 text-xs text-rose-200 shadow-lg flex items-center justify-between gap-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <span className="font-bold text-rose-300">
                  {errors.form || 'Atenção: Por favor preencha os campos obrigatórios assinalados.'}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all active:scale-95"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl border border-amber-500 bg-amber-500 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-amber-400 active:scale-95 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RotateCcw className="h-4 w-4 animate-spin" />
                  <span>A gravar alterações...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Gravar Alterações</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
