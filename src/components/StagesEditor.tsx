import React from 'react';
import {
  Plus,
  Trash2,
  Clock,
  User,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Layers,
  Search,
  Hammer,
  Flag,
} from 'lucide-react';
import {
  StoppageStage,
  Operator,
  StoppageTypeItem,
  StoppageStageLevel,
} from '../types/manutrack';
import { playIndustrialClick } from '../utils/audio';

interface StagesEditorProps {
  stages: StoppageStage[];
  onChange: (stages: StoppageStage[]) => void;
  totalDurationMinutes: number;
  availableOperators?: Operator[];
  availableStoppageTypes?: StoppageTypeItem[];
}

export const StagesEditor: React.FC<StagesEditorProps> = ({
  stages,
  onChange,
  totalDurationMinutes,
  availableOperators = [],
  availableStoppageTypes = [],
}) => {
  const sumMinutes = stages.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0);
  const diffMinutes = totalDurationMinutes - sumMinutes;

  const handleAddStage = (
    level: StoppageStageLevel = 2,
    presetType?: string,
    presetMinutes?: number
  ) => {
    playIndustrialClick();
    let defaultType = presetType;
    if (!defaultType) {
      if (level === 1) defaultType = 'Diagnóstico Inicial';
      else if (level === 2)
        defaultType =
          availableStoppageTypes.length > 0
            ? availableStoppageTypes[0].name
            : 'Avaria Mecânica';
      else defaultType = 'Arranque e Validação';
    }

    const defaultDuration =
      presetMinutes !== undefined
        ? presetMinutes
        : Math.max(5, diffMinutes > 0 ? diffMinutes : 15);

    const newStage: StoppageStage = {
      id: `stg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      order: stages.length + 1,
      level,
      levelLabel:
        level === 1
          ? '1. Diagnóstico'
          : level === 2
          ? '2. Intervenção'
          : '3. Fecho',
      type: defaultType,
      description: '',
      technician: availableOperators.length > 0 ? availableOperators[0].name : '',
      durationMinutes: defaultDuration,
    };
    onChange([...stages, newStage]);
  };

  const handleUpdateStage = (id: string, updates: Partial<StoppageStage>) => {
    const updated = stages.map((s) => {
      if (s.id === id) {
        const next = { ...s, ...updates };
        if (updates.level) {
          next.levelLabel =
            updates.level === 1
              ? '1. Diagnóstico'
              : updates.level === 2
              ? '2. Intervenção'
              : '3. Fecho';
        }
        return next;
      }
      return s;
    });
    onChange(updated);
  };

  const handleRemoveStage = (id: string) => {
    playIndustrialClick();
    const updated = stages
      .filter((s) => s.id !== id)
      .map((s, idx) => ({ ...s, order: idx + 1 }));
    onChange(updated);
  };

  const handleFillRemaining = () => {
    playIndustrialClick();
    if (diffMinutes <= 0) return;
    if (stages.length > 0) {
      const last = stages[stages.length - 1];
      handleUpdateStage(last.id, {
        durationMinutes: (Number(last.durationMinutes) || 0) + diffMinutes,
      });
    } else {
      handleAddStage(2, undefined, diffMinutes);
    }
  };

  const activeOps = availableOperators.filter((o) => o.active);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-4 space-y-4 shadow-md">
      {/* Header and Explanation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-400" />
            <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wide">
              Decomposição por Etapas (3 Níveis)
            </h4>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            <strong>1. Diagnóstico</strong> → <strong>2. Intervenção</strong> (pode ter várias: mecânica, elétrica, afinação) → <strong>3. Fecho</strong> (arranque).
          </p>
        </div>

        {/* Status of sum vs total */}
        <div className="flex items-center gap-2">
          {stages.length > 0 && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono font-bold ${
                diffMinutes === 0
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : diffMinutes > 0
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              }`}
            >
              {diffMinutes === 0 ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Soma exata: {sumMinutes}m / {totalDurationMinutes}m</span>
                </>
              ) : diffMinutes > 0 ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  <span>{sumMinutes}m / {totalDurationMinutes}m (Faltam {diffMinutes}m)</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                  <span>{sumMinutes}m / {totalDurationMinutes}m (Excede {-diffMinutes}m)</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Visual Timeline Bar if stages exist */}
      {stages.length > 0 && (
        <div className="space-y-1.5">
          <div className="h-3.5 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
            {stages.map((stg) => {
              const pct =
                totalDurationMinutes > 0
                  ? Math.min(
                      100,
                      Math.max(
                        3,
                        ((Number(stg.durationMinutes) || 0) / totalDurationMinutes) * 100
                      )
                    )
                  : 100 / stages.length;

              // Color code by Level:
              // Level 1 (Diagnóstico) -> Sky
              // Level 2 (Intervenções) -> Amber/Orange/Rose
              // Level 3 (Fecho) -> Emerald
              const lvl = stg.level || 2;
              const bgCol =
                lvl === 1
                  ? 'bg-sky-500'
                  : lvl === 2
                  ? 'bg-amber-500'
                  : 'bg-emerald-500';

              return (
                <div
                  key={stg.id}
                  style={{ width: `${pct}%` }}
                  className={`${bgCol} border-r border-slate-900 transition-all hover:brightness-125`}
                  title={`[Nível ${lvl}] Etapa ${stg.order}: ${stg.type} (${stg.durationMinutes}m) - ${stg.technician || 'Sem técnico'}`}
                />
              );
            })}
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-sky-400">
                <span className="h-2 w-2 rounded-full bg-sky-500"></span> 1. Diagnóstico
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-500"></span> 2. Intervenção
              </span>
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span> 3. Fecho
              </span>
            </span>
            <span>
              Alocado: {sumMinutes}m / {totalDurationMinutes}m
            </span>
          </div>
        </div>
      )}

      {/* Quick Add Presets Bar */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
        <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">
          + Adicionar por Nível:
        </span>
        <button
          type="button"
          onClick={() => handleAddStage(1, 'Diagnóstico Inicial', 10)}
          className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/20 transition-all"
        >
          <Search className="h-3 w-3" />
          <span>+ 1. Diagnóstico</span>
        </button>
        <button
          type="button"
          onClick={() => handleAddStage(2, 'Avaria Mecânica', Math.max(15, Math.floor(totalDurationMinutes / 2)))}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 transition-all"
        >
          <Hammer className="h-3 w-3" />
          <span>+ 2. Mecânica</span>
        </button>
        <button
          type="button"
          onClick={() => handleAddStage(2, 'Avaria Elétrica', Math.max(15, Math.floor(totalDurationMinutes / 3)))}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 transition-all"
        >
          <Wrench className="h-3 w-3" />
          <span>+ 2. Elétrica</span>
        </button>
        <button
          type="button"
          onClick={() => handleAddStage(2, 'Qualidade / Afinação', 15)}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 transition-all"
        >
          <Layers className="h-3 w-3" />
          <span>+ 2. Afinação</span>
        </button>
        <button
          type="button"
          onClick={() => handleAddStage(3, 'Arranque e Validação', 15)}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all"
        >
          <Flag className="h-3 w-3" />
          <span>+ 3. Fecho / Arranque</span>
        </button>
      </div>

      {/* Stage Rows */}
      {stages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700/80 p-4 text-center">
          <p className="text-xs text-slate-400">
            Nenhuma etapa adicionada. Pode registar a paragem em 3 níveis (Diagnóstico → Intervenções → Fecho) usando os botões acima.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {stages.map((stage) => {
            const currentLvl: StoppageStageLevel = stage.level || 2;
            const lvlBorder =
              currentLvl === 1
                ? 'border-sky-500/40'
                : currentLvl === 2
                ? 'border-amber-500/40'
                : 'border-emerald-500/40';

            return (
              <div
                key={stage.id}
                className={`rounded-lg border ${lvlBorder} bg-slate-950/70 p-3 space-y-2.5 relative group hover:border-slate-500 transition-colors`}
              >
                {/* Row Header with Level Badge and Order */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-800 text-slate-200 font-black text-xs font-mono border border-slate-700">
                      #{stage.order}
                    </span>

                    {/* Level Selector Dropdown */}
                    <select
                      value={currentLvl}
                      onChange={(e) =>
                        handleUpdateStage(stage.id, {
                          level: parseInt(e.target.value, 10) as StoppageStageLevel,
                        })
                      }
                      className={`rounded-lg border px-2 py-1 text-xs font-mono font-bold focus:outline-none ${
                        currentLvl === 1
                          ? 'border-sky-500/50 bg-sky-500/20 text-sky-300'
                          : currentLvl === 2
                          ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                          : 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      <option value={1} className="bg-slate-900 text-white">
                        Nível 1 · Diagnóstico
                      </option>
                      <option value={2} className="bg-slate-900 text-white">
                        Nível 2 · Intervenção
                      </option>
                      <option value={3} className="bg-slate-900 text-white">
                        Nível 3 · Fecho
                      </option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveStage(stage.id)}
                    className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="Remover esta etapa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Inputs Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {/* 1. Tipo de Etapa */}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                      Tipo de {currentLvl === 1 ? 'Diagnóstico' : currentLvl === 2 ? 'Intervenção' : 'Fecho'}
                    </label>
                    <input
                      type="text"
                      list={`stage-types-${stage.id}`}
                      value={stage.type}
                      onChange={(e) => handleUpdateStage(stage.id, { type: e.target.value })}
                      placeholder="Ex: Avaria Mecânica"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                    />
                    <datalist id={`stage-types-${stage.id}`}>
                      {currentLvl === 1 && (
                        <>
                          <option value="Diagnóstico Inicial / Triagem" />
                          <option value="Inspeção Visual e Alarmes" />
                          <option value="Análise de Causa Raiz" />
                        </>
                      )}
                      {currentLvl === 2 && (
                        <>
                          <option value="Avaria Mecânica" />
                          <option value="Avaria Elétrica" />
                          <option value="Pneumática / Hidráulica" />
                          <option value="Substituição de Peças" />
                          <option value="Falta de Matéria-Prima / Abastecimento" />
                          <option value="Qualidade / Afinação" />
                          <option value="Limpeza / Desobstrução" />
                        </>
                      )}
                      {currentLvl === 3 && (
                        <>
                          <option value="Arranque e Produção" />
                          <option value="Teste em Vazio e Validação" />
                          <option value="Verificação de Primeiras Peças" />
                          <option value="Entrega Operacional da Linha" />
                        </>
                      )}
                      {availableStoppageTypes.map((st) => (
                        <option key={st.id} value={st.name} />
                      ))}
                    </datalist>
                  </div>

                  {/* 2. Duração em Minutos */}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1 flex items-center justify-between">
                      <span>Duração (minutos)</span>
                      <span className="font-mono text-amber-300">
                        {Math.floor(stage.durationMinutes / 60)}h {stage.durationMinutes % 60}m
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        value={stage.durationMinutes || ''}
                        onChange={(e) =>
                          handleUpdateStage(stage.id, {
                            durationMinutes: Math.max(1, parseInt(e.target.value, 10) || 0),
                          })
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 pl-8 text-xs font-mono font-bold text-white focus:border-amber-500 focus:outline-none"
                        placeholder="Ex: 60"
                      />
                      <Clock className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                    </div>
                  </div>

                  {/* 3. Técnico / Interveniente */}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                      Técnico / Responsável
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        list={`ops-list-${stage.id}`}
                        value={stage.technician}
                        onChange={(e) =>
                          handleUpdateStage(stage.id, { technician: e.target.value })
                        }
                        placeholder="Ex: Carlos Mecânico"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 pl-8 text-xs text-white focus:border-amber-500 focus:outline-none"
                      />
                      <User className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                      <datalist id={`ops-list-${stage.id}`}>
                        {activeOps.map((op) => (
                          <option key={op.id} value={`${op.name} (${op.role})`} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                </div>

                {/* Descrição específica desta etapa */}
                <div>
                  <input
                    type="text"
                    value={stage.description}
                    onChange={(e) =>
                      handleUpdateStage(stage.id, { description: e.target.value })
                    }
                    placeholder="Ação específica realizada (ex: verificação do alarme, troca do sensor, afinação das guias)..."
                    className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            );
          })}

          {/* Controls below rows */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleAddStage(2)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-colors shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Adicionar Mais Uma Etapa de Intervenção (Nível 2)</span>
            </button>

            {diffMinutes > 0 && (
              <button
                type="button"
                onClick={handleFillRemaining}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition-colors"
                title="Ajustar e preencher os minutos restantes"
              >
                <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                <span>Preencher restante ({diffMinutes} min)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
