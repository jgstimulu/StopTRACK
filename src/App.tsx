/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  AppPage,
  Machine,
  ActiveDowntime,
  StoppageRecord,
  Operator,
  StoppageTypeItem,
  StoppageStage,
  StoppageStageLevel,
  StoppageTemplate,
} from './types/manutrack';
import {
  MACHINES_DATA,
  INITIAL_STOPPAGE_TYPES,
  INITIAL_STOPPAGE_TEMPLATES,
  INITIAL_STOPPAGES_SEED,
} from './data/initialData';
import { formatTimeOnly, formatDatePt } from './utils/formatters';
import { playIndustrialClick, playSuccessChime } from './utils/audio';
import { getShiftInfo } from './utils/shift';
import {
  fetchSharedState,
  apiStartActiveDowntime,
  apiCancelActiveDowntime,
  apiSaveStoppage,
  apiUpdateStoppage,
  apiDeleteStoppage,
  apiMigrateLocalRecords,
  apiBatchImportStoppages,
  apiAddOperator,
  apiUpdateOperator,
  apiDeleteOperator,
  apiAddStoppageType,
  apiUpdateStoppageType,
  apiDeleteStoppageType,
  apiAddStoppageTemplate,
  apiUpdateStoppageTemplate,
  apiDeleteStoppageTemplate,
  apiResetDefaults,
  apiOperatorLogin,
  apiAdminLogin,
  apiAdminLogout,
  apiOperatorLogout,
  ApiError,
  hasStoredSession,
  clearAdminToken,
  clearOperatorToken,
} from './services/api';


import { PageHome } from './pages/PageHome';
import { PageSelectMachine } from './pages/PageSelectMachine';
import { PageTimer } from './pages/PageTimer';
import { PageCloseStoppage } from './pages/PageCloseStoppage';
import { PageHistory } from './pages/PageHistory';
import { PageDashboard } from './pages/PageDashboard';
import { PageAdmin } from './pages/PageAdmin';
import { PageActiveMonitoring } from './pages/PageActiveMonitoring';
import { PageManualEntry } from './pages/PageManualEntry';
import { ShareModal } from './components/ShareModal';
import { AppLoginGate } from './components/AppLoginGate';
import { Smartphone, Monitor, CheckCircle, Server, Settings2, QrCode, Cloud, RefreshCw, Activity, Layers, Wrench, LogOut } from 'lucide-react';

export default function App() {
  // Navigation Page
  const [currentPage, setCurrentPage] = useState<AppPage>('home');

  // Backend state: Operators and Stoppage Types
  const [operators, setOperators] = useState<Operator[]>([]);

  const [stoppageTypes, setStoppageTypes] = useState<StoppageTypeItem[]>(() => {
    try {
      const saved = localStorage.getItem('manutrack_stoppage_types_cache');
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore
    }
    return INITIAL_STOPPAGE_TYPES;
  });

  const [stoppageTemplates, setStoppageTemplates] = useState<StoppageTemplate[]>(() => {
    try {
      const saved = localStorage.getItem('manutrack_stoppage_templates_cache');
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore
    }
    return INITIAL_STOPPAGE_TEMPLATES;
  });

  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(true);
  const [requiresLogin, setRequiresLogin] = useState<boolean>(() => !hasStoredSession());
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(() => hasStoredSession());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const cloudStateVersionRef = useRef(0);
  const isSavingStoppageRef = useRef(false);

  // Persistence: Active running downtimes
  const [activeDowntimes, setActiveDowntimes] = useState<ActiveDowntime[]>(() => {
    try {
      const saved = localStorage.getItem('manutrack_active_downtimes');
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore parse errors
    }
    return [];
  });

  // Current active downtime being timed or closed
  const [focusedDowntime, setFocusedDowntime] = useState<ActiveDowntime | null>(null);

  // Timestamp when stopwatch was stopped
  const [stopEndTimestamp, setStopEndTimestamp] = useState<number>(0);

  // Persistence: Stoppage records history (Cleaned of any mock seed records)
  const [records, setRecords] = useState<StoppageRecord[]>(() => {
    try {
      const saved = localStorage.getItem('manutrack_stoppages_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((r) => r && r.id && !r.id.startsWith('seed-'));
        }
      }
    } catch {
      // Ignore parse errors
    }
    return INITIAL_STOPPAGES_SEED;
  });

  // Current Operator (starts unselected so operator selection is mandatory)
  const [currentOperator, setCurrentOperator] = useState<string>('');

  // UI preferences: Mobile Frame simulation on desktop viewports
  const [isMobileFrame, setIsMobileFrame] = useState<boolean>(true);

  // Share & QR Modal
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const clearSensitiveState = () => {
    setOperators([]);
    setActiveDowntimes([]);
    setRecords([]);
    setFocusedDowntime(null);
    setStopEndTimestamp(0);
    setCurrentOperator('');
    try {
      localStorage.removeItem('manutrack_stoppages_history');
      localStorage.removeItem('manutrack_active_downtimes');
      localStorage.removeItem('manutrack_operators_cache');
    } catch {
      // Storage unavailable
    }
  };

  // Periodic Cloud Sync Function with Bidirectional Resilience (Keep all devices aligned & never wipe data)
  const syncWithCloud = async () => {
    if (isSavingStoppageRef.current) return;
    const syncVersion = cloudStateVersionRef.current;

    try {
      setIsSyncing(true);
      const state = await fetchSharedState();
      if (isSavingStoppageRef.current || syncVersion !== cloudStateVersionRef.current) return;
      setIsBackendConnected(true);

      // 1. Sync Operators with local merge (only trigger re-render if actually changed)
      if (Array.isArray(state.operators)) {
        setOperators((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(state.operators)) return prev;
          return state.operators;
        });
      }

      // 2. Sync Stoppage Types (only trigger re-render if actually changed)
      if (Array.isArray(state.stoppageTypes)) {
        setStoppageTypes((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(state.stoppageTypes)) return prev;
          localStorage.setItem('manutrack_stoppage_types_cache', JSON.stringify(state.stoppageTypes));
          return state.stoppageTypes;
        });
      }

      // 2.1. Sync Stoppage Templates
      if (Array.isArray(state.stoppageTemplates)) {
        setStoppageTemplates((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(state.stoppageTemplates)) return prev;
          localStorage.setItem('manutrack_stoppage_templates_cache', JSON.stringify(state.stoppageTemplates));
          return state.stoppageTemplates!;
        });
      }


      // 3. Sync Active Downtimes (merge running timers)
      if (Array.isArray(state.activeDowntimes)) {
        const mergedActives = state.activeDowntimes;
        setActiveDowntimes(mergedActives);
        localStorage.setItem('manutrack_active_downtimes', JSON.stringify(mergedActives));

        // If currently on timing page, ensure focused downtime still matches
        if (focusedDowntime) {
          const match = mergedActives.find((d) => d.machineId === focusedDowntime.machineId);
          if (match) {
            setFocusedDowntime(match);
          }
        }
      }

      // 4. Sync Stoppages History (CRITICAL: Never overwrite with empty list!)
      if (Array.isArray(state.stoppages)) {
        const cleanServerStoppages = state.stoppages.filter(
          (r: any) => r && r.id && !r.id.startsWith('seed-')
        );

        const mergedRecords = [...cleanServerStoppages].sort(
          (a, b) => (b.startTimestamp || b.createdAt || 0) - (a.startTimestamp || a.createdAt || 0)
        );

        setRecords(mergedRecords);
        localStorage.setItem('manutrack_stoppages_history', JSON.stringify(mergedRecords));

      }
    } catch (error) {
      setIsBackendConnected(false);
      if (error instanceof ApiError && error.status === 401) {
        clearAdminToken();
        clearOperatorToken();
        clearSensitiveState();
        setRequiresLogin(true);
      }
    } finally {
      setIsSyncing(false);
      setIsBootstrapping(false);
    }
  };

  // The protected Express API is the single persistence path; reads are refreshed from it.
  useEffect(() => {
    if (requiresLogin) return;

    localStorage.removeItem('manutrack_operators_cache');
    syncWithCloud();

    const interval = setInterval(() => {
      syncWithCloud();
    }, 4000);

    const onFocus = () => syncWithCloud();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [requiresLogin]);

  // Sync current operator to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('manutrack_current_operator', currentOperator);
    } catch {
      // Storage error
    }
  }, [currentOperator]);

  // Toast auto-clear
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Operator selection is strictly manual and mandatory without preselection

  // Operator CRUD Handlers
  const handleAddOperator = async (data: Omit<Operator, 'id' | 'active'>, pin: string) => {
    const savedOp = await apiAddOperator(data, pin);
    cloudStateVersionRef.current += 1;
    setOperators((current) =>
      current.some((operator) => operator.id === savedOp.id)
        ? current.map((operator) => (operator.id === savedOp.id ? savedOp : operator))
        : [...current, savedOp]
    );
  };

  const handleUpdateOperator = async (id: string, data: Partial<Operator> & { pin?: string }) => {
    const updatedOp = await apiUpdateOperator(id, data);
    cloudStateVersionRef.current += 1;
    setOperators((current) => current.map((operator) => (operator.id === id ? updatedOp : operator)));
  };

  const handleDeleteOperator = async (id: string) => {
    await apiDeleteOperator(id);
    cloudStateVersionRef.current += 1;
    setOperators((current) => current.filter((operator) => operator.id !== id));
  };

  // Stoppage Types CRUD Handlers
  const handleAddStoppageType = async (data: Omit<StoppageTypeItem, 'id' | 'active'>) => {
    const savedType = await apiAddStoppageType(data);
    const updated = [...stoppageTypes, savedType];
    setStoppageTypes(updated);
    localStorage.setItem('manutrack_stoppage_types_cache', JSON.stringify(updated));
  };

  const handleUpdateStoppageType = async (id: string, data: Partial<StoppageTypeItem>) => {
    const updatedType = await apiUpdateStoppageType(id, data);
    const updated = stoppageTypes.map((st) => (st.id === id ? updatedType : st));
    setStoppageTypes(updated);
    localStorage.setItem('manutrack_stoppage_types_cache', JSON.stringify(updated));
  };

  const handleDeleteStoppageType = async (id: string) => {
    await apiDeleteStoppageType(id);
    const updated = stoppageTypes.filter((st) => st.id !== id);
    setStoppageTypes(updated);
    localStorage.setItem('manutrack_stoppage_types_cache', JSON.stringify(updated));
  };

  // Stoppage Templates CRUD Handlers
  const handleAddStoppageTemplate = async (data: Omit<StoppageTemplate, 'id' | 'active'>) => {
    const savedTemplate = await apiAddStoppageTemplate(data);
    const updated = [...stoppageTemplates, savedTemplate];
    setStoppageTemplates(updated);
    localStorage.setItem('manutrack_stoppage_templates_cache', JSON.stringify(updated));
    setToastMessage('Modelo de avaria criado com sucesso!');
  };

  const handleUpdateStoppageTemplate = async (id: string, data: Partial<StoppageTemplate>) => {
    const updatedTemplate = await apiUpdateStoppageTemplate(id, data);
    const updated = stoppageTemplates.map((t) => (t.id === id ? updatedTemplate : t));
    setStoppageTemplates(updated);
    localStorage.setItem('manutrack_stoppage_templates_cache', JSON.stringify(updated));
    setToastMessage('Modelo de avaria atualizado com sucesso!');
  };

  const handleDeleteStoppageTemplate = async (id: string) => {
    await apiDeleteStoppageTemplate(id);
    const updated = stoppageTemplates.filter((t) => t.id !== id);
    setStoppageTemplates(updated);
    localStorage.setItem('manutrack_stoppage_templates_cache', JSON.stringify(updated));
    setToastMessage('Modelo de avaria removido com sucesso!');
  };

  const handleResetDefaults = async () => {
    await apiResetDefaults();
    cloudStateVersionRef.current += 1;
    setOperators([]);
    setStoppageTypes(INITIAL_STOPPAGE_TYPES);
    setStoppageTemplates(INITIAL_STOPPAGE_TEMPLATES);
    localStorage.removeItem('manutrack_operators_cache');
    localStorage.setItem('manutrack_stoppage_types_cache', JSON.stringify(INITIAL_STOPPAGE_TYPES));
    localStorage.setItem('manutrack_stoppage_templates_cache', JSON.stringify(INITIAL_STOPPAGE_TEMPLATES));
  };


  // Migrate local device records to cloud
  const handleMigrateLocal = async (): Promise<number> => {
    try {
      const res = await apiMigrateLocalRecords(records);
      await syncWithCloud();
      return res.addedCount;
    } catch (err) {
      console.error('Migration error:', err);
      throw err;
    }
  };

  // Batch Import from CSV file into Central Cloud DB
  const handleBatchImportStoppages = async (
    recordsToImport: StoppageRecord[],
    replaceExisting: boolean
  ) => {
    const res = await apiBatchImportStoppages(recordsToImport, replaceExisting);
    await syncWithCloud();
    return res;
  };

  // Page 1: Start Stoppage -> Page 2
  const handleStartStoppageFromHome = () => {
    setCurrentPage('select_machine');
  };

  // Page 2: Machine clicked -> immediately start downtime timer in cloud & go to Page 3
  const handleSelectMachine = async (
    machine: Machine,
    operator: string,
    shift: string | undefined,
    operatorId: string,
    pin: string
  ) => {
    const now = new Date();
    const shiftInfo = shift ? shift : getShiftInfo(now).name;
    const newActive: ActiveDowntime = {
      id: `active-${Date.now()}-${machine.code}`,
      machineId: machine.code,
      machineName: machine.name,
      startTimestamp: now.getTime(),
      startDateFormatted: formatDatePt(now),
      startTimeFormatted: formatTimeOnly(now),
      shift: shiftInfo,
      initiatedBy: operator.trim(),
      stageStartTimestamp: now.getTime(),
      currentLevel: 1, // 1 - Diagnóstico
      currentStage: 'Diagnóstico da Avaria',
      completedStages: [],
    };

    await apiOperatorLogin(operatorId, pin);
    await apiStartActiveDowntime(newActive);
    setCurrentOperator('');
    setActiveDowntimes((prev) => [...prev.filter((d) => d.machineId !== machine.code), newActive]);
    localStorage.setItem('manutrack_active_downtimes', JSON.stringify([
      ...activeDowntimes.filter((downtime) => downtime.machineId !== machine.code),
      newActive,
    ]));
    setFocusedDowntime(newActive);
    setCurrentPage('timing');
  };

  // Handler for live stage transition (1-Diagnóstico -> 2-Intervenção -> 3-Fecho)
  const handleTransitionStage = async (
    downtime: ActiveDowntime,
    transition: {
      completedStage: StoppageStage;
      nextStageName: string;
      nextTechnician: string;
      nextLevel: StoppageStageLevel;
    }
  ) => {
    const updatedStages = [...(downtime.completedStages || []), transition.completedStage];
    const updated: ActiveDowntime = {
      ...downtime,
      completedStages: updatedStages,
      currentStage: transition.nextStageName,
      currentLevel: transition.nextLevel,
      assignedTechnician: transition.nextTechnician,
      stageStartTimestamp: Date.now(),
    };

    try {
      await apiStartActiveDowntime(updated);
      setActiveDowntimes((prev) =>
        prev.map((d) => (d.machineId === updated.machineId ? updated : d))
      );
      if (focusedDowntime?.machineId === updated.machineId) setFocusedDowntime(updated);
      setToastMessage(
        `${updated.machineId}: Concluída etapa "${transition.completedStage.type}" (${transition.completedStage.durationMinutes}m). Iniciado Nível ${transition.nextLevel} (${transition.nextStageName}) com ${transition.nextTechnician}.`
      );
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : 'Não foi possível atualizar a paragem.');
    }
  };

  // Open existing active downtime timer
  const handleOpenActiveTimer = (downtime: ActiveDowntime) => {
    setFocusedDowntime(downtime);
    setCurrentPage('timing');
  };

  // Page 3: "Parar contagem" clicked -> calculate elapsed & go to Page 4 (Close Stoppage)
  const handleStopCounting = (downtime: ActiveDowntime, endTimestamp: number) => {
    setFocusedDowntime(downtime);
    setStopEndTimestamp(endTimestamp);
    setCurrentPage('close_form');
  };

  // Page 4: "Gravar e sair" clicked -> save record to cloud database & clear machine status
  const handleSaveAndExit = async (newRecord: StoppageRecord) => {
    isSavingStoppageRef.current = true;
    cloudStateVersionRef.current += 1;
    try {
      await apiSaveStoppage(newRecord);
      // Explicitly delete from active downtimes on the server
      await apiCancelActiveDowntime(newRecord.machineId).catch(() => {});

      const cleanMachineId = newRecord.machineId.trim().toUpperCase();
      const updatedRecords = [newRecord, ...records.filter((record) => record.id !== newRecord.id)];
      const remainingActive = activeDowntimes.filter(
        (downtime) => downtime.machineId.trim().toUpperCase() !== cleanMachineId
      );
      setRecords(updatedRecords);
      setActiveDowntimes(remainingActive);
      setFocusedDowntime(null);
      setStopEndTimestamp(0);
      localStorage.setItem('manutrack_stoppages_history', JSON.stringify(updatedRecords));
      localStorage.setItem('manutrack_active_downtimes', JSON.stringify(remainingActive));
      setToastMessage(`Paragem da ${newRecord.machineId} registada com sucesso (${newRecord.durationFormatted})!`);
      setCurrentPage('home');
    } finally {
      isSavingStoppageRef.current = false;
    }
  };

  // Delete stoppage from cloud and local with PIN authorization
  const handleDeleteRecord = async (id: string, pin?: string) => {
    await apiDeleteStoppage(id, pin);

    // If successful, update local state
    setRecords((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      try {
        localStorage.setItem('manutrack_stoppages_history', JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });

    setToastMessage('Registo de paragem eliminado com sucesso da base de dados.');
  };

  // Handler for editing/correcting stoppage records after closure
  const handleUpdateRecord = async (updated: StoppageRecord, pin?: string) => {
    isSavingStoppageRef.current = true;
    cloudStateVersionRef.current += 1;
    try {
      let saved = updated;
      try {
        saved = await apiUpdateStoppage(updated, pin);
      } catch (err: any) {
        if (!isBackendConnected) {
          saved = updated;
        } else {
          throw err;
        }
      }
      setRecords((prev) => {
        const next = prev.map((r) => (r.id === saved.id ? saved : r));
        try {
          localStorage.setItem('manutrack_stoppages_history', JSON.stringify(next));
        } catch {
          // Ignore
        }
        return next;
      });
      setToastMessage(`Paragem da ${saved.machineId} corrigida e guardada com sucesso!`);
    } finally {
      isSavingStoppageRef.current = false;
      void syncWithCloud();
    }
  };

  // Handler for manual retrospective stoppage entry
  const handleSaveManualRecord = async (newRecord: StoppageRecord, operatorId: string, pin: string) => {
    await apiOperatorLogin(operatorId, pin);
    await apiSaveStoppage(newRecord, true);
    const updated = [newRecord, ...records.filter((record) => record.id !== newRecord.id)];
    setRecords(updated);
    localStorage.setItem('manutrack_stoppages_history', JSON.stringify(updated));
    setToastMessage(`Paragem da ${newRecord.machineId} inserida manualmente com sucesso!`);
    setCurrentPage('history');
  };

  // Handler to update active downtime details (e.g. assigned technician, stage)
  const handleUpdateActiveDowntime = async (updated: ActiveDowntime) => {
    try {
      await apiStartActiveDowntime(updated);
      setActiveDowntimes((prev) =>
        prev.map((d) => (d.machineId === updated.machineId ? updated : d))
      );
      if (focusedDowntime?.machineId === updated.machineId) setFocusedDowntime(updated);
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : 'Não foi possível atualizar a paragem.');
    }
  };

  // Quick switch focused downtime
  const handleSwitchActiveDowntime = (downtime: ActiveDowntime) => {
    setFocusedDowntime(downtime);
    setCurrentPage('timing');
  };

  // Exit button on Page 1 or Page 2
  const handleExitApp = () => {
    setCurrentPage('home');
    setToastMessage('Sessão StopTRACK em espera.');
  };

  const handleOperatorAppLogin = async (operatorId: string, pin: string) => {
    await apiOperatorLogin(operatorId, pin);
    clearSensitiveState();
    setIsBootstrapping(true);
    setRequiresLogin(false);
  };

  const handleAdminAppLogin = async (email: string, password: string) => {
    await apiAdminLogin(email, password);
    clearSensitiveState();
    setIsBootstrapping(true);
    setRequiresLogin(false);
  };

  const handleLogout = async () => {
    await Promise.allSettled([apiAdminLogout(), apiOperatorLogout()]);
    clearSensitiveState();
    setRequiresLogin(true);
    setCurrentPage('home');
    setStoppageTypes(INITIAL_STOPPAGE_TYPES);
    setStoppageTemplates(INITIAL_STOPPAGE_TEMPLATES);
    localStorage.removeItem('manutrack_stoppage_types_cache');
    localStorage.removeItem('manutrack_stoppage_templates_cache');
  };

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300 antialiased">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-amber-400" />
          <p className="text-xs font-semibold uppercase tracking-wider">A validar sessão...</p>
        </div>
      </div>
    );
  }

  if (requiresLogin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-start bg-slate-950 text-slate-100 antialiased selection:bg-amber-500 selection:text-slate-950">
        <AppLoginGate
          onOperatorLogin={handleOperatorAppLogin}
          onAdminLogin={handleAdminAppLogin}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start antialiased selection:bg-amber-500 selection:text-slate-950">
      {/* Desktop Top Toolbar (Frame toggle, Cloud status, QR code share) */}
      <div className="w-full max-w-5xl px-4 pt-3 pb-1 flex flex-wrap items-center justify-between gap-y-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300">StopTRACK Móvel</span>
          <span className="hidden sm:inline text-slate-600">·</span>
          <div className="flex items-center gap-1.5 text-[11px] font-mono">
            <span
              className={`h-2 w-2 rounded-full inline-block ${
                isBackendConnected ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            ></span>
            <span className={`hidden sm:inline ${isBackendConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isBackendConnected ? 'Nuvem Partilhada Ativa' : 'Modo Offline (Cache Local)'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* QR Code / Share on Mobile Button */}
          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              setIsShareModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-500/20 transition-colors shadow-sm"
            title="Abrir ou partilhar noutro telemóvel via código QR"
          >
            <QrCode className="h-3.5 w-3.5" />
            <span className="hidden sm:inline font-bold">Partilhar Telemóvel</span>
          </button>

          {/* Quick link to Backend Config */}
          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              setCurrentPage('admin');
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
              currentPage === 'admin'
                ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-500'
            }`}
          >
            <Settings2 className="h-3.5 w-3.5 text-amber-400" />
            <span>Backend</span>
          </button>

          {/* End the current operator/admin session */}
          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              void handleLogout();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-300 hover:border-rose-500/60 hover:bg-rose-950/40 hover:text-white transition-colors"
            title="Terminar sessão"
          >
            <LogOut className="h-3.5 w-3.5 text-rose-400" />
            <span className="hidden sm:inline">Sair</span>
          </button>

          {/* Mobile frame toggle for desktop testing */}
          <button
            type="button"
            onClick={() => setIsMobileFrame(!isMobileFrame)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
            title="Alternar entre simulação de ecrã móvel e largura total"
          >
            {isMobileFrame ? (
              <>
                <Smartphone className="h-3.5 w-3.5 text-amber-400" />
                <span className="hidden sm:inline">Telemóvel</span>
              </>
            ) : (
              <>
                <Monitor className="h-3.5 w-3.5 text-sky-400" />
                <span className="hidden sm:inline">Expandido</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Container / Mobile Phone Device Shell */}
      <main
        className={`w-full transition-all duration-300 ${
          isMobileFrame
            ? 'max-w-[440px] my-2 sm:my-4 rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl ring-1 ring-slate-800/80 overflow-hidden'
            : 'max-w-2xl my-2'
        }`}
      >
        {/* Mobile Status Bar Simulation */}
        {isMobileFrame && (
          <div className="flex items-center justify-between px-6 pt-2 pb-1 text-[11px] font-mono text-slate-400 border-b border-slate-800/60 bg-slate-950/60">
            <span>{new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsShareModalOpen(true)}
                className="flex items-center gap-1 text-[10px] text-amber-400 hover:underline"
              >
                <QrCode className="h-2.5 w-2.5" />
                <span>QR Partilha</span>
              </button>
              <div className="flex items-center gap-1">
                <span>Nuvem</span>
                <span
                  className={`h-2 w-2 rounded-full inline-block ${
                    isBackendConnected ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                ></span>
              </div>
            </div>
          </div>
        )}

        {/* Global Toast Notification */}
        {toastMessage && (
          <div className="mx-4 mt-3 rounded-xl border border-emerald-500/40 bg-emerald-950/90 p-3 text-xs font-semibold text-emerald-200 shadow-lg flex items-center gap-2 animate-bounce">
            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Concurrent Multi-stoppages quick dock if 2 or more machines are stopped */}
        {activeDowntimes.length > 1 && currentPage !== 'active_monitoring' && currentPage !== 'timing' && (
          <div className="mx-4 mt-2.5 rounded-xl border border-amber-500/40 bg-amber-950/40 p-2 text-xs flex items-center justify-between gap-2 shadow-md">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1 shrink-0">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
                <span>{activeDowntimes.length} Paragens:</span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {activeDowntimes.map((d) => (
                  <button
                    key={d.id || d.machineId}
                    type="button"
                    onClick={() => handleOpenActiveTimer(d)}
                    className="px-2 py-0.5 rounded border border-rose-500/50 bg-rose-500/20 text-rose-300 font-mono font-bold text-[11px] hover:bg-rose-500/30 transition-colors"
                    title={`Abrir cronómetro de ${d.machineId}`}
                  >
                    {d.machineId}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCurrentPage('active_monitoring')}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 shrink-0 underline"
            >
              Ver Painel
            </button>
          </div>
        )}

        {/* SCREEN 1: Página 1 (Início - Logotipo, Iniciar Paragem, Sair) */}
        {currentPage === 'home' && (
          <PageHome
            onStartStoppage={handleStartStoppageFromHome}
            onExit={handleExitApp}
            activeDowntimes={activeDowntimes}
            onOpenActiveTimer={handleOpenActiveTimer}
            onOpenActiveMonitoring={() => setCurrentPage('active_monitoring')}
            onOpenManualEntry={() => setCurrentPage('manual_entry')}
            onOpenHistory={() => setCurrentPage('history')}
            onOpenDashboard={() => setCurrentPage('dashboard')}
            onOpenAdmin={() => setCurrentPage('admin')}
            onOpenShare={() => setIsShareModalOpen(true)}
            totalSavedRecords={records.length}
          />
        )}

        {/* SCREEN 2: Página 2 (Quem Inicia & Seleção de Máquina F01–F30) */}
        {currentPage === 'select_machine' && (
          <PageSelectMachine
            onSelectMachine={handleSelectMachine}
            onExit={() => setCurrentPage('home')}
            activeDowntimes={activeDowntimes}
            onOpenActiveTimer={handleOpenActiveTimer}
            currentOperator={currentOperator}
            onSetOperator={setCurrentOperator}
            availableOperators={operators}
            onOpenAdmin={() => setCurrentPage('admin')}
          />
        )}

        {/* SCREEN 3: Página 3 (Cronómetro / Relógio da Paragem com botão Parar contagem) */}
        {currentPage === 'timing' && (
          (focusedDowntime || (activeDowntimes.length > 0 ? activeDowntimes[0] : null)) ? (
            <PageTimer
              activeDowntime={focusedDowntime || activeDowntimes[0]}
              onStopCounting={handleStopCounting}
              onBackToHome={() => setCurrentPage('home')}
              allActiveDowntimes={activeDowntimes}
              onSwitchDowntime={handleSwitchActiveDowntime}
              onOpenMonitoring={() => setCurrentPage('active_monitoring')}
              onAddNewStoppage={() => setCurrentPage('select_machine')}
              availableOperators={operators}
              availableStoppageTypes={stoppageTypes}
              onTransitionStage={handleTransitionStage}
            />
          ) : (
            <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center text-slate-300">
              <p className="text-sm font-bold text-amber-400 mb-3">Nenhuma paragem ativa selecionada</p>
              <button
                type="button"
                onClick={() => setCurrentPage('home')}
                className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider"
              >
                Voltar ao Início
              </button>
            </div>
          )
        )}

        {/* SCREEN 4: Página 4 (Resumo topo + Formulário com Quem iniciou, Quem fechou, Tipo, Descrição, O que foi feito + Gravar e Sair) */}
        {currentPage === 'close_form' && (
          (focusedDowntime || (activeDowntimes.length > 0 ? activeDowntimes[0] : null)) ? (
            <PageCloseStoppage
              activeDowntime={focusedDowntime || activeDowntimes[0]}
              endTimestamp={stopEndTimestamp || Date.now()}
              onSaveAndExit={handleSaveAndExit}
              onCancel={() => {
                if (activeDowntimes.length > 1) {
                  setCurrentPage('active_monitoring');
                } else if (focusedDowntime || activeDowntimes.length > 0) {
                  setCurrentPage('timing');
                } else {
                  setCurrentPage('home');
                }
              }}
              availableOperators={operators}
              availableStoppageTypes={stoppageTypes}
              availableTemplates={stoppageTemplates}
              onOpenAdmin={() => setCurrentPage('admin')}
            />
          ) : (
            <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center text-slate-300">
              <p className="text-sm font-bold text-amber-400 mb-3">Não existe paragem em curso para encerrar</p>
              <button
                type="button"
                onClick={() => setCurrentPage('home')}
                className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider"
              >
                Voltar ao Início
              </button>
            </div>
          )
        )}

        {/* SCREEN 5: Painel de Controlo / Cronómetros Ativos em Paralelo */}
        {currentPage === 'active_monitoring' && (
          <PageActiveMonitoring
            activeDowntimes={activeDowntimes}
            onOpenTimer={handleOpenActiveTimer}
            onStopCounting={handleStopCounting}
            onStartNewStoppage={() => setCurrentPage('select_machine')}
            onBackToHome={() => setCurrentPage('home')}
            availableOperators={operators}
            availableStoppageTypes={stoppageTypes}
            onUpdateActiveDowntime={handleUpdateActiveDowntime}
            onTransitionStage={handleTransitionStage}
          />
        )}

        {/* SCREEN 6: Registo Manual de Paragens Retroativas */}
        {currentPage === 'manual_entry' && (
          <PageManualEntry
            onSaveRecord={handleSaveManualRecord}
            onBack={() => setCurrentPage('home')}
            availableOperators={operators}
            availableStoppageTypes={stoppageTypes}
            availableTemplates={stoppageTemplates}
          />
        )}

        {/* Extra View: Histórico de Paragens */}
        {currentPage === 'history' && (
          <PageHistory
            records={records}
            onBackToHome={() => setCurrentPage('home')}
            onDeleteRecord={handleDeleteRecord}
            onUpdateRecord={handleUpdateRecord}
            onOpenManualEntry={() => setCurrentPage('manual_entry')}
            availableOperators={operators}
            availableStoppageTypes={stoppageTypes}
            availableTemplates={stoppageTemplates}
          />
        )}

        {/* Extra View: Dashboard & KPIs */}
        {currentPage === 'dashboard' && (
          <PageDashboard
            records={records}
            onBackToHome={() => setCurrentPage('home')}
          />
        )}

        {/* BACKEND MANAGEMENT VIEW: Gestão de Pessoal, Tipos de Avaria, Modelos e Importação CSV */}
        {currentPage === 'admin' && (
          <PageAdmin
            operators={operators}
            stoppageTypes={stoppageTypes}
            stoppageTemplates={stoppageTemplates}
            stoppageRecords={records}
            onAddOperator={handleAddOperator}
            onUpdateOperator={handleUpdateOperator}
            onDeleteOperator={handleDeleteOperator}
            onAddStoppageType={handleAddStoppageType}
            onUpdateStoppageType={handleUpdateStoppageType}
            onDeleteStoppageType={handleDeleteStoppageType}
            onAddStoppageTemplate={handleAddStoppageTemplate}
            onUpdateStoppageTemplate={handleUpdateStoppageTemplate}
            onDeleteStoppageTemplate={handleDeleteStoppageTemplate}
            onResetDefaults={handleResetDefaults}
            onBatchImportStoppages={handleBatchImportStoppages}
            onBackToHome={() => setCurrentPage('home')}
          />
        )}

      </main>

      {/* QR Code and Mobile Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        onMigrateLocal={handleMigrateLocal}
        totalCloudRecords={records.length}
      />
    </div>
  );
}
