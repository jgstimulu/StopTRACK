import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
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
  RotateCcw,
  Sparkles,
  Tag,
  Check,
  Power,
} from 'lucide-react';
import { HeaderLogo } from '../components/HeaderLogo';
import {
  StoppageRecord,
  StoppageStage,
  Operator,
  StoppageTypeItem,
  StoppagePriority,
  StoppageStatus,
  StoppageTemplate,
} from '../types/manutrack';
import { MACHINES_DATA, INITIAL_STOPPAGE_TYPES } from '../data/initialData';
import { StagesEditor } from '../components/StagesEditor';
import { formatDurationMs, formatTimeOnly, getLocalYMD } from '../utils/formatters';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';

interface PageManualEntryProps {
  onSaveRecord: (record: StoppageRecord, operatorId: string, pin: string) => Promise<void>;
  onBack: () => void;
  availableOperators?: Operator[];
  availableStoppageTypes?: StoppageTypeItem[];
  availableTemplates?: StoppageTemplate[];
}

export const PageManualEntry: React.FC<PageManualEntryProps> = ({
  onSaveRecord,
  onBack,
  availableOperators = [],
  availableStoppageTypes = INITIAL_STOPPAGE_TYPES,
  availableTemplates = [],
}) => {
  const activeOps = availableOperators.filter((o) => o.active);
  const starterOps = activeOps.filter((o) => o.canStart);
  const closerOps = activeOps.filter((o) => o.canClose);

  const todayYMD = getLocalYMD(new Date());

  // Form states - Machine, Date, Times
  const [machineId, setMachineId] = useState<string>('F01');
  const [entryDate, setEntryDate] = useState<string>(todayYMD);
  const [startTime, setStartTime] = useState<string>('08:00');
  const [endTime, setEndTime] = useState<string>('09:00');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);

  // Shift, Priority & Status
  const [shift, setShift] = useState<string>('1º Turno');
  const [priority, setPriority] = useState<StoppagePriority>('Média');
  const [status, setStatus] = useState<StoppageStatus>('Resolvido');
  const [machineStopped, setMachineStopped] = useState<boolean>(true);

  const defaultStoppageType =
    availableStoppageTypes.length > 0 ? availableStoppageTypes[0].name : 'Avaria Mecânica';
  const [stoppageType, setStoppageType] = useState<string>(defaultStoppageType);

  // Operators (matching PageCloseStoppage standard)
  const [initiatedBy, setInitiatedBy] = useState<string>('');
  const [closedBy, setClosedBy] = useState<string>('');
  const [closedByOperatorId, setClosedByOperatorId] = useState<string>('');
  const [closerPin, setCloserPin] = useState('');
  const [isCustomInitiator, setIsCustomInitiator] = useState<boolean>(false);

  // Descriptions
  const [stoppageDescription, setStoppageDescription] = useState<string>('');
  const [actionsTaken, setActionsTaken] = useState<string>('');
  const [otherObservations, setOtherObservations] = useState<string>('');

  // Padronização e Modelos
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [subcategory, setSubcategory] = useState<string>('');
  const [typicalCause, setTypicalCause] = useState<string>('');
  const [keywords, setKeywords] = useState<string[]>([]);

  // Filtrar modelos correspondentes ao tipo de paragem selecionado
  const matchingTemplates = useMemo(() => {
    const currentTypeItem = availableStoppageTypes.find(
      (st) => st.name.toLowerCase() === stoppageType.toLowerCase()
    );
    return availableTemplates.filter(
      (t) =>
        t.active &&
        (t.stoppageTypeId === currentTypeItem?.id ||
          t.stoppageTypeId === stoppageType ||
          t.stoppageTypeId.toLowerCase() === stoppageType.toLowerCase())
    );
  }, [availableTemplates, availableStoppageTypes, stoppageType]);

  const currentActiveTemplate = useMemo(() => {
    return matchingTemplates.find((t) => t.id === selectedTemplateId) || null;
  }, [matchingTemplates, selectedTemplateId]);

  const applyTemplate = (tpl: StoppageTemplate) => {
    setSelectedTemplateId(tpl.id);
    setSubcategory(tpl.subcategory);
    setTypicalCause(tpl.typicalCause);
    setStoppageDescription(tpl.defaultDescription);
    setActionsTaken(tpl.defaultActions);
    setKeywords(tpl.keywords || []);
  };

  // Pré-preenchimento da sugestão ao abrir
  useEffect(() => {
    if (matchingTemplates.length > 0 && !selectedTemplateId) {
      applyTemplate(matchingTemplates[0]);
    }
  }, [matchingTemplates]);

  const handleTypeChange = (newType: string) => {
    setStoppageType(newType);
    const currentTypeItem = availableStoppageTypes.find(
      (st) => st.name.toLowerCase() === newType.toLowerCase()
    );
    const matches = availableTemplates.filter(
      (t) =>
        t.active &&
        (t.stoppageTypeId === currentTypeItem?.id ||
          t.stoppageTypeId === newType ||
          t.stoppageTypeId.toLowerCase() === newType.toLowerCase())
    );
    if (matches.length > 0) {
      applyTemplate(matches[0]);
    } else {
      setSelectedTemplateId('');
      setSubcategory('');
      setTypicalCause('');
      setKeywords([]);
    }
  };


  // Sub-stages decomposition
  const [isDecomposingStages, setIsDecomposingStages] = useState<boolean>(false);
  const [stages, setStages] = useState<StoppageStage[]>([]);

  // Validation & Saving
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Selected Machine object
  const selectedMachine = MACHINES_DATA.find((m) => m.code === machineId) || MACHINES_DATA[0];

  // Duration in ms and formatted display
  const durationMs = durationMinutes * 60 * 1000;
  const durationFormatted = formatDurationMs(durationMs);

  // Auto-sync duration & shift when startTime or endTime changes
  useEffect(() => {
    if (!startTime || !endTime) return;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
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
  }, [startTime, endTime]);

  // Adjust duration preset (adds or sets duration)
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

  const handleResetForm = () => {
    playIndustrialClick();
    setMachineId('F01');
    setEntryDate(todayYMD);
    setStartTime('08:00');
    setEndTime('09:00');
    setDurationMinutes(60);
    setShift('1º Turno');
    setPriority('Média');
    setStatus('Resolvido');
    setMachineStopped(true);
    setInitiatedBy('');
    setClosedBy('');
    setClosedByOperatorId('');
    setCloserPin('');
    setIsCustomInitiator(false);
    setStoppageDescription('');
    setActionsTaken('');
    setOtherObservations('');
    setStages([]);
    setIsDecomposingStages(false);
    setErrors({});
  };

  const validate = () => {
    const errs: { [key: string]: string } = {};
    if (!machineId) {
      errs.machineId = 'Selecione a máquina da paragem';
    }
    if (!entryDate) {
      errs.entryDate = 'Indique a data';
    }
    if (!startTime) {
      errs.startTime = 'Hora de início obrigatória';
    }
    if (!endTime) {
      errs.endTime = 'Hora de fim obrigatória';
    }
    if (!initiatedBy.trim()) {
      errs.initiatedBy = 'Indique quem iniciou a paragem';
    }
    if (!closedBy.trim() || !closedByOperatorId || !/^\d{4,8}$/.test(closerPin)) {
      errs.closedBy = 'Selecione um operador autorizado e introduza o seu PIN individual.';
    }
    if (!shift.trim()) {
      errs.shift = 'Turno é obrigatório';
    }

    // Auto-fill sensible default description if left blank
    let finalDesc = stoppageDescription.trim();
    if (!finalDesc) {
      finalDesc = `${stoppageType} na máquina ${machineId}`;
      setStoppageDescription(finalDesc);
    }

    // Auto-fill actions taken if left blank
    let finalActions = actionsTaken.trim();
    if (!finalActions) {
      if (stages && stages.length > 0) {
        finalActions = stages
          .map((s) => `${s.type} (${s.technician || 'Técnico'})`)
          .join(' → ');
      } else {
        finalActions = 'Intervenção técnica realizada e máquina reposta em funcionamento';
      }
      setActionsTaken(finalActions);
    }

    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      const firstKey = Object.keys(errs)[0];
      setTimeout(() => {
        const el = document.getElementById(`field-${firstKey}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return false;
    }

    return true;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!validate()) {
      return;
    }

    // Format Portuguese date display DD/MM/AAAA
    let dateFormatted = entryDate;
    if (entryDate.includes('-')) {
      const [yyyy, mm, dd] = entryDate.split('-');
      dateFormatted = `${dd}/${mm}/${yyyy}`;
    }

    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const [y, m, d] = entryDate.includes('-')
      ? entryDate.split('-').map(Number)
      : [new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()];

    const startDate = new Date(y, m - 1, d, sh, sm, 0);
    const startTimestamp = startDate.getTime();
    const endTimestamp = startTimestamp + durationMs;

    const matchedMachine = MACHINES_DATA.find((mach) => mach.code === machineId);

    const record: StoppageRecord = {
      id: `manual-${Date.now()}-${machineId}`,
      machineId,
      machineName: matchedMachine ? matchedMachine.name : `Máquina ${machineId}`,
      date: dateFormatted,
      startTime: `${startTime}:00`,
      endTime: `${endTime}:00`,
      startTimestamp,
      endTimestamp,
      durationMs,
      durationFormatted,
      shift: shift.trim(),
      priority,
      status,
      machineStopped: machineStopped !== false,
      initiatedBy: initiatedBy.trim(),
      closedBy: closedBy.trim(),
      stoppageType,
      stoppageDescription:
        stoppageDescription.trim() || `${stoppageType} na máquina ${machineId}`,
      actionsTaken:
        actionsTaken.trim() ||
        (stages.length > 0
          ? stages.map((s) => `${s.type} (${s.technician || 'Técnico'})`).join(' → ')
          : 'Intervenção técnica realizada e máquina testada'),
      otherObservations: otherObservations.trim() || undefined,
      templateId: selectedTemplateId && selectedTemplateId !== 'custom' ? selectedTemplateId : undefined,
      subcategory: subcategory.trim() || undefined,
      typicalCause: typicalCause.trim() || undefined,
      correctiveActions: actionsTaken.trim() || undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      stages: isDecomposingStages && stages.length > 0 ? stages : undefined,
      createdAt: Date.now(),
    };


    setIsSaving(true);
    try {
      await onSaveRecord(record, closedByOperatorId, closerPin);
      playSuccessChime();
    } catch (error) {
      setErrors((previous) => ({
        ...previous,
        closedBy: error instanceof Error ? error.message : 'Não foi possível guardar a paragem.',
      }));
      setIsSaving(false);
    }
  };

  // Format Portuguese date display for summary card
  const displayFormattedDate = () => {
    if (!entryDate) return '';
    if (entryDate.includes('-')) {
      const [yyyy, mm, dd] = entryDate.split('-');
      return `${dd}/${mm}/${yyyy}`;
    }
    return entryDate;
  };

  return (
    <div className="flex min-h-screen flex-col justify-between py-5 px-3.5 sm:px-6 pb-28">
      {/* Top Header */}
      <div>
        <HeaderLogo subtitle="Registo Manual de Paragens Retroativas" />

        {/* Back Link & Quick Helpers */}
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              onBack();
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar ao Menu Principal</span>
          </button>

          <button
            type="button"
            onClick={handleResetForm}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Limpar Formulário</span>
          </button>
        </div>

        {/* TOP SUMMARY CARD (IDENTICAL STANDARD PATTERN AS PAGE 4) */}
        <div className="mt-4 overflow-hidden rounded-2xl border-2 border-slate-700 bg-slate-900 shadow-xl">
          {/* Machine Header Banner */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/80 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-12 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/20 text-base font-black text-amber-300 font-mono">
                {selectedMachine.code}
              </span>
              <div>
                <h2 className="text-sm font-bold text-white leading-tight">
                  {selectedMachine.name}
                </h2>
                <span className="text-[11px] text-slate-400">
                  Secção {selectedMachine.section} · Lançamento Retroativo
                </span>
              </div>
            </div>

            <div className="text-right">
              <div className="flex items-center gap-1 text-xs text-slate-300">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-semibold">{displayFormattedDate()}</span>
              </div>
            </div>
          </div>

          {/* Calculated Times Strip */}
          <div className="grid grid-cols-2 gap-px bg-slate-800/60 p-4">
            {/* Duração da paragem */}
            <div className="pr-3 border-r border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Duração da Paragem
              </span>
              <p className="mt-0.5 text-2xl font-black text-rose-400 font-mono tabular-nums tracking-tight">
                {durationFormatted}
              </p>
              <span className="text-[11px] text-slate-400">
                {durationMinutes} minutos no total
              </span>
            </div>

            {/* Hora de Início e Fim */}
            <div className="pl-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Hora Início e Fim
              </span>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-white font-mono">
                <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>{startTime}</span>
                <span className="text-slate-400">→</span>
                <span>{endTime}</span>
              </div>
              <span className="text-[11px] text-slate-400">
                Lançamento manual
              </span>
            </div>
          </div>

          {/* Turno Strip */}
          <div className="border-t border-slate-800 bg-slate-900/90 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Turno da Paragem:
              </span>
              <span className="font-mono font-bold text-xs text-amber-300 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/30">
                {shift}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {shift.includes('1')
                ? '05:00 - 14:30'
                : shift.includes('2')
                ? '14:30 - 00:00'
                : '00:00 - 05:00'}
            </span>
          </div>
        </div>
      </div>

      {/* FORM QUESTIONS (MATCHING EXACT STANDARD CARDS OF PAGECLOSESTOPPAGE) */}
      <form onSubmit={handleSave} className="my-4 space-y-4">
        {/* A. Máquina & Data da Paragem */}
        <div
          id="field-machineId"
          className={`rounded-xl border p-3.5 shadow-sm transition-all ${
            errors.machineId || errors.entryDate
              ? 'border-rose-500 bg-rose-950/20 ring-1 ring-rose-500'
              : 'border-slate-700/80 bg-slate-900/90'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Wrench className="h-3.5 w-3.5 text-amber-400" />
              <span>Máquina e Data da Ocorrência <span className="text-rose-400">*</span></span>
            </label>
            <span className="text-[10px] font-mono text-slate-400">F01–F30</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Selecione a Máquina <span className="text-rose-400">*</span>
              </label>
              <select
                value={machineId}
                onChange={(e) => {
                  playIndustrialClick();
                  setMachineId(e.target.value);
                  if (errors.machineId) setErrors((prev) => ({ ...prev, machineId: '' }));
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
              >
                {MACHINES_DATA.map((m) => (
                  <option key={m.id} value={m.code} className="bg-slate-900 text-white">
                    {m.code} - {m.name} ({m.section})
                  </option>
                ))}
              </select>
              {errors.machineId && (
                <p className="mt-1 text-[11px] text-rose-400 font-semibold">{errors.machineId}</p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Data da Ocorrência <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => {
                  setEntryDate(e.target.value);
                  if (errors.entryDate) setErrors((prev) => ({ ...prev, entryDate: '' }));
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
              />
              {errors.entryDate && (
                <p className="mt-1 text-[11px] text-rose-400 font-semibold">{errors.entryDate}</p>
              )}
            </div>
          </div>
        </div>

        {/* B. Horários & Duração Manual */}
        <div
          id="field-startTime"
          className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span>Horários e Duração <span className="text-rose-400">*</span></span>
            </label>
            <span className="text-[10px] font-mono text-amber-400">
              {durationMinutes} min ({durationFormatted})
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Hora Início <span className="text-rose-400">*</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-xs font-mono font-bold text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Hora Fim <span className="text-rose-400">*</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-xs font-mono font-bold text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Duração Rápida:
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleDurationPreset(m)}
                    className={`rounded px-2 py-1 text-[10px] font-mono font-bold transition-all ${
                      durationMinutes === m
                        ? 'border border-amber-500 bg-amber-500/20 text-amber-300'
                        : 'border border-slate-700 bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {m < 60 ? `${m}m` : `${m / 60}h`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* C. Turno da Paragem (Identical to PageCloseStoppage) */}
        <div
          id="field-shift"
          className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span>Turno da Paragem <span className="text-rose-400">*</span></span>
            </label>
            <span className="text-[10px] text-slate-400 font-mono">Deteção Automática</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: '1º Turno', label: '1º Turno', range: '05:00 - 14:30', icon: Sunrise },
              { id: '2º Turno', label: '2º Turno', range: '14:30 - 00:00', icon: Sun },
              { id: 'Turno Noturno', label: 'Turno Noturno', range: '00:00 - 05:00', icon: Moon },
            ].map((s) => {
              const IconComp = s.icon;
              const isSelected = shift === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setShift(s.id)}
                  className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/20 text-amber-300 font-bold ring-1 ring-amber-500/50 shadow-sm'
                      : 'border-slate-700 bg-slate-800/80 text-slate-400 hover:text-white hover:border-slate-600'
                  }`}
                >
                  <IconComp
                    className={`h-4 w-4 mb-1 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`}
                  />
                  <span className="text-xs font-bold font-mono">{s.label}</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">{s.range}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 1. Quem Iniciou a Paragem (Identical to PageCloseStoppage) */}
        <div
          id="field-initiatedBy"
          className={`rounded-xl border p-3.5 shadow-sm transition-all ${
            errors.initiatedBy
              ? 'border-rose-500 bg-rose-950/20 ring-1 ring-rose-500'
              : 'border-slate-700/80 bg-slate-900/90'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <User
                className={`h-3.5 w-3.5 ${errors.initiatedBy ? 'text-rose-400' : 'text-amber-400'}`}
              />
              <span>Quem iniciou a paragem <span className="text-rose-400">*</span></span>
            </label>
            <button
              type="button"
              onClick={() => setIsCustomInitiator(!isCustomInitiator)}
              className="text-[11px] font-medium text-amber-400 hover:text-amber-300"
            >
              {isCustomInitiator ? 'Selecionar da lista' : 'Digitar outro nome'}
            </button>
          </div>

          {isCustomInitiator ? (
            <input
              type="text"
              value={initiatedBy}
              onChange={(e) => {
                setInitiatedBy(e.target.value);
                if (e.target.value.trim() && errors.initiatedBy) {
                  setErrors((prev) => ({ ...prev, initiatedBy: '' }));
                }
              }}
              placeholder="Digite o nome de quem iniciou..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-medium text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none"
            />
          ) : (
            <select
              value={initiatedBy}
              onChange={(e) => {
                setInitiatedBy(e.target.value);
                if (e.target.value.trim() && errors.initiatedBy) {
                  setErrors((prev) => ({ ...prev, initiatedBy: '' }));
                }
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-semibold text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="" className="bg-slate-900 text-slate-400">
                -- Selecione quem iniciou (Obrigatório) --
              </option>
              {starterOps.map((op) => (
                <option key={op.id} value={op.name} className="bg-slate-900 text-white">
                  {op.name} ({op.role})
                </option>
              ))}
              {starterOps.length === 0 &&
                activeOps.map((op) => (
                  <option key={op.id} value={op.name} className="bg-slate-900 text-white">
                    {op.name}
                  </option>
                ))}
            </select>
          )}

          {errors.initiatedBy && (
            <p className="mt-1.5 text-[11px] font-semibold text-rose-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.initiatedBy}
            </p>
          )}
        </div>

        {/* 2. Quem Fechou a Paragem (Identical to PageCloseStoppage) */}
        <div
          id="field-closedBy"
          className={`rounded-xl border p-3.5 shadow-sm transition-all ${
            errors.closedBy
              ? 'border-rose-500 bg-rose-950/20 ring-1 ring-rose-500'
              : 'border-slate-700/80 bg-slate-900/90'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <User
                className={`h-3.5 w-3.5 ${errors.closedBy ? 'text-rose-400' : 'text-emerald-400'}`}
              />
              <span>Quem fechou a paragem <span className="text-rose-400">*</span></span>
            </label>
          </div>

          <>
            <select
              value={closedByOperatorId}
              onChange={(e) => {
                const operator = closerOps.find((entry) => entry.id === e.target.value);
                setClosedByOperatorId(e.target.value);
                setClosedBy(operator?.name || '');
                setCloserPin('');
                if (e.target.value.trim() && errors.closedBy) {
                  setErrors((prev) => ({ ...prev, closedBy: '' }));
                }
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-semibold text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="" className="bg-slate-900 text-slate-400">
                -- Selecione quem está a fechar a paragem (Obrigatório) --
              </option>
              {closerOps.map((op) => (
                <option key={op.id} value={op.id} className="bg-slate-900 text-white">
                  {op.name} ({op.role})
                </option>
              ))}
            </select>
            {closedByOperatorId && (
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={closerPin}
                onChange={(event) => setCloserPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="PIN individual (4 a 8 dígitos)"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs text-white placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
              />
            )}
          </>

          {errors.closedBy && (
            <p className="mt-1.5 text-[11px] font-semibold text-rose-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.closedBy}
            </p>
          )}
        </div>

        {/* 3. Tipo de Paragem (Identical to PageCloseStoppage) */}
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Layers className="h-3.5 w-3.5 text-sky-400" />
              <span>Tipo de paragem <span className="text-rose-400">*</span></span>
            </label>
          </div>
          <div className="mt-2">
            <select
              value={stoppageType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-semibold text-white focus:border-sky-500 focus:outline-none"
            >
              {availableStoppageTypes.map((st) => (
                <option
                  key={st.id || st.name}
                  value={st.name}
                  className="bg-slate-900 text-white"
                >
                  {st.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 4. Padronização Semântica & Modelos (Causa Típica, Motivo e Ação Vinculados) */}
        <div className="rounded-xl border border-sky-500/40 bg-sky-950/20 p-4 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between border-b border-sky-800/40 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-sky-200">
                Modelos Padronizados & Causa Típica
              </span>
            </div>
            <span className="text-[10px] text-sky-300 bg-sky-900/60 px-2 py-0.5 rounded font-mono border border-sky-700/50">
              Vinculação Direta & Editável
            </span>
          </div>

          {matchingTemplates.length > 0 ? (
            <div className="space-y-3">
              {/* Template selector pills */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Selecione o Modelo de Referência ({matchingTemplates.length} disponíveis):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {matchingTemplates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        playIndustrialClick();
                        applyTemplate(tpl);
                      }}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all text-left flex items-center gap-1.5 ${
                        selectedTemplateId === tpl.id
                          ? 'bg-sky-500 text-white shadow-sm ring-1 ring-sky-300 font-bold'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                      }`}
                    >
                      <span>{tpl.title}</span>
                      {selectedTemplateId === tpl.id && <Check className="h-3 w-3 shrink-0" />}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      playIndustrialClick();
                      setSelectedTemplateId('custom');
                    }}
                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all text-left ${
                      selectedTemplateId === 'custom'
                        ? 'bg-slate-700 text-white ring-1 ring-slate-400 font-bold'
                        : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 border border-dashed border-slate-700'
                    }`}
                  >
                    Personalizado / Manual
                  </button>
                </div>
              </div>

              {/* Banner of active template link */}
              {currentActiveTemplate && selectedTemplateId !== 'custom' && (
                <div className="flex items-center justify-between text-[11px] text-sky-200 bg-sky-900/30 border border-sky-700/50 rounded-lg px-2.5 py-1.5">
                  <span className="flex items-center gap-1.5 truncate">
                    <Check className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                    <span>Vinculado ao modelo: <strong>{currentActiveTemplate.title}</strong></span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      playIndustrialClick();
                      applyTemplate(currentActiveTemplate);
                    }}
                    className="text-[10px] text-sky-400 hover:text-sky-200 underline font-semibold shrink-0 ml-2"
                  >
                    Repor textos padrão
                  </button>
                </div>
              )}

              {/* Subcategoria & Causa Típica fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                    <span>Subcategoria</span>
                    <span className="text-[9px] text-slate-500 font-normal">Padronizada</span>
                  </label>
                  <input
                    type="text"
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    placeholder="Ex: Transmissão Mecânica, Automação..."
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                    <span>Causa Típica Identificada</span>
                    <span className="text-[9px] text-slate-500 font-normal">Padronizada</span>
                  </label>
                  <input
                    type="text"
                    value={typicalCause}
                    onChange={(e) => setTypicalCause(e.target.value)}
                    placeholder="Ex: Falta de lubrificação, Sobrecarga..."
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Descrição da Paragem (Motivo / Causa) - Linked */}
              <div id="field-stoppageDescription">
                <div className="flex items-center justify-between mb-1">
                  <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200">
                    <FileText className="h-3.5 w-3.5 text-amber-400" />
                    <span>Descrição da paragem (Motivo / Causa) <span className="text-rose-400">*</span></span>
                  </label>
                  <span className="text-[10px] text-sky-400/90 font-mono">
                    {currentActiveTemplate && selectedTemplateId !== 'custom' ? 'Preenchido do modelo (editável)' : 'Editável'}
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={stoppageDescription}
                  onChange={(e) => setStoppageDescription(e.target.value)}
                  placeholder="Ex: Alarme térmico no motor de tração, sensor encravado, falta de cartão..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                />
                {errors.stoppageDescription && (
                  <p className="mt-1 text-[11px] font-semibold text-rose-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.stoppageDescription}
                  </p>
                )}
              </div>

              {/* Descrição do que foi feito (Ação Corretiva) - Linked */}
              <div id="field-actionsTaken">
                <div className="flex items-center justify-between mb-1">
                  <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200">
                    <Wrench className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Descrição do que foi feito (Ação Corretiva) <span className="text-rose-400">*</span></span>
                  </label>
                  <span className="text-[10px] text-emerald-400/90 font-mono">
                    {currentActiveTemplate && selectedTemplateId !== 'custom' ? 'Preenchido do modelo (editável)' : 'Editável'}
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={actionsTaken}
                  onChange={(e) => setActionsTaken(e.target.value)}
                  placeholder="Ex: Desbloqueio mecânico, limpeza de fotocélula, substituição de fusível..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
                {errors.actionsTaken && (
                  <p className="mt-1 text-[11px] font-semibold text-rose-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.actionsTaken}
                  </p>
                )}
              </div>

              {/* Semantic Tags/Keywords Badges */}
              {keywords.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-800/60">
                  <Tag className="h-3 w-3 text-sky-400 shrink-0" />
                  <span className="text-[10px] text-slate-400 mr-1">Palavras-chave semânticas:</span>
                  {keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-950/80 text-sky-300 border border-sky-800/60"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-[11px] text-slate-400 py-1 flex items-center justify-between">
                <span>Sem modelos pré-configurados para este tipo. Preenchimento manual ativo.</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Subcategoria
                  </label>
                  <input
                    type="text"
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    placeholder="Ex: Transmissão Mecânica, Automação..."
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Causa Típica Identificada
                  </label>
                  <input
                    type="text"
                    value={typicalCause}
                    onChange={(e) => setTypicalCause(e.target.value)}
                    placeholder="Ex: Falta de lubrificação, Sobrecarga..."
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200 mb-1">
                  <FileText className="h-3.5 w-3.5 text-amber-400" />
                  <span>Descrição da paragem (Motivo / Causa) <span className="text-rose-400">*</span></span>
                </label>
                <textarea
                  rows={2}
                  value={stoppageDescription}
                  onChange={(e) => setStoppageDescription(e.target.value)}
                  placeholder="Ex: Alarme térmico no motor de tração, sensor encravado..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200 mb-1">
                  <Wrench className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Descrição do que foi feito (Ação Corretiva) <span className="text-rose-400">*</span></span>
                </label>
                <textarea
                  rows={2}
                  value={actionsTaken}
                  onChange={(e) => setActionsTaken(e.target.value)}
                  placeholder="Ex: Desbloqueio mecânico, limpeza de fotocélula..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 5. Condições Operacionais da Máquina & Gravidade */}
        <div className="space-y-3">
          {/* 5.1 A máquina parou? — resposta simples com um tique */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Power className="h-3.5 w-3.5 text-rose-400" />
              <span>A máquina parou? <span className="text-rose-400">*</span></span>
            </label>

            <button
              type="button"
              role="checkbox"
              aria-checked={machineStopped}
              onClick={() => {
                playIndustrialClick();
                setMachineStopped((prev) => !prev);
              }}
              className={`mt-2 flex w-full items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition-all active:scale-[0.99] ${
                machineStopped
                  ? 'border-rose-500 bg-rose-500/15 text-rose-200'
                  : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
                  machineStopped
                    ? 'border-rose-400 bg-rose-500 text-white'
                    : 'border-slate-500 bg-slate-900 text-transparent'
                }`}
              >
                <Check className="h-5 w-5" strokeWidth={3} />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-bold">
                  {machineStopped ? 'Sim, a máquina parou' : 'Não, a máquina não parou (a brandar)'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {machineStopped
                    ? 'Toque para desmarcar se a máquina continuou a trabalhar'
                    : 'Toque para marcar se a máquina chegou a parar'}
                </span>
              </span>
            </button>
          </div>

          {/* 5.2 Prioridade da Avaria */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                <Flame className="h-3.5 w-3.5 text-amber-400" />
                <span>Prioridade da Avaria <span className="text-rose-400">*</span></span>
              </label>
              <span className="text-[11px] font-mono">
                {priority === 'Crítica' && (
                  <span className="text-rose-400 font-bold">Crítica (Urgente)</span>
                )}
                {priority === 'Alta' && (
                  <span className="text-amber-400 font-semibold">Alta Prioridade</span>
                )}
                {priority === 'Média' && <span className="text-sky-400">Média (Normal)</span>}
                {priority === 'Baixa' && (
                  <span className="text-emerald-400">Baixa Prioridade</span>
                )}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {(['Baixa', 'Média', 'Alta', 'Crítica'] as StoppagePriority[]).map((p) => {
                const isSelected = priority === p;
                let activeClasses = '';
                let badgeDot = '';
                if (p === 'Baixa') {
                  activeClasses = 'border-emerald-500 bg-emerald-500/20 text-emerald-300';
                  badgeDot = 'bg-emerald-400';
                } else if (p === 'Média') {
                  activeClasses = 'border-sky-500 bg-sky-500/20 text-sky-300';
                  badgeDot = 'bg-sky-400';
                } else if (p === 'Alta') {
                  activeClasses = 'border-amber-500 bg-amber-500/20 text-amber-300';
                  badgeDot = 'bg-amber-400';
                } else {
                  activeClasses = 'border-rose-500 bg-rose-500/25 text-rose-300 font-black';
                  badgeDot = 'bg-rose-400 animate-pulse';
                }

                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      playIndustrialClick();
                      setPriority(p);
                    }}
                    className={`flex flex-col items-center justify-center rounded-lg border py-2.5 px-1.5 transition-all ${
                      isSelected
                        ? `${activeClasses} ring-1 ring-white/20 shadow-md`
                        : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-bold">
                      <span
                        className={`h-2 w-2 rounded-full ${isSelected ? badgeDot : 'bg-slate-600'}`}
                      />
                      {p}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5.3 Estado da Avaria */}
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
                <span>Estado da Avaria <span className="text-rose-400">*</span></span>
              </label>
              <span className="text-[11px] font-mono">
                {status === 'Resolvido' && (
                  <span className="text-emerald-400 font-semibold">Resolvido</span>
                )}
                {status === 'Em Decorrer' && (
                  <span className="text-sky-400 font-semibold">Em Decorrer</span>
                )}
                {status === 'Pendente' && (
                  <span className="text-amber-400 font-semibold">Pendente</span>
                )}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: 'Resolvido', label: 'Resolvido', icon: CheckCircle2, color: 'emerald' },
                  { key: 'Em Decorrer', label: 'Em Decorrer', icon: Activity, color: 'sky' },
                  { key: 'Pendente', label: 'Pendente', icon: AlertTriangle, color: 'amber' },
                ] as const
              ).map((item) => {
                const isSelected = status === item.key;
                const IconComp = item.icon;
                let selectedStyle = '';
                if (item.color === 'emerald') {
                  selectedStyle = 'border-emerald-500 bg-emerald-500/20 text-emerald-300';
                } else if (item.color === 'sky') {
                  selectedStyle = 'border-sky-500 bg-sky-500/20 text-sky-300';
                } else {
                  selectedStyle = 'border-amber-500 bg-amber-500/20 text-amber-300';
                }

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      playIndustrialClick();
                      setStatus(item.key as StoppageStatus);
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border py-2.5 px-2 text-xs font-bold transition-all ${
                      isSelected
                        ? `${selectedStyle} ring-1 ring-white/20 shadow-md`
                        : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <IconComp className={`h-3.5 w-3.5 ${isSelected ? '' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 6. Outras Observações (Opcional - Único campo opcional) */}
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              <span>Outras observações</span>
            </label>
            <span className="text-[10px] text-slate-400 font-semibold bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              Opcional
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mb-2">
            Deixe apenas anotações complementares aqui (peças de substituição, notas para o próximo turno, etc.).
          </p>
          <textarea
            rows={2}
            value={otherObservations}
            onChange={(e) => setOtherObservations(e.target.value)}
            placeholder="Ex: Encomendado novo rolamento ref. 6204-2RS para o armazém..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-slate-500 focus:outline-none"
          />
        </div>

        {/* 9. Decomposição de Etapas da Paragem (Opcional) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                playIndustrialClick();
                setIsDecomposingStages(!isDecomposingStages);
              }}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                isDecomposingStages
                  ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                  : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:border-slate-500'
              }`}
            >
              <Layers className="h-4 w-4 text-amber-400" />
              <span>
                {isDecomposingStages
                  ? 'Ocultar Decomposição de Etapas'
                  : '+ Decompor Paragem em Etapas (ex: 1h Mecânica + 30m Afinação)'}
              </span>
            </button>

            {isDecomposingStages && stages.length > 0 && (
              <span className="text-xs font-mono font-bold text-amber-300">
                {stages.length} etapas definidas (
                {stages.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0)}m)
              </span>
            )}
          </div>

          {isDecomposingStages && (
            <StagesEditor
              stages={stages}
              onChange={setStages}
              totalDurationMinutes={durationMinutes}
              availableOperators={activeOps}
              availableStoppageTypes={availableStoppageTypes}
            />
          )}
        </div>

        {/* Bottom Action - Wireframe "Gravar e sair" (MATCHING PAGECLOSESTOPPAGE STANDARD) */}
        <div className="pt-2 pb-6">
          {/* Validation Errors Notice */}
          {Object.keys(errors).length > 0 && (
            <div className="mb-3 rounded-xl border-2 border-rose-500 bg-rose-950/90 p-3.5 text-xs text-rose-200 shadow-xl space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 font-black text-rose-300 uppercase tracking-wide">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>Atenção: Por favor complete os campos em falta</span>
              </div>
              <div className="space-y-1 pl-6 text-[11px]">
                {Object.entries(errors).map(([k, msg]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(`field-${k}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    className="block text-left text-rose-300 hover:text-white underline font-semibold"
                  >
                    • {msg} (clique para ir ao campo)
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className={`group relative w-full overflow-hidden rounded-2xl border-2 border-emerald-500 bg-gradient-to-b from-emerald-600 to-emerald-700 py-4 px-6 text-center shadow-xl shadow-emerald-950/50 hover:brightness-110 active:scale-[0.98] transition-all ${
              isSaving ? 'opacity-70 cursor-wait' : ''
            }`}
          >
            <div className="flex items-center justify-center gap-2.5 text-white">
              <Save className="h-5 w-5" />
              <span className="text-lg font-black uppercase tracking-wider font-mono">
                {isSaving ? 'A Gravar...' : 'Gravar e Sair'}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              onBack();
            }}
            className="mt-2.5 w-full rounded-xl border border-slate-700 bg-slate-800/80 py-3 text-center text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            ← Cancelar e Voltar ao Início
          </button>

          <p className="mt-2 text-center text-[11px] text-slate-400">
            O registo manual será guardado no histórico (com Turno {shift}) e computado nas métricas OEE.
          </p>
        </div>
      </form>
    </div>
  );
};
