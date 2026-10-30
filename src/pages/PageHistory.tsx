import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Download,
  Search,
  Filter,
  Calendar,
  Clock,
  User,
  Wrench,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  Trash2,
  Pencil,
  CalendarDays,
  X,
  FileDown,
  Layers,
  BarChart2,
  Database,
  CheckCircle,
} from 'lucide-react';
import { HeaderLogo } from '../components/HeaderLogo';
import {
  Operator,
  StoppageEditChanges,
  StoppageRecord,
  StoppageTypeItem,
} from '../types/manutrack';
import { STOPPAGE_TYPES } from '../data/initialData';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';
import {
  exportStoppageRecordsCSV,
  exportOeeKpiCSV,
  exportConsolidatedBackupCSV,
} from '../utils/csvExport';
import { getShiftFromTimeString } from '../utils/shift';
import { normalizeDateToYMD, getLocalYMD } from '../utils/formatters';
import { DeletePinModal } from '../components/DeletePinModal';
import { EditStoppageModal } from '../components/EditStoppageModal';

interface PageHistoryProps {
  records: StoppageRecord[];
  onBackToHome: () => void;
  onDeleteRecord?: (id: string, pin: string) => Promise<void>;
  onEditRecord?: (
    id: string,
    changes: StoppageEditChanges,
    pin: string,
    baseLastEditedAt?: number
  ) => Promise<void>;
  availableOperators?: Operator[];
  availableStoppageTypes?: StoppageTypeItem[];
  onOpenManualEntry?: () => void;
}

type TimeFilterOption = 'all' | 'today' | 'yesterday' | 'last_week' | 'last_month' | 'custom';

export const PageHistory: React.FC<PageHistoryProps> = ({
  records,
  onBackToHome,
  onDeleteRecord,
  onEditRecord,
  availableOperators,
  availableStoppageTypes,
  onOpenManualEntry,
}) => {
  const [search, setSearch] = useState('');
  const [selectedMachine, setSelectedMachine] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedShift, setSelectedShift] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilterOption>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [stoppageToDelete, setStoppageToDelete] = useState<StoppageRecord | null>(null);
  const [stoppageToEdit, setStoppageToEdit] = useState<StoppageRecord | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  // Dynamic list of all available stoppage types (combines default + records)
  const availableTypesList = useMemo(() => {
    const set = new Set<string>();
    STOPPAGE_TYPES.forEach((st) => set.add(st.type));
    records.forEach((r) => {
      if (r.stoppageType && r.stoppageType.trim()) {
        set.add(r.stoppageType.trim());
      }
    });
    return Array.from(set).sort();
  }, [records]);

  // Helper date strings using local timezone (format: YYYY-MM-DD)
  const todayStr = useMemo(() => getLocalYMD(new Date()), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalYMD(d);
  }, []);
  const sevenDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getLocalYMD(d);
  }, []);
  const thirtyDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getLocalYMD(d);
  }, []);

  // Filter records
  const filtered = useMemo(() => {
    return records.filter((r) => {
      // 1. Machine filter (handles F01, F1, 1, etc.)
      if (selectedMachine !== 'all') {
        const recMachine = (r.machineId || '').toUpperCase().trim();
        const selMachine = selectedMachine.toUpperCase().trim();
        const cleanRec = recMachine.replace(/^F0?/, '');
        const cleanSel = selMachine.replace(/^F0?/, '');
        if (recMachine !== selMachine && cleanRec !== cleanSel) {
          return false;
        }
      }
      
      // 2. Type filter (case and whitespace insensitive)
      if (selectedType !== 'all') {
        const recType = (r.stoppageType || '').toLowerCase().trim();
        const selType = selectedType.toLowerCase().trim();
        if (recType !== selType) {
          return false;
        }
      }

      // 3. Shift filter (matches 1º Turno, 2º Turno, Turno Noturno, Turno 1, etc.)
      if (selectedShift !== 'all') {
        const itemShift = (r.shift || getShiftFromTimeString(r.startTime).name || '').toLowerCase();
        if (selectedShift === '1º Turno') {
          if (!itemShift.includes('1')) return false;
        } else if (selectedShift === '2º Turno') {
          if (!itemShift.includes('2')) return false;
        } else if (selectedShift === 'Turno Noturno') {
          if (!itemShift.includes('noturno') && !itemShift.includes('3')) return false;
        } else if (!itemShift.includes(selectedShift.toLowerCase())) {
          return false;
        }
      }

      // 4. Priority filter (accent and case insensitive)
      if (selectedPriority !== 'all') {
        const recPriority = (r.priority || 'Média')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();
        const selPriority = selectedPriority
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();
        if (recPriority !== selPriority) {
          return false;
        }
      }

      // 5. Status filter (accent and case insensitive)
      if (selectedStatus !== 'all') {
        const recStatus = (r.status || 'Resolvido')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();
        const selStatus = selectedStatus
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();
        if (recStatus !== selStatus) {
          return false;
        }
      }

      // 6. Temporal Quick Filters (normalizes DD/MM/AAAA or AAAA-MM-DD or ms timestamps to YYYY-MM-DD)
      const recordYMD = normalizeDateToYMD(r.date, r.startTimestamp);

      if (timeFilter === 'today') {
        if (!recordYMD || recordYMD !== todayStr) return false;
      } else if (timeFilter === 'yesterday') {
        if (!recordYMD || recordYMD !== yesterdayStr) return false;
      } else if (timeFilter === 'last_week') {
        if (!recordYMD || recordYMD < sevenDaysAgoStr || recordYMD > todayStr) return false;
      } else if (timeFilter === 'last_month') {
        if (!recordYMD || recordYMD < thirtyDaysAgoStr || recordYMD > todayStr) return false;
      } else if (timeFilter === 'custom') {
        if (customStartDate && recordYMD < customStartDate) return false;
        if (customEndDate && recordYMD > customEndDate) return false;
      }

      // 7. Full-text search (searches across all descriptive and metadata fields)
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchText = [
          r.machineId,
          r.machineName,
          r.shift,
          r.priority,
          r.status,
          r.stoppageType,
          r.initiatedBy,
          r.closedBy,
          r.stoppageDescription,
          r.actionsTaken,
          r.otherObservations,
          r.date,
          recordYMD,
          r.startTime,
          r.endTime,
          r.durationFormatted,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!matchText.includes(q)) return false;
      }

      return true;
    });
  }, [
    records,
    selectedMachine,
    selectedType,
    selectedShift,
    selectedPriority,
    selectedStatus,
    timeFilter,
    customStartDate,
    customEndDate,
    search,
    todayStr,
    yesterdayStr,
    sevenDaysAgoStr,
    thirtyDaysAgoStr,
  ]);

  // Total downtime in filtered set
  const totalDurationMs = filtered.reduce((acc, cur) => acc + cur.durationMs, 0);
  const totalMinutes = Math.round(totalDurationMs / (1000 * 60));

  // Check if any filter is currently active
  const isAnyFilterActive =
    selectedMachine !== 'all' ||
    selectedType !== 'all' ||
    selectedShift !== 'all' ||
    selectedPriority !== 'all' ||
    selectedStatus !== 'all' ||
    timeFilter !== 'all' ||
    Boolean(customStartDate) ||
    Boolean(customEndDate) ||
    Boolean(search.trim());

  // Reset all filters back to initial state
  const handleClearAllFilters = () => {
    playIndustrialClick();
    setSelectedMachine('all');
    setSelectedType('all');
    setSelectedShift('all');
    setSelectedPriority('all');
    setSelectedStatus('all');
    setTimeFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setSearch('');
  };

  // Quick action for export with feedback chime
  const handleExport = (type: 'filtered' | 'all' | 'oee' | 'consolidated') => {
    playSuccessChime();
    let msg = '';

    if (type === 'filtered') {
      exportStoppageRecordsCSV(filtered, 'stoptrack_paragens_filtradas');
      msg = `${filtered.length} registos filtrados exportados com sucesso!`;
    } else if (type === 'all') {
      exportStoppageRecordsCSV(records, 'stoptrack_todas_paragens');
      msg = `${records.length} registos totais exportados com sucesso!`;
    } else if (type === 'oee') {
      exportOeeKpiCSV(records, 'stoptrack_indicadores_oee');
      msg = 'Relatório de Indicadores e OEE exportado em CSV!';
    } else if (type === 'consolidated') {
      exportConsolidatedBackupCSV(records, [], [], 'stoptrack_backup_consolidado');
      msg = 'Exportação total consolidada concluída!';
    }

    setExportSuccessMessage(msg);
    setIsExportModalOpen(false);
    setTimeout(() => setExportSuccessMessage(null), 4000);
  };

  const handleConfirmDelete = async (recordId: string, pin: string) => {
    if (onDeleteRecord) {
      await onDeleteRecord(recordId, pin);
      setStoppageToDelete(null);
      playSuccessChime();
      setExportSuccessMessage('Registo de paragem eliminado com sucesso da base de dados!');
      setTimeout(() => setExportSuccessMessage(null), 4000);
    }
  };

  const handleConfirmEdit = async (
    recordId: string,
    changes: StoppageEditChanges,
    pin: string,
    baseLastEditedAt?: number
  ) => {
    if (!onEditRecord) return;
    // Se falhar, o erro sobe ao formulário, que fica aberto e mostra a mensagem.
    await onEditRecord(recordId, changes, pin, baseLastEditedAt);
    setStoppageToEdit(null);
    playSuccessChime();
    setExportSuccessMessage('Paragem atualizada com sucesso!');
    setTimeout(() => setExportSuccessMessage(null), 4000);
  };

  return (
    <div className="flex min-h-[92vh] flex-col justify-between py-5 px-3.5 sm:px-6">
      {/* Top Header */}
      <div>
        <HeaderLogo subtitle="Histórico de Paragens & Registos" />

        <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              onBackToHome();
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar ao Menu Principal</span>
          </button>

          <div className="flex items-center gap-2">
            {onOpenManualEntry && (
              <button
                type="button"
                onClick={() => {
                  playIndustrialClick();
                  onOpenManualEntry();
                }}
                className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 shadow-sm transition-colors active:scale-95"
              >
                <span className="font-mono text-amber-400 font-bold">+</span>
                <span>Registo Manual</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                playIndustrialClick();
                setIsExportModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-950/60 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-900/60 shadow-sm transition-colors active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Export Success Notification Banner */}
        {exportSuccessMessage && (
          <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-950/90 p-3 text-xs font-semibold text-emerald-200 shadow-md flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{exportSuccessMessage}</span>
          </div>
        )}

        {/* Stats Strip */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
            <span className="text-[10px] font-bold uppercase text-slate-400">Paragens Visíveis</span>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-xl font-black text-white font-mono">{filtered.length}</span>
              <span className="text-[11px] text-slate-400">de {records.length} totais</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
            <span className="text-[10px] font-bold uppercase text-slate-400">Tempo Total Parado</span>
            <p className="mt-0.5 text-xl font-black text-amber-400 font-mono">{totalMinutes} min</p>
          </div>
        </div>

        {/* QUICK DATE FILTER BUTTONS */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
              <CalendarDays className="h-3.5 w-3.5 text-amber-400" />
              <span>Atalhos Rápidos de Período:</span>
            </div>
            {timeFilter !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  playIndustrialClick();
                  setTimeFilter('all');
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                className="text-[10px] text-amber-400 hover:underline"
              >
                Limpar Período
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'all', label: 'Todas as Paragens' },
              { id: 'today', label: 'Hoje' },
              { id: 'yesterday', label: 'Dia Anterior' },
              { id: 'last_week', label: 'Última Semana' },
              { id: 'last_month', label: 'Último Mês' },
              { id: 'custom', label: 'Filtrar por Data' },
            ].map((btn) => {
              const isActive = timeFilter === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => {
                    playIndustrialClick();
                    setTimeFilter(btn.id as TimeFilterOption);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>

          {/* Custom Date Range Picker when 'custom' is active */}
          {timeFilter === 'custom' && (
            <div className="mt-2.5 rounded-xl border border-amber-500/30 bg-slate-900/90 p-3 space-y-2">
              <span className="text-[11px] font-bold text-amber-300 block">
                Definir Intervalo de Datas:
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">De (Data Início):</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Até (Data Fim):</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Search and Secondary Dropdown Filters */}
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar por máquina, operador, avaria, data..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-400 focus:border-amber-500 focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {isAnyFilterActive && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-2 text-xs font-bold text-rose-300 hover:bg-rose-900/50 shadow-sm transition-all shrink-0"
                title="Limpar todos os filtros ativos"
              >
                <X className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Limpar Filtros</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <select
              value={selectedMachine}
              onChange={(e) => setSelectedMachine(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="all">Todas as Máquinas (F01–F30)</option>
              {Array.from({ length: 30 }, (_, i) => {
                const code = `F${(i + 1).toString().padStart(2, '0')}`;
                return (
                  <option key={code} value={code}>
                    Máquina {code}
                  </option>
                );
              })}
            </select>

            <select
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="all">Todos os Turnos</option>
              <option value="1º Turno">1º Turno (05:00 - 14:30)</option>
              <option value="2º Turno">2º Turno (14:30 - 00:00)</option>
              <option value="Turno Noturno">Turno Noturno (00:00 - 05:00)</option>
            </select>

            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="all">Todos os Tipos de Paragem</option>
              {availableTypesList.map((typeName) => (
                <option key={typeName} value={typeName}>
                  {typeName}
                </option>
              ))}
            </select>

            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="all">Todas as Prioridades</option>
              <option value="Crítica">Crítica (Urgente)</option>
              <option value="Alta">Alta</option>
              <option value="Média">Média</option>
              <option value="Baixa">Baixa</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="all">Todos os Estados</option>
              <option value="Resolvido">Resolvido</option>
              <option value="Em Decorrer">Em Decorrer</option>
              <option value="Pendente">Pendente</option>
            </select>
          </div>
        </div>
      </div>

      {/* List of Stoppage Cards */}
      <div className="my-4 flex-1 space-y-2.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400 space-y-3">
            <p>Nenhuma paragem encontrada com os filtros selecionados.</p>
            {isAnyFilterActive && (
              <div>
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition-all shadow-sm"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Limpar todos os filtros ({records.length} registos no total)</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          filtered.map((r) => {
            const isExpanded = expandedRecordId === r.id;
            const shiftLabel = r.shift || getShiftFromTimeString(r.startTime).name;
            const isFirstShift = shiftLabel.includes('1');
            const isSecondShift = shiftLabel.includes('2');

            const priorityLabel = r.priority || 'Média';
            const statusLabel = r.status || 'Resolvido';
            const isCritical = priorityLabel === 'Crítica';
            const isHigh = priorityLabel === 'Alta';
            const isMedium = priorityLabel === 'Média';
            const isLow = priorityLabel === 'Baixa';

            const isResolved = statusLabel === 'Resolvido';
            const isInProgress = statusLabel === 'Em Decorrer';
            const isPending = statusLabel === 'Pendente';

            return (
              <div
                key={r.id}
                className="overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/90 shadow-sm"
              >
                {/* Header row */}
                <div
                  onClick={() => setExpandedRecordId(isExpanded ? null : r.id)}
                  className="flex cursor-pointer items-center justify-between p-3 hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-12 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-sm font-black text-amber-300 font-mono">
                      {r.machineId}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-white">
                          {r.stoppageType}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                            isFirstShift
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                              : isSecondShift
                              ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                              : 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                          }`}
                        >
                          {shiftLabel}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                            isCritical
                              ? 'border-rose-500/50 bg-rose-500/20 text-rose-300 font-black animate-pulse'
                              : isHigh
                              ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                              : isMedium
                              ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                              : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {priorityLabel}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded border ${
                            isResolved
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                              : isInProgress
                              ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                              : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                          }`}
                        >
                          {statusLabel}
                        </span>
                        {r.stages && r.stages.length > 0 && (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border border-purple-500/40 bg-purple-500/15 text-purple-300">
                            {r.stages.length} {r.stages.length === 1 ? 'Etapa' : 'Etapas'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {r.date} · {r.startTime} às {r.endTime}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-rose-400 font-mono tabular-nums">
                      {r.durationFormatted}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-slate-800 bg-slate-950/40 p-3.5 space-y-2.5 text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 block font-medium">Turno:</span>
                        <strong className="text-amber-300 font-mono">{shiftLabel}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Prioridade:</span>
                        <strong
                          className={
                            isCritical
                              ? 'text-rose-400 font-bold'
                              : isHigh
                              ? 'text-amber-300 font-bold'
                              : isMedium
                              ? 'text-sky-300 font-medium'
                              : 'text-emerald-300 font-medium'
                          }
                        >
                          {priorityLabel}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Estado:</span>
                        <strong
                          className={
                            isResolved
                              ? 'text-emerald-300 font-medium'
                              : isInProgress
                              ? 'text-sky-300 font-medium'
                              : 'text-amber-300 font-bold'
                          }
                        >
                          {statusLabel}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Máquina parou?</span>
                        {r.machineStopped === true ? (
                          <strong className="text-rose-300 font-bold">Sim</strong>
                        ) : r.machineStopped === false ? (
                          <strong className="text-emerald-300 font-medium">Não</strong>
                        ) : (
                          <strong className="text-slate-500 font-normal">Não indicado</strong>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Iniciado por:</span>
                        <strong className="text-slate-200">{r.initiatedBy}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Fechado por:</span>
                        <strong className="text-slate-200">{r.closedBy}</strong>
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-400 block font-medium">Descrição da Paragem:</span>
                      <p className="mt-0.5 text-slate-200 font-normal leading-relaxed">
                        {r.stoppageDescription}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 block font-medium">Ação Realizada:</span>
                      <p className="mt-0.5 text-emerald-200/90 font-normal leading-relaxed">
                        {r.actionsTaken}
                      </p>
                    </div>

                    {/* Sub-stages Chronological Breakdown */}
                    {r.stages && r.stages.length > 0 && (
                      <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 space-y-2 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5 text-amber-400" />
                            <span>Decomposição em {r.stages.length} Etapas</span>
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Total etapas: {r.stages.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0)} min
                          </span>
                        </div>

                        {/* Stages Visual Track */}
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                          {r.stages.map((stg, sIdx) => {
                            const colors = ['bg-rose-500', 'bg-amber-500', 'bg-sky-500', 'bg-emerald-500', 'bg-purple-500'];
                            const bgCol = colors[sIdx % colors.length];
                            const totalMins = r.stages!.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0) || 1;
                            const pct = Math.max(5, ((Number(stg.durationMinutes) || 0) / totalMins) * 100);
                            return (
                              <div
                                key={stg.id || sIdx}
                                style={{ width: `${pct}%` }}
                                className={`${bgCol} border-r border-slate-900`}
                                title={`Etapa ${stg.order}: ${stg.type} (${stg.durationMinutes}m) - ${stg.technician || ''}`}
                              />
                            );
                          })}
                        </div>

                        {/* Stage Rows */}
                        <div className="space-y-1.5 pt-1">
                          {r.stages.map((stg) => {
                            const lvl = stg.level || (stg.order === 1 ? 1 : 2);
                            return (
                              <div
                                key={stg.id || stg.order}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] bg-slate-950/60 p-2 rounded-lg border border-slate-800/80"
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-slate-300 font-mono font-bold text-[10px] border border-slate-700">
                                    #{stg.order}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded border font-mono text-[9px] font-bold ${
                                      lvl === 1
                                        ? 'text-sky-300 border-sky-500/40 bg-sky-500/15'
                                        : lvl === 2
                                        ? 'text-amber-300 border-amber-500/40 bg-amber-500/15'
                                        : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/15'
                                    }`}
                                  >
                                    {lvl === 1
                                      ? '1. Diagnóstico'
                                      : lvl === 2
                                      ? '2. Intervenção'
                                      : '3. Fecho'}
                                  </span>
                                  <span className="font-bold text-white">{stg.type}</span>
                                  {stg.description && (
                                    <span className="text-slate-400 font-normal">· {stg.description}</span>
                                  )}
                                </div>

                              <div className="flex items-center gap-2 text-[10px] self-end sm:self-auto">
                                {stg.technician && (
                                  <span className="text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                                    {stg.technician}
                                  </span>
                                )}
                                <span className="font-mono font-black text-amber-300">
                                  {stg.durationMinutes} min
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    )}

                    {r.otherObservations && (
                      <div>
                        <span className="text-slate-400 block font-medium">Outras Observações:</span>
                        <p className="mt-0.5 text-slate-300/80 font-normal leading-relaxed">
                          {r.otherObservations}
                        </p>
                      </div>
                    )}

                    {(r.lastEditedAt || r.lastEditedBy) && (
                      <p className="pt-1 text-[10px] text-slate-500">
                        Editado
                        {r.lastEditedBy ? ` por ${r.lastEditedBy}` : ''}
                        {r.lastEditedAt
                          ? ` em ${new Date(r.lastEditedAt).toLocaleString('pt-PT')}`
                          : ''}
                      </p>
                    )}

                    {(onEditRecord || onDeleteRecord) && (
                      <div className="pt-2 flex justify-end gap-2">
                        {onEditRecord && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              playIndustrialClick();
                              setStoppageToEdit(r);
                            }}
                            className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-950/40 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-900/50 hover:text-amber-200 transition-colors shadow-sm"
                            title="Editar esta paragem (requer PIN de operador autorizado)"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Editar</span>
                          </button>
                        )}
                        {onDeleteRecord && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              playIndustrialClick();
                              setStoppageToDelete(r);
                            }}
                            className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/40 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-900/50 hover:text-rose-200 transition-colors shadow-sm"
                            title="Eliminar este registo de paragem mediante introdução de PIN"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Remover</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Back Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => {
            playIndustrialClick();
            onBackToHome();
          }}
          className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-200 hover:bg-slate-700 active:scale-[0.98]"
        >
          Voltar ao Início
        </button>
      </div>

      {/* EXPORT OPTIONS MODAL */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  Opções de Exportação CSV
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Selecione o formato e o âmbito dos dados a exportar. Todos os ficheiros são compatíveis com Excel (separador <code className="text-amber-400">;</code> e UTF-8 com acentos corretos):
            </p>

            <div className="space-y-2.5">
              {/* Option 1: Filtered records */}
              <button
                type="button"
                onClick={() => handleExport('filtered')}
                className="w-full flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3.5 text-left hover:bg-emerald-900/50 hover:border-emerald-400 transition-colors"
              >
                <FileDown className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      Exportar Registos Filtrados
                    </span>
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-300">
                      {filtered.length} paragens
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Descarrega apenas os registos que correspondem aos filtros temporais, de máquina ou pesquisa atuais.
                  </p>
                </div>
              </button>

              {/* Option 2: All records */}
              <button
                type="button"
                onClick={() => handleExport('all')}
                className="w-full flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3.5 text-left hover:bg-slate-800 hover:border-slate-500 transition-colors"
              >
                <Layers className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      Exportar Histórico Completo
                    </span>
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-300">
                      {records.length} paragens
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Exporta a totalidade dos registos de paragem presentes na base de dados, sem restrição de filtros.
                  </p>
                </div>
              </button>

              {/* Option 3: OEE and machine KPIs */}
              <button
                type="button"
                onClick={() => handleExport('oee')}
                className="w-full flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3.5 text-left hover:bg-slate-800 hover:border-slate-500 transition-colors"
              >
                <BarChart2 className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold text-white block">
                    Exportar Indicadores e KPIs (OEE por Máquina)
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Gera a folha de cálculo com resumo executivo, tempos parados por máquina (F01–F30), MTTR e distribuição percentual por avaria.
                  </p>
                </div>
              </button>

              {/* Option 4: Consolidated Full Backup */}
              <button
                type="button"
                onClick={() => handleExport('consolidated')}
                className="w-full flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3.5 text-left hover:bg-slate-800 hover:border-slate-500 transition-colors"
              >
                <Database className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold text-white block">
                    Exportação Total Consolidada
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Ficheiro completo de auditoria com histórico integral, operadores e categorias configuradas.
                  </p>
                </div>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security Deletion PIN Modal */}
      <DeletePinModal
        isOpen={!!stoppageToDelete}
        record={stoppageToDelete}
        onClose={() => setStoppageToDelete(null)}
        onConfirmDelete={handleConfirmDelete}
      />

      {/* Edição de paragem */}
      <EditStoppageModal
        isOpen={!!stoppageToEdit}
        record={stoppageToEdit}
        availableOperators={availableOperators}
        availableStoppageTypes={availableStoppageTypes}
        onClose={() => setStoppageToEdit(null)}
        onSave={handleConfirmEdit}
      />
    </div>
  );
};
