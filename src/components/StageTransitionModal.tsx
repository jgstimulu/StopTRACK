import React, { useState } from 'react';
import {
  X,
  ArrowRight,
  Clock,
  User,
  Wrench,
  CheckCircle2,
  Layers,
  Search,
  Hammer,
  Flag,
  Sparkles,
} from 'lucide-react';
import {
  ActiveDowntime,
  Operator,
  StoppageStage,
  StoppageStageLevel,
  StoppageTypeItem,
} from '../types/manutrack';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';

interface StageTransitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDowntime: ActiveDowntime;
  availableOperators?: Operator[];
  availableStoppageTypes?: StoppageTypeItem[];
  onConfirmTransition: (transitionData: {
    completedStage: StoppageStage;
    nextStageName: string;
    nextTechnician: string;
    nextLevel: StoppageStageLevel;
  }) => void;
}

export const StageTransitionModal: React.FC<StageTransitionModalProps> = ({
  isOpen,
  onClose,
  activeDowntime,
  availableOperators = [],
  availableStoppageTypes = [],
  onConfirmTransition,
}) => {
  if (!isOpen) return null;

  const now = Date.now();
  const stageStart = activeDowntime.stageStartTimestamp || activeDowntime.startTimestamp;
  const stageElapsedMs = Math.max(0, now - stageStart);
  const stageElapsedMinutes = Math.max(1, Math.round(stageElapsedMs / 60000));

  const totalElapsedMs = Math.max(0, now - activeDowntime.startTimestamp);
  const totalElapsedMinutes = Math.max(1, Math.round(totalElapsedMs / 60000));

  // Current stage finishing details
  const currentLevel: StoppageStageLevel = activeDowntime.currentLevel || 1;
  const currentStageName =
    activeDowntime.currentStage ||
    (currentLevel === 1
      ? 'Diagnóstico Inicial'
      : currentLevel === 2
      ? 'Intervenção Mecânica'
      : 'Fecho e Arranque');

  const [finishingTech, setFinishingTech] = useState<string>(
    activeDowntime.assignedTechnician || activeDowntime.initiatedBy || ''
  );
  const [finishingDuration, setFinishingDuration] = useState<number>(stageElapsedMinutes);
  const [finishingNotes, setFinishingNotes] = useState<string>('');

  // Next stage to start: default suggestion based on current level
  // If finishing Level 1 (Diagnóstico) -> suggest Level 2 (Intervenção)
  // If finishing Level 2 (Intervenção) -> suggest another Level 2 (e.g. Elétrica/Afinação) or Level 3 (Fecho)
  const defaultNextLevel: StoppageStageLevel = currentLevel === 1 ? 2 : currentLevel === 2 ? 2 : 3;
  const [nextLevel, setNextLevel] = useState<StoppageStageLevel>(defaultNextLevel);

  const [nextStageName, setNextStageName] = useState<string>(
    defaultNextLevel === 2
      ? 'Avaria Mecânica'
      : defaultNextLevel === 3
      ? 'Arranque e Validação'
      : 'Diagnóstico da Avaria'
  );
  const [isCustomNextStage, setIsCustomNextStage] = useState<boolean>(false);
  const [nextTechnician, setNextTechnician] = useState<string>('');
  const [isCustomNextTech, setIsCustomNextTech] = useState<boolean>(false);

  const activeOps = availableOperators.filter((o) => o.active);

  // Presets by Level
  const level1Presets = [
    'Diagnóstico Inicial / Triagem',
    'Inspeção Visual e Alarmes',
    'Análise de Causa Raiz',
  ];

  const level2Presets = [
    'Avaria Mecânica',
    'Avaria Elétrica',
    'Pneumática / Hidráulica',
    'Substituição de Peças',
    'Falta de Matéria-Prima / Abastecimento',
    'Qualidade / Afinação',
    'Limpeza / Desobstrução',
  ];

  const level3Presets = [
    'Arranque e Produção',
    'Teste em Vazio e Validação',
    'Verificação de Primeiras Peças',
    'Entrega Operacional da Linha',
  ];

  const handleSelectLevel = (level: StoppageStageLevel) => {
    playIndustrialClick();
    setNextLevel(level);
    setIsCustomNextStage(false);
    if (level === 1) {
      setNextStageName('Diagnóstico Inicial / Triagem');
    } else if (level === 2) {
      setNextStageName('Avaria Mecânica');
    } else {
      setNextStageName('Arranque e Produção');
    }
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();

    const previousCount = activeDowntime.completedStages?.length || 0;
    const completedStage: StoppageStage = {
      id: `stage-${Date.now()}-${previousCount + 1}`,
      order: previousCount + 1,
      level: currentLevel,
      levelLabel:
        currentLevel === 1
          ? '1. Diagnóstico'
          : currentLevel === 2
          ? '2. Intervenção'
          : '3. Fecho',
      type: currentStageName,
      description:
        finishingNotes.trim() ||
        `${currentLevel === 1 ? 'Diagnóstico' : currentLevel === 2 ? 'Intervenção' : 'Fecho'} de ${currentStageName} finalizada`,
      technician: finishingTech.trim() || 'Técnico',
      durationMinutes: finishingDuration,
      notes: finishingNotes.trim() || undefined,
    };

    playSuccessChime();
    onConfirmTransition({
      completedStage,
      nextStageName: nextStageName.trim() || 'Nova Etapa',
      nextTechnician: nextTechnician.trim() || finishingTech.trim() || 'Supervisor',
      nextLevel,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border-2 border-amber-500/60 bg-slate-900 shadow-2xl max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/90 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-12 items-center justify-center rounded-lg border border-amber-500/50 bg-amber-500/20 font-mono text-base font-black text-amber-300">
              {activeDowntime.machineId}
            </span>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">
                Trocar Etapa de Intervenção
              </h3>
              <p className="text-[11px] text-amber-300/80">
                A contagem global da máquina continua sem interrupção
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 3-Level Lifecycle Stepper Indicator */}
        <div className="border-b border-slate-800 bg-slate-950 px-4 py-2.5 shrink-0">
          <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1 tracking-wider">
            Ciclo de Vida da Paragem (3 Níveis):
          </span>
          <div className="grid grid-cols-3 gap-1.5 text-center text-[11px] font-bold font-mono">
            {/* Level 1 */}
            <div
              className={`py-1.5 px-1 rounded-lg border flex items-center justify-center gap-1 ${
                currentLevel === 1
                  ? 'border-sky-500 bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400'
              }`}
            >
              <Search className="h-3 w-3 shrink-0" />
              <span className="truncate">1. Diagnóstico</span>
            </div>

            {/* Level 2 */}
            <div
              className={`py-1.5 px-1 rounded-lg border flex items-center justify-center gap-1 ${
                currentLevel === 2
                  ? 'border-amber-500 bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400'
              }`}
            >
              <Hammer className="h-3 w-3 shrink-0" />
              <span className="truncate">2. Intervenção</span>
            </div>

            {/* Level 3 */}
            <div
              className={`py-1.5 px-1 rounded-lg border flex items-center justify-center gap-1 ${
                currentLevel === 3
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400'
              }`}
            >
              <Flag className="h-3 w-3 shrink-0" />
              <span className="truncate">3. Fecho</span>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <form onSubmit={handleConfirm} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Total Machine Stoppage Banner */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Máquina {activeDowntime.machineId} · Parada Total
              </span>
              <span className="text-xs font-semibold text-slate-200">
                Iniciada às {activeDowntime.startTimeFormatted} ({activeDowntime.shift || '1º Turno'})
              </span>
            </div>
            <div className="text-right">
              <span className="text-base font-black text-rose-400 font-mono">
                {totalElapsedMinutes} min
              </span>
              <span className="text-[10px] text-slate-400 block">total acumulado</span>
            </div>
          </div>

          {/* SECTION 1: Etapa que termina agora */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
              <div className="flex items-center gap-1.5 text-amber-300 font-bold uppercase tracking-wider text-[11px]">
                <CheckCircle2 className="h-4 w-4 text-amber-400" />
                <span>Concluir Etapa Atual</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  Nível {currentLevel}:
                </span>
                <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                  {currentStageName}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Técnico que realizou:
                </label>
                <input
                  type="text"
                  value={finishingTech}
                  onChange={(e) => setFinishingTech(e.target.value)}
                  placeholder="Nome do técnico ou operador"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Duração desta etapa (minutos):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={finishingDuration}
                    onChange={(e) =>
                      setFinishingDuration(Math.max(1, parseInt(e.target.value) || 1))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
                    required
                  />
                  <span className="text-slate-400 font-mono text-xs">min</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Ação realizada nesta etapa (diagnóstico, peça trocada, etc.):
              </label>
              <input
                type="text"
                value={finishingNotes}
                onChange={(e) => setFinishingNotes(e.target.value)}
                placeholder="Ex: Diagnóstico concluído: motor com rolamento danificado"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Transition Divider Arrow */}
          <div className="flex items-center justify-center gap-2 text-slate-500">
            <div className="h-px bg-slate-800 flex-1"></div>
            <span className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-[11px] font-bold text-slate-300">
              <ArrowRight className="h-3.5 w-3.5 text-amber-400" />
              <span>Transição para Próxima Etapa</span>
            </span>
            <div className="h-px bg-slate-800 flex-1"></div>
          </div>

          {/* SECTION 2: Escolha do Nível e Tipo da Nova Etapa */}
          <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-2">
              <div className="flex items-center gap-1.5 text-sky-300 font-bold uppercase tracking-wider text-[11px]">
                <Layers className="h-4 w-4 text-sky-400" />
                <span>Iniciar Nova Etapa</span>
              </div>
              <span className="text-[10px] text-sky-300/80 font-mono">
                Contagem parcial arranca agora
              </span>
            </div>

            {/* Step Level Selector: 1, 2, or 3 */}
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                1. Selecione o Nível da Nova Etapa:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectLevel(1)}
                  className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                    nextLevel === 1
                      ? 'border-sky-500 bg-sky-500/30 text-sky-200 font-bold ring-1 ring-sky-500'
                      : 'border-slate-800 bg-slate-800/80 text-slate-400 hover:text-white'
                  }`}
                >
                  <Search className="h-4 w-4 mb-1 text-sky-400" />
                  <span className="text-xs font-bold font-mono">1. Diagnóstico</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">Triagem & Causa</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectLevel(2)}
                  className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                    nextLevel === 2
                      ? 'border-amber-500 bg-amber-500/30 text-amber-200 font-bold ring-1 ring-amber-500'
                      : 'border-slate-800 bg-slate-800/80 text-slate-400 hover:text-white'
                  }`}
                >
                  <Hammer className="h-4 w-4 mb-1 text-amber-400" />
                  <span className="text-xs font-bold font-mono">2. Intervenção</span>
                  <span className="text-[9px] text-amber-300/80 mt-0.5">Múltiplas fases</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectLevel(3)}
                  className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                    nextLevel === 3
                      ? 'border-emerald-500 bg-emerald-500/30 text-emerald-200 font-bold ring-1 ring-emerald-500'
                      : 'border-slate-800 bg-slate-800/80 text-slate-400 hover:text-white'
                  }`}
                >
                  <Flag className="h-4 w-4 mb-1 text-emerald-400" />
                  <span className="text-xs font-bold font-mono">3. Fecho</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">Finalização</span>
                </button>
              </div>

              {nextLevel === 2 && (
                <p className="text-[10px] text-amber-300/90 mt-1.5 font-medium">
                  Nota: O Nível 2 permite encadear múltiplas etapas consecutivas (ex: Mecânica seguida de Elétrica e Afinação).
                </p>
              )}
            </div>

            {/* Presets based on chosen Level */}
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                2. Tipo de {nextLevel === 1 ? 'Diagnóstico' : nextLevel === 2 ? 'Intervenção' : 'Fecho'}:
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(nextLevel === 1
                  ? level1Presets
                  : nextLevel === 2
                  ? level2Presets
                  : level3Presets
                ).map((preset) => {
                  const isSelected = !isCustomNextStage && nextStageName === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        playIndustrialClick();
                        setIsCustomNextStage(false);
                        setNextStageName(preset);
                      }}
                      className={`text-left px-2.5 py-2 rounded-lg border text-xs font-semibold transition-all ${
                        isSelected
                          ? 'border-sky-500 bg-sky-500/25 text-sky-200 ring-1 ring-sky-500/50'
                          : 'border-slate-800 bg-slate-800/70 text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>

              {/* Custom stage toggle */}
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsCustomNextStage(!isCustomNextStage)}
                  className="text-[11px] text-sky-400 hover:underline"
                >
                  {isCustomNextStage ? 'Escolher das opções acima' : '+ Digitar outro nome de etapa'}
                </button>
              </div>

              {isCustomNextStage && (
                <input
                  type="text"
                  value={nextStageName}
                  onChange={(e) => setNextStageName(e.target.value)}
                  placeholder="Nome da etapa personalizada..."
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                  required
                />
              )}
            </div>

            {/* Next Responsible / Technician */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  3. Responsável / Técnico da Nova Etapa:
                </label>
                <button
                  type="button"
                  onClick={() => setIsCustomNextTech(!isCustomNextTech)}
                  className="text-[10px] text-sky-400 hover:underline"
                >
                  {isCustomNextTech ? 'Selecionar da lista' : 'Digitar nome'}
                </button>
              </div>

              {isCustomNextTech ? (
                <input
                  type="text"
                  value={nextTechnician}
                  onChange={(e) => setNextTechnician(e.target.value)}
                  placeholder="Nome do técnico, mecânico ou supervisor..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                  required
                />
              ) : (
                <select
                  value={nextTechnician}
                  onChange={(e) => setNextTechnician(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white focus:border-sky-500 focus:outline-none"
                  required
                >
                  <option value="" className="bg-slate-900 text-slate-400">
                    -- Selecione o novo responsável --
                  </option>
                  {activeOps.map((op) => (
                    <option
                      key={op.id}
                      value={`${op.name} (${op.role})`}
                      className="bg-slate-900 text-white"
                    >
                      {op.name} ({op.role})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Past Stages in this stoppage if any */}
          {activeDowntime.completedStages && activeDowntime.completedStages.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Etapas Já Concluídas Nesta Paragem ({activeDowntime.completedStages.length}):
              </span>
              <div className="space-y-1">
                {activeDowntime.completedStages.map((stg) => {
                  const lvl = stg.level || 2;
                  const lvlColor =
                    lvl === 1
                      ? 'text-sky-400 border-sky-500/30 bg-sky-500/10'
                      : lvl === 2
                      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                      : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';

                  return (
                    <div
                      key={stg.id}
                      className="flex items-center justify-between text-[11px] text-slate-300 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800/80"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className={`px-1.5 py-0.2 rounded border font-mono text-[9px] font-bold ${lvlColor}`}
                        >
                          N{lvl}
                        </span>
                        <strong className="text-slate-200 truncate">{stg.type}</strong>
                        <span className="text-slate-500 text-[10px] truncate">
                          ({stg.technician})
                        </span>
                      </div>
                      <span className="font-mono text-slate-400 shrink-0 font-bold ml-2">
                        {stg.durationMinutes} min
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 space-y-2">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 px-4 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98]"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Confirmar Transição de Etapa</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 px-4 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
