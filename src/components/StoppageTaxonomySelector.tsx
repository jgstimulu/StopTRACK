import React, { useMemo, useState } from 'react';
import {
  Wrench,
  Cog,
  AlertTriangle,
  FileText,
  Check,
  Plus,
  Info,
  Clock,
  CheckCircle2,
  Sliders,
  Layers,
  Tag,
} from 'lucide-react';
import {
  MechanicalAdjustmentItem,
  MechanicalAdjustmentType,
  MechanicalComponent,
  SpringAdjustmentAction,
  StoppageTypeItem,
} from '../types/manutrack';
import { playIndustrialClick } from '../utils/audio';

export type StoppageTypeCard = {
  id: string;
  name: string;
  color: string;
  icon: React.ElementType;
  badgeText: string;
  description?: string;
};

export const CORE_STOPPAGE_TYPES: StoppageTypeCard[] = [
  {
    id: 'st-mola',
    name: 'Afinação Mola',
    color: 'amber',
    icon: Sliders,
    badgeText: 'Tempo Total de Afinação',
    description: 'Ajuste de conformação de mola',
  },
  {
    id: 'st-afin-mec',
    name: 'Afinação Mecânica',
    color: 'blue',
    icon: Cog,
    badgeText: 'Tempo Total de Afinação',
    description: 'Órgãos mecânicos (Curso, Tempo, Ajuste)',
  },
  {
    id: 'st-avaria-mec',
    name: 'Avaria Mecânica',
    color: 'rose',
    icon: AlertTriangle,
    badgeText: 'Paragem Garantida',
    description: 'Falha mecânica com paragem física',
  },
  {
    id: 'st-outro',
    name: 'Outro',
    color: 'slate',
    icon: Layers,
    badgeText: 'Intervenção Diversa',
    description: 'Pausa operacional ou outros motivos',
  },
] as const;

export const SPRING_ACTIONS: SpringAdjustmentAction[] = [
  'Fechar Baixo',
  'Abrir Baixo',
  'Corrigir Espiral',
  'Abrir Todo',
  'Fechar Todo',
  'Corrigir Escada',
  'Mola',
  'Outro',
];

export const MECHANICAL_COMPONENTS: MechanicalComponent[] = [
  'Braços',
  'Pica',
  'Cabeça',
  'Borboleta',
  'Outro',
];

export const ADJUSTMENT_TYPES: MechanicalAdjustmentType[] = ['Curso', 'Tempo', 'Ajuste'];

export interface StoppageTaxonomySelectorProps {
  stoppageType: string;
  onTypeChange: (newType: string) => void;
  availableStoppageTypes?: StoppageTypeItem[];
  // Spring actions
  springAdjustments: string[];
  onSpringAdjustmentsChange: (actions: string[]) => void;
  // Mechanical adjustments
  mechanicalAdjustments: MechanicalAdjustmentItem[];
  onMechanicalAdjustmentsChange: (adjustments: MechanicalAdjustmentItem[]) => void;
  // Machine stopped indicator
  machineStopped: boolean;
  onMachineStoppedChange: (stopped: boolean) => void;
  // Automatic text generation (only used when the fields were not edited manually)
  onAutoGenerateSummary?: (description: string, actions: string) => void;
  // Explicit "sync text" action (always overwrites the fields)
  onApplySummary?: (description: string, actions: string) => void;
}

export function buildTaxonomySummary(
  type: string,
  springActions: string[],
  mechanicalAdjustments: MechanicalAdjustmentItem[],
  customSpringNote?: string
): { description: string; actions: string } {
  if (type === 'Afinação Mola') {
    const list = [...springActions];
    if (customSpringNote && customSpringNote.trim()) {
      const idx = list.indexOf('Outro');
      if (idx >= 0) list[idx] = `Outro (${customSpringNote.trim()})`;
      else list.push(`Outro (${customSpringNote.trim()})`);
    }

    if (list.length === 0) {
      return {
        description: 'Afinação Mola em curso / validação de ensaio',
        actions: 'Intervenção de afinação de mola',
      };
    }

    const joined = list.join(', ');
    return {
      description: `Afinação Mola: ${joined}`,
      actions: `Afinação efetuada: ${list.join('; ')}`,
    };
  }

  if (type === 'Afinação Mecânica') {
    if (mechanicalAdjustments.length === 0) {
      return {
        description: 'Afinação Mecânica de órgãos da máquina',
        actions: 'Afinação e sincronismo de órgãos mecânicos',
      };
    }

    const parts = mechanicalAdjustments.map((item) => {
      const typesStr = item.adjustmentTypes.length > 0 ? ` (${item.adjustmentTypes.join(', ')})` : '';
      return `${item.component}${typesStr}`;
    });

    return {
      description: `Afinação Mecânica: ${parts.join('; ')}`,
      actions: `Intervenção mecânica efetuada em: ${parts.join('; ')}`,
    };
  }

  if (type === 'Avaria Mecânica') {
    return {
      description: 'Avaria Mecânica: máquina parada por anomalia mecânica',
      actions: 'Diagnóstico e reparação mecânica realizada',
    };
  }

  return {
    description: `${type} na máquina`,
    actions: 'Intervenção concluída',
  };
}

export const StoppageTaxonomySelector: React.FC<StoppageTaxonomySelectorProps> = ({
  stoppageType,
  onTypeChange,
  availableStoppageTypes = [],
  springAdjustments,
  onSpringAdjustmentsChange,
  mechanicalAdjustments,
  onMechanicalAdjustmentsChange,
  machineStopped,
  onMachineStoppedChange,
  onAutoGenerateSummary,
  onApplySummary,
}) => {
  const [customSpringNote, setCustomSpringNote] = useState<string>('');

  // Active types configured in Admin. Falls back to the standard cards while settings load.
  const displayTypes = useMemo<StoppageTypeCard[]>(() => {
    if (availableStoppageTypes.length === 0) return CORE_STOPPAGE_TYPES;

    return availableStoppageTypes
      .filter((type) => type.active)
      .map((type) => {
        const core = CORE_STOPPAGE_TYPES.find(
          (item) => item.id === type.id || item.name === type.name
        );
        if (core) {
          return {
            ...core,
            name: type.name,
            color: type.color || core.color,
            description: type.description || core.description,
          };
        }
        return {
          id: type.id,
          name: type.name,
          color: type.color,
          icon: Tag,
          badgeText: 'Tipo Configurado',
          description: type.description,
        };
      });
  }, [availableStoppageTypes]);

  // Determine active primary type
  const isSpring = stoppageType === 'Afinação Mola';
  const isMechTuning = stoppageType === 'Afinação Mecânica';
  const isMechBreakdown = stoppageType === 'Avaria Mecânica';
  const isOther =
    stoppageType === 'Outro' ||
    (stoppageType.trim().length > 0 && !isSpring && !isMechTuning && !isMechBreakdown);
  const isTuning = isSpring || isMechTuning;

  const handleSelectType = (typeName: string) => {
    playIndustrialClick();
    onTypeChange(typeName);

    // Rule: Avaria Mecânica guarantees machine stoppage
    if (typeName === 'Avaria Mecânica') {
      onMachineStoppedChange(true);
    }

    // Auto-generate summary for the newly selected type
    if (onAutoGenerateSummary) {
      const summary = buildTaxonomySummary(
        typeName,
        typeName === 'Afinação Mola' ? springAdjustments : [],
        typeName === 'Afinação Mecânica' ? mechanicalAdjustments : [],
        customSpringNote
      );
      onAutoGenerateSummary(summary.description, summary.actions);
    }
  };

  // Toggle Spring action
  const toggleSpringAction = (action: string) => {
    playIndustrialClick();
    let next: string[];
    if (springAdjustments.includes(action)) {
      next = springAdjustments.filter((a) => a !== action);
    } else {
      next = [...springAdjustments, action];
    }
    onSpringAdjustmentsChange(next);

    if (onAutoGenerateSummary) {
      const summary = buildTaxonomySummary(
        'Afinação Mola',
        next,
        mechanicalAdjustments,
        customSpringNote
      );
      onAutoGenerateSummary(summary.description, summary.actions);
    }
  };

  // Toggle Mechanical component
  const toggleMechanicalComponent = (comp: MechanicalComponent) => {
    playIndustrialClick();
    const existing = mechanicalAdjustments.find((m) => m.component === comp);
    let next: MechanicalAdjustmentItem[];
    if (existing) {
      next = mechanicalAdjustments.filter((m) => m.component !== comp);
    } else {
      // Default to 'Ajuste'
      next = [...mechanicalAdjustments, { component: comp, adjustmentTypes: ['Ajuste'] }];
    }
    onMechanicalAdjustmentsChange(next);

    if (onAutoGenerateSummary) {
      const summary = buildTaxonomySummary('Afinação Mecânica', springAdjustments, next);
      onAutoGenerateSummary(summary.description, summary.actions);
    }
  };

  // Toggle adjustment type for a component
  const toggleAdjustmentType = (comp: MechanicalComponent, type: MechanicalAdjustmentType) => {
    playIndustrialClick();
    const next = mechanicalAdjustments.map((item) => {
      if (item.component !== comp) return item;
      const hasType = item.adjustmentTypes.includes(type);
      const nextTypes = hasType
        ? item.adjustmentTypes.filter((t) => t !== type)
        : [...item.adjustmentTypes, type];
      return {
        ...item,
        adjustmentTypes: nextTypes.length > 0 ? nextTypes : [type], // Keep at least one
      };
    });
    onMechanicalAdjustmentsChange(next);

    if (onAutoGenerateSummary) {
      const summary = buildTaxonomySummary('Afinação Mecânica', springAdjustments, next);
      onAutoGenerateSummary(summary.description, summary.actions);
    }
  };

  const handleApplySummary = () => {
    playIndustrialClick();
    const applySummary = onApplySummary ?? onAutoGenerateSummary;
    if (applySummary) {
      const summary = buildTaxonomySummary(
        stoppageType,
        springAdjustments,
        mechanicalAdjustments,
        customSpringNote
      );
      applySummary(summary.description, summary.actions);
    }
  };

  return (
    <div className="space-y-3">
      {/* 1. SELEÇÃO PRINCIPAL DOS TIPOS CONFIGURADOS */}
      <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
            <Wrench className="h-4 w-4 text-amber-400" />
            <span>Tipo de Ocorrência <span className="text-rose-400">*</span></span>
          </label>
          <span className="text-[10px] text-slate-400 font-mono">Padronização de Fábrica</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {displayTypes.map((typeItem) => {
            const isSelected = stoppageType === typeItem.name;
            const IconComp = typeItem.icon;

            let borderAndBg = '';
            let textClass = '';
            if (typeItem.color === 'amber') {
              borderAndBg = isSelected
                ? 'border-amber-500 bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/50 shadow-md'
                : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:border-slate-700 hover:text-white';
              textClass = 'text-amber-400';
            } else if (typeItem.color === 'blue') {
              borderAndBg = isSelected
                ? 'border-sky-500 bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/50 shadow-md'
                : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:border-slate-700 hover:text-white';
              textClass = 'text-sky-400';
            } else if (typeItem.color === 'rose') {
              borderAndBg = isSelected
                ? 'border-rose-500 bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/50 shadow-md'
                : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:border-slate-700 hover:text-white';
              textClass = 'text-rose-400';
            } else {
              borderAndBg = isSelected
                ? 'border-slate-400 bg-slate-700/40 text-slate-100 ring-1 ring-slate-400/50 shadow-md'
                : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:border-slate-700 hover:text-white';
              textClass = 'text-slate-300';
            }

            return (
              <button
                key={typeItem.id}
                type="button"
                onClick={() => handleSelectType(typeItem.name)}
                className={`flex flex-col items-center justify-center rounded-xl border p-2.5 transition-all text-center ${borderAndBg}`}
              >
                <IconComp className={`h-4 w-4 mb-1 ${isSelected ? textClass : 'text-slate-400'}`} />
                <span className="text-xs font-bold leading-tight">{typeItem.name}</span>
                <span className="text-[9px] mt-0.5 opacity-80 leading-none">{typeItem.badgeText}</span>
              </button>
            );
          })}
        </div>

        {/* Fallback selector for historical legacy types */}
        {stoppageType && !displayTypes.some((t) => t.name === stoppageType) && (
          <div className="mt-2 text-xs bg-slate-800/80 border border-slate-700 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-slate-300">
              Tipo histórico selecionado: <strong className="text-amber-300">{stoppageType}</strong>
            </span>
            <button
              type="button"
              onClick={() => handleSelectType(displayTypes[0]?.name || 'Afinação Mola')}
              className="text-[10px] text-amber-400 hover:underline"
            >
              Mudar para novo padrão
            </button>
          </div>
        )}
      </div>

      {/* 2. SUBMENUS ESPECÍFICOS CONFORME O TIPO SELECIONADO */}

      {/* A. AFINAÇÃO MOLA */}
      {isSpring && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-amber-800/40 pb-2">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-amber-200">
                Ações Recorrentes: Afinação Mola
              </span>
            </div>
            <span className="text-[10px] text-amber-300 bg-amber-900/60 px-2 py-0.5 rounded font-mono border border-amber-700/50">
              Seleção Múltipla
            </span>
          </div>

          {/* Operational timing notice */}
          <div className="flex items-start gap-2 rounded-lg bg-amber-950/40 border border-amber-800/40 p-2 text-[11px] text-amber-200/90">
            <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-snug">
              <strong>Tempo total de afinação:</strong> Contabiliza a intervenção completa (a máquina pode não parar totalmente ou realizar pequenos arranques e testes durante os ajustes).
            </p>
          </div>

          {/* Action pills grid */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Selecione as ações executadas ({springAdjustments.length} selecionadas):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {SPRING_ACTIONS.map((action) => {
                const isChecked = springAdjustments.includes(action);
                return (
                  <button
                    key={action}
                    type="button"
                    onClick={() => toggleSpringAction(action)}
                    className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold transition-all border text-left ${
                      isChecked
                        ? 'border-amber-400 bg-amber-500 text-slate-950 font-bold shadow-sm ring-1 ring-amber-300'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    <span>{action}</span>
                    {isChecked ? (
                      <Check className="h-3.5 w-3.5 shrink-0 stroke-[3]" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 shrink-0 text-slate-500 opacity-60" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* If 'Outro' action is active */}
          {springAdjustments.includes('Outro') && (
            <div className="pt-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-1">
                Especificar outra ação de mola:
              </label>
              <input
                type="text"
                value={customSpringNote}
                onChange={(e) => {
                  setCustomSpringNote(e.target.value);
                  if (onAutoGenerateSummary) {
                    const summary = buildTaxonomySummary(
                      'Afinação Mola',
                      springAdjustments,
                      mechanicalAdjustments,
                      e.target.value
                    );
                    onAutoGenerateSummary(summary.description, summary.actions);
                  }
                }}
                placeholder="Ex: Tensão de puxador, rotação de matriz..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>
          )}
        </div>
      )}

      {/* B. AFINAÇÃO MECÂNICA */}
      {isMechTuning && (
        <div className="rounded-xl border border-sky-500/40 bg-sky-950/20 p-3.5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-sky-800/40 pb-2">
            <div className="flex items-center gap-2">
              <Cog className="h-4 w-4 text-sky-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-sky-200">
                Órgãos Mecânicos & Género de Afinação
              </span>
            </div>
            <span className="text-[10px] text-sky-300 bg-sky-900/60 px-2 py-0.5 rounded font-mono border border-sky-700/50">
              Curso / Tempo / Ajuste
            </span>
          </div>

          {/* Operational timing notice */}
          <div className="flex items-start gap-2 rounded-lg bg-sky-950/40 border border-sky-800/40 p-2 text-[11px] text-sky-200/90">
            <Clock className="h-3.5 w-3.5 text-sky-400 shrink-0 mt-0.5" />
            <p className="leading-snug">
              <strong>Tempo total de afinação:</strong> Registada a duração integral da afinação mecânica (em marcha de ensaio ou com paragens parcelares).
            </p>
          </div>

          {/* Mechanical components list with adjustment types */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-300">
              Selecione os componentes intervencionados e o género de afinação:
            </label>

            <div className="grid grid-cols-1 gap-2">
              {MECHANICAL_COMPONENTS.map((comp) => {
                const selectedItem = mechanicalAdjustments.find((m) => m.component === comp);
                const isCompSelected = Boolean(selectedItem);

                return (
                  <div
                    key={comp}
                    className={`rounded-xl border transition-all p-2.5 ${
                      isCompSelected
                        ? 'border-sky-500/60 bg-sky-900/30'
                        : 'border-slate-800 bg-slate-800/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      {/* Component Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleMechanicalComponent(comp)}
                        className={`flex items-center gap-2 text-xs font-bold transition-all ${
                          isCompSelected ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            isCompSelected
                              ? 'border-sky-400 bg-sky-500 text-slate-950'
                              : 'border-slate-600 bg-slate-800'
                          }`}
                        >
                          {isCompSelected && <Check className="h-3 w-3 stroke-[3]" />}
                        </span>
                        <span>{comp}</span>
                      </button>

                      {/* Adjustment Types Pills (Curso, Tempo, Ajuste) */}
                      {isCompSelected && (
                        <div className="flex items-center gap-1.5 pl-6 sm:pl-0">
                          <span className="text-[10px] text-slate-400 mr-1 hidden sm:inline">
                            Género:
                          </span>
                          {ADJUSTMENT_TYPES.map((type) => {
                            const isTypeActive = selectedItem?.adjustmentTypes.includes(type);
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => toggleAdjustmentType(comp, type)}
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all border ${
                                  isTypeActive
                                    ? 'border-sky-400 bg-sky-500 text-slate-950 font-bold shadow-sm'
                                    : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                                }`}
                              >
                                {type}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* C. AVARIA MECÂNICA */}
      {isMechBreakdown && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-3.5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-rose-800/40 pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-rose-200">
                Avaria Mecânica
              </span>
            </div>
            <span className="text-[10px] text-rose-300 bg-rose-900/60 px-2 py-0.5 rounded font-mono border border-rose-700/50">
              Paragem Garantida
            </span>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-rose-950/40 border border-rose-800/40 p-2 text-[11px] text-rose-200/90">
            <Info className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
            <p className="leading-snug">
              <strong>Paragem obrigatória da máquina:</strong> A avaria mecânica impede o funcionamento da produção. A máquina fica registada como parada.
            </p>
          </div>
        </div>
      )}

      {/* D. OUTRO */}
      {isOther && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3.5 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
            <FileText className="h-4 w-4 text-slate-400" />
            <span>Outras Ocorrências / Intervenções</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Indique o motivo e as ações específicas no formulário abaixo.
          </p>
        </div>
      )}

      {/* 3. CONDIÇÃO OPERACIONAL DA MÁQUINA (A MÁQUINA PAROU?) */}
      <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
            <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />
            <span>Condição da Máquina <span className="text-rose-400">*</span></span>
          </label>
          {isMechBreakdown && (
            <span className="text-[10px] text-rose-400 font-mono font-bold">
              Fixada em Parada
            </span>
          )}
          {isTuning && (
            <span className="text-[10px] text-amber-400 font-mono">
              Tempo Total Contabilizado
            </span>
          )}
        </div>

        {isMechBreakdown ? (
          <div className="flex items-center gap-3 rounded-xl border border-rose-500/50 bg-rose-500/15 p-3 text-rose-200">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-500 text-white font-bold">
              <Check className="h-4 w-4 stroke-[3]" />
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold">Sim, a máquina está parada (Garantido em avaria mecânica)</span>
              <span className="text-[10px] text-slate-400">Tempo de paragem contabilizado desde o alarme</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                playIndustrialClick();
                onMachineStoppedChange(true);
              }}
              className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                machineStopped
                  ? 'border-rose-500 bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/40 shadow-sm'
                  : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:border-slate-700 hover:text-white'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                  machineStopped ? 'border-rose-400 bg-rose-500 text-white' : 'border-slate-600 bg-slate-900'
                }`}
              >
                {machineStopped && <Check className="h-3.5 w-3.5 stroke-[3]" />}
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-bold">Sim (Parou)</span>
                <span className="text-[9px] text-slate-400 leading-tight">Paragem total da linha</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                playIndustrialClick();
                onMachineStoppedChange(false);
              }}
              className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                !machineStopped
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/40 shadow-sm'
                  : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:border-slate-700 hover:text-white'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                  !machineStopped ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-slate-600 bg-slate-900'
                }`}
              >
                {!machineStopped && <Check className="h-3.5 w-3.5 stroke-[3]" />}
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-bold">Não (A brandar / Ensaio)</span>
                <span className="text-[9px] text-slate-400 leading-tight">Arranques ou marcha lenta</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Quick button to regenerate/sync summary into text fields */}
      {(isSpring || isMechTuning) && onAutoGenerateSummary && (
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span>Resumo preenche automaticamente a descrição e ação:</span>
          <button
            type="button"
            onClick={handleApplySummary}
            className="text-amber-400 hover:text-amber-300 font-bold text-[10px] flex items-center gap-1"
          >
            <span>⚡ Sincronizar texto com seleções</span>
          </button>
        </div>
      )}
    </div>
  );
};
