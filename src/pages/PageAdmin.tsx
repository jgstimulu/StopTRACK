import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Users,
  AlertTriangle,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ShieldCheck,
  Wrench,
  CheckCircle2,
  RefreshCw,
  Server,
  Settings,
  FileSpreadsheet,
  Upload,
  Download,
  AlertCircle,
  Eye,
  EyeOff,
  FileCheck,
  Lock,
  Unlock,
  KeyRound,
  LogOut,
  ShieldAlert,
  HelpCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  Layers,
  Info,
  SlidersHorizontal,
  Database,
} from 'lucide-react';
import { HeaderLogo } from '../components/HeaderLogo';
import { Operator, StoppageTypeItem, StoppageRecord } from '../types/manutrack';
import { playIndustrialClick, playSuccessChime } from '../utils/audio';
import {
  parseCSVStoppagesWithMapping,
  CSVParseResult,
  TARGET_FIELDS,
  TargetFieldKey,
  DetectedColumn,
} from '../utils/csvParser';
import {
  apiAdminLogin,
  apiAdminVerify,
  apiAdminLogout,
  apiAdminChangeCredentials,
  getAdminToken,
} from '../services/api';

interface PageAdminProps {
  operators: Operator[];
  stoppageTypes: StoppageTypeItem[];
  stoppageRecords: StoppageRecord[];
  onAddOperator: (data: Omit<Operator, 'id' | 'active'>) => Promise<void>;
  onUpdateOperator: (id: string, data: Partial<Operator>) => Promise<void>;
  onDeleteOperator: (id: string) => Promise<void>;
  onAddStoppageType: (data: Omit<StoppageTypeItem, 'id' | 'active'>) => Promise<void>;
  onUpdateStoppageType: (id: string, data: Partial<StoppageTypeItem>) => Promise<void>;
  onDeleteStoppageType: (id: string) => Promise<void>;
  onResetDefaults: () => Promise<void>;
  onBatchImportStoppages: (
    records: StoppageRecord[],
    replaceExisting: boolean
  ) => Promise<{ importedCount: number; duplicatesSkipped: number; totalRecords: number }>;
  onBackToHome: () => void;
}

export const PageAdmin: React.FC<PageAdminProps> = ({
  operators,
  stoppageTypes,
  stoppageRecords,
  onAddOperator,
  onUpdateOperator,
  onDeleteOperator,
  onAddStoppageType,
  onUpdateStoppageType,
  onDeleteStoppageType,
  onResetDefaults,
  onBatchImportStoppages,
  onBackToHome,
}) => {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  // Login Form State
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [showLoginPassword, setShowLoginPassword] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Tabs: 'operators' | 'stoppage_types' | 'import_csv' | 'security'
  const [activeTab, setActiveTab] = useState<'operators' | 'stoppage_types' | 'import_csv' | 'security'>('operators');

  // Operator form state
  const [showOpForm, setShowOpForm] = useState(false);
  const [editingOpId, setEditingOpId] = useState<string | null>(null);
  const [opName, setOpName] = useState('');
  const [opRole, setOpRole] = useState('Operador');
  const [opCanStart, setOpCanStart] = useState(true);
  const [opCanClose, setOpCanClose] = useState(true);

  // Operator filter: 'all' | 'can_start' | 'can_close'
  const [opFilter, setOpFilter] = useState<'all' | 'can_start' | 'can_close'>('all');

  // Stoppage Type form state
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [typeName, setTypeName] = useState('');
  const [typeDescription, setTypeDescription] = useState('');
  const [typeColor, setTypeColor] = useState('rose');

  // CSV Import State
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvFileSize, setCsvFileSize] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [rawCsvText, setRawCsvText] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null);
  const [customMapping, setCustomMapping] = useState<Record<number, TargetFieldKey | 'ignore'>>({});
  const [showMappingTable, setShowMappingTable] = useState<boolean>(true);
  const [showFieldsReference, setShowFieldsReference] = useState<boolean>(false);
  const [copiedHeader, setCopiedHeader] = useState<boolean>(false);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Security & Credentials Form State
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmNewPw, setConfirmNewPw] = useState('');
  const [newEmailInput, setNewEmailInput] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);
  const [credSuccess, setCredSuccess] = useState<string | null>(null);

  // Reset defaults confirmation modal state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Feedback banner
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [formErrorMsg, setFormErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check auth session on mount
  useEffect(() => {
    let isMounted = true;
    const verify = async () => {
      try {
        const token = getAdminToken();
        if (!token) {
          if (isMounted) setIsAuthenticated(false);
          return;
        }
        const res = await apiAdminVerify();
        if (isMounted) {
          if (res.authenticated && res.user) {
            setIsAuthenticated(true);
            setLoginEmail(res.user.email);
          } else {
            setIsAuthenticated(false);
          }
        }
      } catch {
        if (isMounted) setIsAuthenticated(false);
      } finally {
        if (isMounted) setIsCheckingAuth(false);
      }
    };

    verify();
    return () => {
      isMounted = false;
    };
  }, []);

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Login handler
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('Por favor preencha o email e a palavra-passe.');
      return;
    }

    setIsLoggingIn(true);
    playIndustrialClick();
    try {
      const res = await apiAdminLogin(loginEmail, loginPassword);
      setIsAuthenticated(true);
      setLoginPassword('');
      playSuccessChime();
      showFeedback('Sessão de Administrador iniciada com sucesso!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Credenciais inválidas.';
      setLoginError(msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    playIndustrialClick();
    await apiAdminLogout();
    setIsAuthenticated(false);
    setLoginPassword('');
    showFeedback('Sessão terminada. Acesso ao backend bloqueado.');
  };

  // Submit Operator Form
  const handleOperatorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opName.trim()) return;

    setFormErrorMsg(null);
    setIsSubmitting(true);
    try {
      if (editingOpId) {
        await onUpdateOperator(editingOpId, {
          name: opName.trim(),
          role: opRole.trim(),
          canStart: opCanStart,
          canClose: opCanClose,
        });
        showFeedback('Operador atualizado com sucesso!');
      } else {
        await onAddOperator({
          name: opName.trim(),
          role: opRole.trim(),
          canStart: opCanStart,
          canClose: opCanClose,
        });
        showFeedback('Novo operador adicionado à lista autorizada!');
      }
      playSuccessChime();
      resetOpForm();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao guardar operador.';
      setFormErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditOperator = (op: Operator) => {
    playIndustrialClick();
    setEditingOpId(op.id);
    setOpName(op.name);
    setOpRole(op.role);
    setOpCanStart(op.canStart);
    setOpCanClose(op.canClose);
    setShowOpForm(true);
  };

  const resetOpForm = () => {
    setEditingOpId(null);
    setOpName('');
    setOpRole('Operador');
    setOpCanStart(true);
    setOpCanClose(true);
    setShowOpForm(false);
    setFormErrorMsg(null);
  };

  // Submit Stoppage Type Form
  const handleTypeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeName.trim()) return;

    setFormErrorMsg(null);
    setIsSubmitting(true);
    try {
      if (editingTypeId) {
        await onUpdateStoppageType(editingTypeId, {
          name: typeName.trim(),
          description: typeDescription.trim(),
          color: typeColor,
        });
        showFeedback('Tipo de avaria atualizado com sucesso!');
      } else {
        await onAddStoppageType({
          name: typeName.trim(),
          description: typeDescription.trim(),
          color: typeColor,
        });
        showFeedback('Novo tipo de avaria adicionado com sucesso!');
      }
      playSuccessChime();
      resetTypeForm();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao guardar tipo de avaria.';
      setFormErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditType = (st: StoppageTypeItem) => {
    playIndustrialClick();
    setEditingTypeId(st.id);
    setTypeName(st.name);
    setTypeDescription(st.description);
    setTypeColor(st.color);
    setShowTypeForm(true);
  };

  const resetTypeForm = () => {
    setEditingTypeId(null);
    setTypeName('');
    setTypeDescription('');
    setTypeColor('rose');
    setShowTypeForm(false);
    setFormErrorMsg(null);
  };

  // CSV File Processing Core
  const processCsvFile = (file: File) => {
    setCsvFileName(file.name);
    const sizeInKb = Math.round((file.size / 1024) * 10) / 10;
    setCsvFileSize(`${sizeInKb} KB`);
    setImportSummary(null);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setRawCsvText(text);
      const parsed = parseCSVStoppagesWithMapping(text);
      setParseResult(parsed);

      // Preenche o mapa inicial com o que foi detetado
      const initialMap: Record<number, TargetFieldKey | 'ignore'> = {};
      parsed.detectedColumns.forEach((c) => {
        initialMap[c.index] = c.mappedTo;
      });
      setCustomMapping(initialMap);

      playSuccessChime();
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processCsvFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processCsvFile(file);
    }
  };

  const handleClearFile = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    playIndustrialClick();
    setCsvFileName(null);
    setCsvFileSize(null);
    setRawCsvText(null);
    setParseResult(null);
    setCustomMapping({});
    setImportSummary(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Re-map a specific CSV column to a target field or to 'ignore'
  const handleMappingChange = (colIndex: number, newTarget: TargetFieldKey | 'ignore') => {
    if (!rawCsvText) return;
    playIndustrialClick();

    const updatedMap: Record<number, TargetFieldKey | 'ignore'> = {
      ...customMapping,
      [colIndex]: newTarget,
    };
    setCustomMapping(updatedMap);

    const updatedResult = parseCSVStoppagesWithMapping(rawCsvText, updatedMap);
    setParseResult(updatedResult);
  };

  // Reset mappings back to auto-detected defaults
  const handleResetAutoMapping = () => {
    if (!rawCsvText) return;
    playIndustrialClick();

    const freshResult = parseCSVStoppagesWithMapping(rawCsvText);
    const initialMap: Record<number, TargetFieldKey | 'ignore'> = {};
    freshResult.detectedColumns.forEach((c) => {
      initialMap[c.index] = c.mappedTo;
    });
    setCustomMapping(initialMap);
    setParseResult(freshResult);
    showFeedback('Mapeamento reposto para a deteção automática.');
  };

  // Copy standard header to clipboard
  const handleCopyHeader = () => {
    const standardHeader =
      'Máquina;Data;Hora Início;Hora Fim;Duração;Quem Iniciou;Quem Fechou;Tipo de Paragem;Descrição da Paragem;O que foi feito;Outras Observações';

    navigator.clipboard
      .writeText(standardHeader)
      .then(() => {
        playIndustrialClick();
        setCopiedHeader(true);
        setTimeout(() => setCopiedHeader(false), 2500);
        showFeedback('Cabeçalho padrão copiado para a área de transferência!');
      })
      .catch(() => {
        showFeedback('Por favor copie o cabeçalho manualmente a partir da tabela.');
      });
  };

  // Download complete reference guide as text/markdown
  const handleDownloadFieldGuide = () => {
    playIndustrialClick();
    const activeOpNames = operators.map((o) => `${o.name} (${o.role})`).join('\n  - ');
    const activeTypes = stoppageTypes.map((t) => `${t.name}: ${t.description || 'Sem descrição'}`).join('\n  - ');

    const guideContent = [
      '====================================================================',
      'STOPTRACK - GUIA DE CAMPOS & DICIONÁRIO DA BASE DE DADOS CENTRAL',
      '====================================================================',
      '',
      '1. CABEÇALHO RECOMENDADO (Separado por ponto e vírgula):',
      'Máquina;Data;Hora Início;Hora Fim;Duração;Quem Iniciou;Quem Fechou;Tipo de Paragem;Descrição da Paragem;O que foi feito;Outras Observações',
      '',
      '2. DICIONÁRIO DOS 11 CAMPOS OFICIAIS:',
      ...TARGET_FIELDS.map(
        (f) =>
          `* ${f.label.toUpperCase()} (${f.key}):\n  - Obrigatório: ${f.required ? 'SIM' : 'NÃO (Preenchido com padrão se omitido)'}\n  - Exemplo: ${f.example}\n  - Sinónimos aceites automaticamente: ${f.synonyms.join(', ')}\n`
      ),
      '',
      '3. OPERADORES ATIVOS NA BASE CENTRAL:',
      `  - ${activeOpNames}`,
      '',
      '4. TIPOS DE AVARIA EM VIGOR NA BASE CENTRAL:',
      `  - ${activeTypes}`,
      '',
      '5. MÁQUINAS DISPONÍVEIS NA FÁBRICA:',
      '  - Intervalo oficial: F01 a F30',
      '',
      '6. TRATAMENTO DE COLUNAS EXCEDENTES:',
      '  - Qualquer coluna no seu CSV que não corresponda a estes campos será ignorada com segurança e não provocará erro.',
      '====================================================================',
    ].join('\n');

    const blob = new Blob(['\uFEFF' + guideContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'guia_campos_stoptrack.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Confirm CSV Batch Upload
  const handleExecuteImport = async () => {
    if (!parseResult || parseResult.records.length === 0) return;

    setIsImporting(true);
    setImportError(null);
    try {
      const res = await onBatchImportStoppages(parseResult.records, replaceExisting);
      playSuccessChime();
      setImportSummary(
        `Importação concluída com sucesso! ${res.importedCount} registos inseridos (${res.duplicatesSkipped} duplicados ignorados). Total atual na base de dados: ${res.totalRecords}.`
      );
      showFeedback('Registos históricos carregados para a base central!');
      setParseResult(null);
      setCsvFileName(null);
      setRawCsvText(null);
      setCustomMapping({});
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro durante a importação para a base central.';
      setImportError(msg);
    } finally {
      setIsImporting(false);
    }
  };

  // Download Example CSV Template
  const handleDownloadTemplate = () => {
    playIndustrialClick();
    const templateContent =
      '\uFEFF' +
      [
        'Máquina;Data;Hora Início;Hora Fim;Duração;Quem Iniciou;Quem Fechou;Tipo de Paragem;Descrição da Paragem;O que foi feito;Outras Observações',
        'F04;18/10/2026;09:15:00;09:42:00;00:27:00;Carlos Silva;Miguel Santos;Avaria Mecânica;Correia transportadora partida;Substituição de correia trapezoidal B52;Ajuste de tensão efetuado',
        'F12;18/10/2026;14:20:00;14:35:00;00:15:00;Ana Costa;Rui Pereira;Avaria Elétrica;Fotocélula de presença suja;Limpeza ótica e calibração;Sinal estável',
        'F21;19/10/2026;11:00:00;11:45:00;00:45:00;João Ferreira;António Ribeiro;Setup / Mudança de Formato;Troca de ferramental 250ml para 500ml;Substituição de guias e bicos de enchimento;Teste de arranque com lote piloto aprovado',
      ].join('\n');

    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo_importacao_stoptrack.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Full Cloud Database Backup
  const handleDownloadFullBackup = () => {
    playIndustrialClick();
    const headers = [
      'ID',
      'Máquina',
      'Data',
      'Hora Início',
      'Hora Fim',
      'Duração',
      'Duração (Min)',
      'Quem Iniciou',
      'Quem Fechou',
      'Tipo de Paragem',
      'Descrição',
      'Ação Realizada',
      'Observações',
    ];

    const rows = stoppageRecords.map((r) => [
      `"${r.id}"`,
      `"${r.machineId}"`,
      `"${r.date}"`,
      `"${r.startTime}"`,
      `"${r.endTime}"`,
      `"${r.durationFormatted}"`,
      Math.round(r.durationMs / 60000),
      `"${r.initiatedBy.replace(/"/g, '""')}"`,
      `"${r.closedBy.replace(/"/g, '""')}"`,
      `"${r.stoppageType}"`,
      `"${r.stoppageDescription.replace(/"/g, '""')}"`,
      `"${r.actionsTaken.replace(/"/g, '""')}"`,
      `"${(r.otherObservations || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_completo_stoptrack_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Security Form Submit (Change password / email)
  const handleSecuritySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredError(null);
    setCredSuccess(null);

    if (!currentPw) {
      setCredError('É necessário introduzir a palavra-passe atual.');
      return;
    }

    if (newPw && newPw.length < 4) {
      setCredError('A nova palavra-passe deve conter pelo menos 4 caracteres.');
      return;
    }

    if (newPw && newPw !== confirmNewPw) {
      setCredError('A nova palavra-passe e a confirmação não coincidem.');
      return;
    }

    if (newEmailInput && !newEmailInput.includes('@')) {
      setCredError('Por favor introduza um endereço de email válido.');
      return;
    }

    setIsUpdatingCredentials(true);
    playIndustrialClick();
    try {
      const res = await apiAdminChangeCredentials(
        currentPw,
        newPw ? newPw : undefined,
        newEmailInput ? newEmailInput : undefined
      );

      if (res.email) {
        setLoginEmail(res.email);
      }
      playSuccessChime();
      setCredSuccess('Credenciais de administrador atualizadas com sucesso!');
      setCurrentPw('');
      setNewPw('');
      setConfirmNewPw('');
      setNewEmailInput('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar credenciais.';
      setCredError(msg);
    } finally {
      setIsUpdatingCredentials(false);
    }
  };

  // Execute reset defaults
  const handleConfirmReset = async () => {
    setIsResetting(true);
    try {
      await onResetDefaults();
      playSuccessChime();
      showFeedback('Configurações originais de fábrica restauradas com sucesso!');
      setShowResetConfirm(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao restaurar padrões.';
      showFeedback(`Falha: ${msg}`);
    } finally {
      setIsResetting(false);
    }
  };

  // Filtered operators
  const filteredOperators = operators.filter((op) => {
    if (opFilter === 'can_start') return op.canStart;
    if (opFilter === 'can_close') return op.canClose;
    return true;
  });

  // Color options for Stoppage Types
  const colorOptions = [
    { id: 'rose', label: 'Vermelho / Rosa', bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500' },
    { id: 'amber', label: 'Âmbar / Amarelo', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500' },
    { id: 'sky', label: 'Azul Celeste', bg: 'bg-sky-500/20', text: 'text-sky-400', border: 'border-sky-500' },
    { id: 'orange', label: 'Laranja', bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500' },
    { id: 'indigo', label: 'Índigo / Roxo', bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500' },
    { id: 'emerald', label: 'Verde Esmeralda', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500' },
    { id: 'blue', label: 'Azul Marinho', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500' },
    { id: 'purple', label: 'Púrpura', bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500' },
    { id: 'slate', label: 'Cinza Neutro', bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500' },
  ];

  // 1. Loading State
  if (isCheckingAuth) {
    return (
      <div className="flex min-h-[92vh] flex-col items-center justify-center p-6 text-center">
        <HeaderLogo subtitle="Backend StopTRACK" />
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
          <p className="text-xs font-mono text-slate-300">A verificar autorização de segurança...</p>
        </div>
      </div>
    );
  }

  // 2. RESTRICTED LOGIN SCREEN (When not authenticated)
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[92vh] flex-col justify-between py-5 px-3.5 sm:px-6">
        <div>
          <HeaderLogo subtitle="Área de Acesso Restrito" />

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                playIndustrialClick();
                onBackToHome();
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Voltar ao Menu Principal</span>
            </button>

            <div className="flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-400 border border-rose-500/30">
              <Lock className="h-3 w-3" />
              <span>Protegido</span>
            </div>
          </div>
        </div>

        {/* Login Card */}
        <div className="my-auto py-6">
          <div className="mx-auto max-w-sm rounded-2xl border border-amber-500/30 bg-slate-900/95 p-5 sm:p-6 shadow-2xl backdrop-blur">
            {/* Lock Icon Header */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-400 shadow-inner mb-3">
                <Lock className="h-7 w-7" />
              </div>
              <h2 className="text-lg font-black uppercase tracking-wider text-white font-mono">
                Acesso Restrito ao Backend
              </h2>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Apenas utilizadores autorizados podem alterar operadores, tipos de paragem e importar registos históricos.
              </p>
            </div>

            {/* Error Message */}
            {loginError && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-950/80 p-3 text-xs text-rose-200 shadow-md">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <p className="leading-snug">{loginError}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLoginSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Email ou Utilizador
                </label>
                <input
                  type="text"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Introduza admin"
                  autoComplete="username"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Palavra-passe de Administrador
                </label>
                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Introduza a sua palavra-passe"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 pr-10 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isLoggingIn ? 'A verificar credenciais...' : 'Entrar no Backend'}
              </button>
            </form>
          </div>
        </div>

        {/* Bottom Back Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              onBackToHome();
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-200 hover:bg-slate-700 active:scale-[0.98] transition-colors"
          >
            Voltar à Aplicação
          </button>
        </div>
      </div>
    );
  }

  // 3. AUTHENTICATED BACKEND MANAGEMENT VIEW
  return (
    <div className="flex min-h-[92vh] flex-col justify-between py-5 px-3.5 sm:px-6">
      {/* Top Header */}
      <div>
        <HeaderLogo subtitle="Backend e Configurações de Fábrica" />

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

          {/* Authenticated user status & Logout */}
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-[11px] text-emerald-300 font-mono"
              title="Sessão de administrador ativa"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>Administrador</span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-950/40 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-900/50 hover:text-rose-200 transition-colors"
              title="Terminar sessão de administrador"
            >
              <LogOut className="h-3 w-3" />
              <span>Sair</span>
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedbackMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/80 p-2.5 text-xs text-emerald-200 shadow-md">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Form Error Banner */}
        {formErrorMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/80 p-2.5 text-xs text-rose-200 shadow-md">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{formErrorMsg}</span>
          </div>
        )}

        {/* 4 Tabs: Pessoal, Tipos de Avaria, Importar CSV e Segurança */}
        <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-slate-900/90 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              setActiveTab('operators');
            }}
            className={`flex items-center justify-center gap-1 rounded-lg py-2 px-1 text-[10px] sm:text-xs font-bold transition-all ${
              activeTab === 'operators'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="h-3 w-3 shrink-0" />
            <span className="truncate">Pessoal ({operators.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              setActiveTab('stoppage_types');
            }}
            className={`flex items-center justify-center gap-1 rounded-lg py-2 px-1 text-[10px] sm:text-xs font-bold transition-all ${
              activeTab === 'stoppage_types'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wrench className="h-3 w-3 shrink-0" />
            <span className="truncate">Avarias ({stoppageTypes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              setActiveTab('import_csv');
            }}
            className={`flex items-center justify-center gap-1 rounded-lg py-2 px-1 text-[10px] sm:text-xs font-bold transition-all ${
              activeTab === 'import_csv'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="h-3 w-3 shrink-0" />
            <span className="truncate">Importar CSV</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              setActiveTab('security');
            }}
            className={`flex items-center justify-center gap-1 rounded-lg py-2 px-1 text-[10px] sm:text-xs font-bold transition-all ${
              activeTab === 'security'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="h-3 w-3 shrink-0" />
            <span className="truncate">Segurança</span>
          </button>
        </div>
      </div>

      {/* TAB 1: GESTÃO DE OPERADORES & PERMISSÕES */}
      {activeTab === 'operators' && (
        <div className="my-4 flex-1 space-y-3">
          {/* Top Bar for Operators */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setOpFilter('all')}
                className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                  opFilter === 'all'
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-850 text-slate-400 hover:text-white'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setOpFilter('can_start')}
                className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                  opFilter === 'can_start'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-850 text-slate-400 hover:text-white'
                }`}
              >
                Podem Iniciar
              </button>
              <button
                type="button"
                onClick={() => setOpFilter('can_close')}
                className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                  opFilter === 'can_close'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-850 text-slate-400 hover:text-white'
                }`}
              >
                Podem Fechar
              </button>
            </div>

            {!showOpForm && (
              <button
                type="button"
                onClick={() => {
                  playIndustrialClick();
                  resetOpForm();
                  setShowOpForm(true);
                }}
                className="flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Novo Operador</span>
              </button>
            )}
          </div>

          {/* Add / Edit Operator Form Modal/Card */}
          {showOpForm && (
            <div className="rounded-2xl border border-amber-500/40 bg-slate-900 p-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300 font-mono">
                  {editingOpId ? 'Editar Operador' : 'Adicionar Novo Operador'}
                </span>
                <button
                  type="button"
                  onClick={resetOpForm}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleOperatorSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Nome Completo / Crachá
                  </label>
                  <input
                    type="text"
                    value={opName}
                    onChange={(e) => setOpName(e.target.value)}
                    placeholder="Ex: Carlos Silva"
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Função / Cargo
                  </label>
                  <input
                    type="text"
                    value={opRole}
                    onChange={(e) => setOpRole(e.target.value)}
                    placeholder="Ex: Operador de Linha, Técnico Mecânico, Chefe de Turno"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {/* Permissions checkboxes */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Permissões de Registo no Telemóvel:
                  </span>

                  <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={opCanStart}
                      onChange={(e) => setOpCanStart(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <span>Pode Iniciar Paragens (visível no seletor da Página 2)</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={opCanClose}
                      onChange={(e) => setOpCanClose(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Pode Fechar Paragens (visível no fecho da Página 4)</span>
                  </label>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 active:scale-[0.98] transition-all"
                  >
                    {isSubmitting
                      ? 'A guardar...'
                      : editingOpId
                      ? 'Atualizar Operador'
                      : 'Adicionar Operador'}
                  </button>
                  <button
                    type="button"
                    onClick={resetOpForm}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Operators List */}
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {filteredOperators.map((op) => (
              <div
                key={op.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-white">{op.name}</p>
                    {!op.active && (
                      <span className="rounded bg-slate-800 px-1 text-[9px] text-slate-400">
                        Inativo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">{op.role}</p>

                  <div className="mt-1 flex items-center gap-1.5">
                    {op.canStart ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 border border-amber-500/30">
                        <Check className="h-2.5 w-2.5" /> Inicia
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-500">
                        <X className="h-2.5 w-2.5" /> Não Inicia
                      </span>
                    )}

                    {op.canClose ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 border border-emerald-500/30">
                        <Check className="h-2.5 w-2.5" /> Fecha
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-500">
                        <X className="h-2.5 w-2.5" /> Não Fecha
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEditOperator(op)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-amber-400 transition-colors"
                    title="Editar operador"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      playIndustrialClick();
                      await onDeleteOperator(op.id);
                      showFeedback(`Operador ${op.name} removido da lista.`);
                    }}
                    className="rounded-lg p-2 text-slate-400 hover:bg-rose-950 hover:text-rose-400 transition-colors"
                    title="Remover operador"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {filteredOperators.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
                {operators.length === 0 ? (
                  <div className="space-y-2">
                    <p className="font-bold text-slate-300">Nenhum operador registado</p>
                    <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                      A aplicação está pronta a começar do zero. Clique no botão &quot;Novo Operador&quot; acima para registar a equipa oficial da fábrica.
                    </p>
                  </div>
                ) : (
                  'Nenhum operador encontrado com este filtro.'
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: GESTÃO DE TIPOS DE AVARIA */}
      {activeTab === 'stoppage_types' && (
        <div className="my-4 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Categorias disponíveis para classificação de paragens na fábrica:
            </span>

            {!showTypeForm && (
              <button
                type="button"
                onClick={() => {
                  playIndustrialClick();
                  resetTypeForm();
                  setShowTypeForm(true);
                }}
                className="flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nova Categoria</span>
              </button>
            )}
          </div>

          {/* Add / Edit Stoppage Type Form */}
          {showTypeForm && (
            <div className="rounded-2xl border border-amber-500/40 bg-slate-900 p-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300 font-mono">
                  {editingTypeId ? 'Editar Tipo de Avaria' : 'Adicionar Novo Tipo de Avaria'}
                </span>
                <button
                  type="button"
                  onClick={resetTypeForm}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleTypeSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Designação da Avaria / Motivo de Paragem
                  </label>
                  <input
                    type="text"
                    value={typeName}
                    onChange={(e) => setTypeName(e.target.value)}
                    placeholder="Ex: Avaria Mecânica, Falha Elétrica, Setup..."
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Descrição ou Exemplos de Casos
                  </label>
                  <input
                    type="text"
                    value={typeDescription}
                    onChange={(e) => setTypeDescription(e.target.value)}
                    placeholder="Ex: Motores, correias, engrenagens, rolamentos danificados..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Cor do Crachá / Indicador
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {colorOptions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setTypeColor(c.id)}
                        className={`flex items-center gap-1.5 rounded-lg border p-1.5 text-[10px] font-semibold transition-all ${
                          typeColor === c.id
                            ? `${c.border} ${c.bg} ${c.text} ring-1 ring-amber-400`
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${c.bg} border ${c.border}`} />
                        <span className="truncate">{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 active:scale-[0.98] transition-all"
                  >
                    {isSubmitting
                      ? 'A guardar...'
                      : editingTypeId
                      ? 'Atualizar Tipo de Avaria'
                      : 'Adicionar Categoria'}
                  </button>
                  <button
                    type="button"
                    onClick={resetTypeForm}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Stoppage Types List */}
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {stoppageTypes.map((st) => (
              <div
                key={st.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    <p className="text-xs font-bold text-white">{st.name}</p>
                  </div>
                  {st.description && (
                    <p className="text-[11px] text-slate-400 mt-0.5">{st.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEditType(st)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-amber-400 transition-colors"
                    title="Editar tipo"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      playIndustrialClick();
                      await onDeleteStoppageType(st.id);
                      showFeedback(`Tipo de avaria "${st.name}" removido.`);
                    }}
                    className="rounded-lg p-2 text-slate-400 hover:bg-rose-950 hover:text-rose-400 transition-colors"
                    title="Remover tipo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: IMPORTAÇÃO CSV DE DADOS DA VERSÃO ANTERIOR */}
      {activeTab === 'import_csv' && (
        <div className="my-4 flex-1 space-y-4">
          {/* Visual Step Pipeline Banner */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3">
            <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
              <div className="flex flex-col items-center">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-slate-950 font-bold text-xs mb-1 font-mono">
                  1
                </span>
                <span className="font-bold text-amber-300">Preparação</span>
                <span className="text-[10px] text-slate-400 hidden sm:inline">Modelo & Regras</span>
              </div>
              <div className="flex flex-col items-center">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full font-bold text-xs mb-1 font-mono ${
                  csvFileName ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  2
                </span>
                <span className={`font-bold ${csvFileName ? 'text-amber-300' : 'text-slate-400'}`}>Ficheiro</span>
                <span className="text-[10px] text-slate-500 hidden sm:inline">Carregamento CSV</span>
              </div>
              <div className="flex flex-col items-center">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full font-bold text-xs mb-1 font-mono ${
                  parseResult ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  3
                </span>
                <span className={`font-bold ${parseResult ? 'text-amber-300' : 'text-slate-400'}`}>Mapeamento</span>
                <span className="text-[10px] text-slate-500 hidden sm:inline">Validação Colunas</span>
              </div>
              <div className="flex flex-col items-center">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full font-bold text-xs mb-1 font-mono ${
                  parseResult && parseResult.records.length > 0 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  4
                </span>
                <span className={`font-bold ${parseResult && parseResult.records.length > 0 ? 'text-emerald-300' : 'text-slate-400'}`}>Gravação</span>
                <span className="text-[10px] text-slate-500 hidden sm:inline">Nuvem Central</span>
              </div>
            </div>
          </div>

          {/* Top Info & Quick Actions Bar */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3.5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-300 font-mono">
                    Migração de Dados Anteriores & Carga CSV
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Importe os registos de paragem mantidos em folhas de cálculo ou no browser anterior. O sistema associa os campos semelhantes e ignora colunas adicionais sem erros.
                </p>
              </div>

              {/* Utility Tools */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-700 transition-colors shadow-sm"
                  title="Descarregar ficheiro CSV modelo pré-formatado"
                >
                  <Download className="h-3.5 w-3.5 text-amber-400" />
                  <span>Modelo CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyHeader}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-900/50 transition-colors shadow-sm"
                  title="Copiar cabeçalho oficial para colar na sua folha de cálculo"
                >
                  {copiedHeader ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  <span>{copiedHeader ? 'Copiado!' : 'Copiar Cabeçalho'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadFullBackup}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/50 transition-colors shadow-sm"
                  title="Exportar cópia de segurança completa de todas as paragens atualmente na base de dados"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Backup Atual ({stoppageRecords.length})</span>
                </button>
              </div>
            </div>

            {/* Dictionary Accordion Toggle */}
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[11px] text-slate-400">
                Tem dúvidas sobre os nomes das colunas da versão anterior?
              </span>
              <button
                type="button"
                onClick={() => {
                  playIndustrialClick();
                  setShowFieldsReference(!showFieldsReference);
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 transition-colors shrink-0"
              >
                <Info className="h-3.5 w-3.5" />
                <span>{showFieldsReference ? 'Ocultar Dicionário de Campos' : 'Ver Dicionário de Campos & Regras'}</span>
                {showFieldsReference ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Collapsible Reference Panel: Database Dictionary & Active Records */}
          {showFieldsReference && (
            <div className="rounded-2xl border border-amber-500/30 bg-slate-950/90 p-4 space-y-4 shadow-xl backdrop-blur">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
                      Dicionário Oficial de Campos & Dados Atuais na Base
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      Consulte aqui para alinhar previamente o ficheiro CSV caso deseje fazer uma limpeza antes de carregar.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadFieldGuide}
                  className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-slate-800 transition-colors shrink-0"
                >
                  <Download className="h-3 w-3" />
                  <span>Descarregar Guia (.TXT)</span>
                </button>
              </div>

              {/* Master Data Snapshot in Current Database */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Active Operators in DB */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">
                      Operadores na Base ({operators.length})
                    </span>
                    <Users className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className="max-h-24 overflow-y-auto text-[11px] text-slate-300 space-y-0.5 pr-1 font-mono">
                    {operators.length === 0 ? (
                      <span className="text-slate-500 italic text-[10px]">Sem operadores registados</span>
                    ) : (
                      operators.map((op) => (
                        <div key={op.id} className="truncate">
                          • {op.name} <span className="text-[9px] text-slate-500 font-sans">({op.role})</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Active Stoppage Categories in DB */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">
                      Tipos de Avaria ({stoppageTypes.length})
                    </span>
                    <AlertTriangle className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className="max-h-24 overflow-y-auto text-[11px] text-slate-300 space-y-0.5 pr-1 font-mono">
                    {stoppageTypes.map((st) => (
                      <div key={st.id} className="truncate" title={st.description}>
                        • {st.name}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Machines Range */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">
                      Postos / Máquinas
                    </span>
                    <Wrench className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Intervalo oficial da fábrica: <strong className="text-amber-300 font-mono">F01 a F30</strong>.
                  </p>
                  <p className="text-[10px] text-slate-400">
                    O sistema converte automaticamente números simples (ex.: 4) para formato <strong className="text-slate-200 font-mono">F04</strong>.
                  </p>
                </div>
              </div>

              {/* Fields Table Reference */}
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="p-2">Campo Oficial</th>
                      <th className="p-2">Obrigatório</th>
                      <th className="p-2">Exemplo</th>
                      <th className="p-2">Sinónimos Aceites Automaticamente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-950/50 text-slate-300 font-sans">
                    {TARGET_FIELDS.map((f) => (
                      <tr key={f.key} className="hover:bg-slate-900/40">
                        <td className="p-2 font-bold font-mono text-amber-300">
                          {f.label}
                        </td>
                        <td className="p-2 font-mono text-[10px]">
                          {f.required ? (
                            <span className="text-rose-400 font-bold">Sim</span>
                          ) : (
                            <span className="text-slate-500">Opcional</span>
                          )}
                        </td>
                        <td className="p-2 font-mono text-slate-400 text-[10px]">
                          {f.example}
                        </td>
                        <td className="p-2 text-slate-400 text-[10px]">
                          {f.synonyms.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Note on Excedent Columns */}
              <div className="rounded-xl border border-sky-500/30 bg-sky-950/30 p-2.5 text-[11px] text-sky-200 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Tratamento de Colunas Excedentes:</strong> Se o seu ficheiro antigo tiver colunas como "Turno", "Custo", "ID Antigo" ou notas internas que não correspondam aos campos acima, o sistema irá marcá-las como <em>Ignoradas</em> e importar normalmente todas as linhas válidas sem quebrar ou gerar erros.
                </p>
              </div>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Upload Dropzone with Active Drag State and File Info Preview */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? 'border-amber-400 bg-amber-950/30 scale-[1.01] ring-2 ring-amber-400/30'
                : csvFileName
                ? 'border-emerald-500/50 bg-slate-900/90 hover:border-emerald-400'
                : 'border-slate-700 bg-slate-900/60 hover:border-amber-500 hover:bg-slate-900'
            }`}
          >
            {csvFileName ? (
              <div className="flex flex-col sm:flex-row items-center justify-between w-full max-w-lg gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
                    <FileCheck className="h-6 w-6" />
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-bold text-white block truncate max-w-xs sm:max-w-sm">
                      {csvFileName}
                    </span>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 font-mono">
                      <span>{csvFileSize}</span>
                      <span>·</span>
                      <span className="text-emerald-400 font-semibold">Ficheiro Carregado</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:text-white hover:bg-slate-700"
                  >
                    Substituir
                  </button>
                  <button
                    type="button"
                    onClick={handleClearFile}
                    className="rounded-lg border border-rose-950 bg-rose-950/40 p-1.5 text-rose-400 hover:bg-rose-900/50 hover:text-rose-200"
                    title="Remover ficheiro"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 mb-2">
                  <Upload className="h-6 w-6" />
                </div>
                <span className="text-xs font-bold text-white">
                  Arraste e largue o seu ficheiro CSV aqui ou clique para selecionar
                </span>
                <span className="text-[11px] text-slate-400 mt-1 max-w-md">
                  Compatível com separadores <code className="text-amber-400">;</code> (Excel Europeu), <code className="text-amber-400">,</code> e <code className="text-amber-400">TAB</code>
                </span>
              </>
            )}
          </div>

          {/* Import Summary Result Message */}
          {importSummary && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/80 p-3.5 text-xs text-emerald-200 flex items-start gap-2.5 shadow-md">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-emerald-300 font-bold block mb-0.5">Importação Concluída:</strong>
                <p className="leading-relaxed">{importSummary}</p>
              </div>
            </div>
          )}

          {/* Import Error Message */}
          {importError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/80 p-3.5 text-xs text-rose-200 flex items-start gap-2.5 shadow-md">
              <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-rose-300 font-bold block mb-0.5">Erro na Importação:</strong>
                <p className="leading-relaxed">{importError}</p>
              </div>
            </div>
          )}

          {/* CSV Analysis Preview & Interactive Column Mapper */}
          {parseResult && (
            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider font-mono">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>Análise de Conteúdo & Mapeamento de Colunas</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetAutoMapping}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white transition-colors"
                    title="Restaurar associações automáticas"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Repor Auto-Deteção</span>
                  </button>
                </div>
              </div>

              {/* 4 Stat Indicators */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                <div className="rounded-xl bg-slate-950/70 p-3 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Linhas Válidas</span>
                  <p className="text-lg font-black text-white font-mono mt-0.5">{parseResult.validRows}</p>
                  <span className="text-[10px] text-slate-500">Paragens prontas</span>
                </div>
                <div className="rounded-xl bg-slate-950/70 p-3 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Tempo Acumulado</span>
                  <p className="text-lg font-black text-rose-400 font-mono mt-0.5">
                    {Math.round(parseResult.totalDurationMs / 60000)}m
                  </p>
                  <span className="text-[10px] text-slate-500">Minutos parados</span>
                </div>
                <div className="rounded-xl bg-slate-950/70 p-3 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Colunas Mapeadas</span>
                  <p className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                    {parseResult.mappedCount} / {parseResult.detectedColumns.length}
                  </p>
                  <span className="text-[10px] text-emerald-500/80">Campos StopTRACK</span>
                </div>
                <div className="rounded-xl bg-slate-950/70 p-3 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Excedentes</span>
                  <p className="text-lg font-black text-sky-400 font-mono mt-0.5">
                    {parseResult.ignoredCount}
                  </p>
                  <span className="text-[10px] text-sky-500/80">Ignoradas com segurança</span>
                </div>
              </div>

              {/* Detected Machines Tag List */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2.5 text-[11px] flex items-center justify-between gap-2">
                <span className="text-slate-400 shrink-0">Máquinas identificadas:</span>
                <div className="flex flex-wrap gap-1 font-mono">
                  {parseResult.machinesFound.length > 0 ? (
                    parseResult.machinesFound.map((m) => (
                      <span key={m} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                        {m}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 italic text-[10px]">Nenhuma identificada</span>
                  )}
                </div>
              </div>

              {/* INTERACTIVE COLUMN MAPPER GRID */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                      Grelha de Correspondência de Colunas
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Pode alterar livremente qualquer atribuição para adequar ficheiros de outros sistemas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMappingTable(!showMappingTable)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300"
                  >
                    <span>{showMappingTable ? 'Recolher Grelha' : 'Expandir Grelha'}</span>
                    {showMappingTable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {showMappingTable && (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-[11px] text-left text-slate-300">
                      <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px]">
                        <tr>
                          <th className="p-2.5">Coluna no Seu Ficheiro</th>
                          <th className="p-2.5">Amostra do Primeiro Registo</th>
                          <th className="p-2.5">Atribuição StopTRACK</th>
                          <th className="p-2.5">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 bg-slate-950/60 font-sans">
                        {parseResult.detectedColumns.map((col) => {
                          const isIgnored = col.mappedTo === 'ignore';
                          return (
                            <tr key={col.index} className="hover:bg-slate-900/50">
                              <td className="p-2.5 font-mono font-semibold text-white">
                                {col.rawName}
                              </td>
                              <td className="p-2.5 font-mono text-[10px] text-slate-400 max-w-[160px] truncate">
                                {col.sampleValue || '—'}
                              </td>
                              <td className="p-2.5">
                                <select
                                  value={col.mappedTo}
                                  onChange={(e) =>
                                    handleMappingChange(
                                      col.index,
                                      e.target.value as TargetFieldKey | 'ignore'
                                    )
                                  }
                                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-1 ${
                                    isIgnored
                                      ? 'border-slate-800 bg-slate-950 text-slate-400'
                                      : 'border-amber-500/50 bg-slate-950 text-amber-300 focus:border-amber-500'
                                  }`}
                                >
                                  <option value="ignore">⚪ Ignorar Coluna (Excedente)</option>
                                  {TARGET_FIELDS.map((tf) => (
                                    <option key={tf.key} value={tf.key}>
                                      {tf.required ? '🟡 ' : '🔹 '}
                                      {tf.label} {tf.required ? '(Obrigatório)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-2.5 font-mono text-[10px]">
                                {isIgnored ? (
                                  <span className="text-slate-500 italic">Ignorada com segurança</span>
                                ) : (
                                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                    <Check className="h-3 w-3" />
                                    Mapeada
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Sample preview table (first 5 rows) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                    Pré-visualização dos Dados Finais (Primeiras 5 Linhas Processadas)
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {parseResult.records.length} registos preparados
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-[10px] text-left text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[9px]">
                      <tr>
                        <th className="p-2">Máquina</th>
                        <th className="p-2">Data/Hora</th>
                        <th className="p-2">Duração</th>
                        <th className="p-2">Quem Iniciou</th>
                        <th className="p-2">Tipo de Avaria</th>
                        <th className="p-2">Ação Realizada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                      {parseResult.records.slice(0, 5).map((r, i) => (
                        <tr key={i} className="hover:bg-slate-900/40">
                          <td className="p-2 font-bold font-mono text-amber-300">{r.machineId}</td>
                          <td className="p-2 font-mono">{r.date} {r.startTime}</td>
                          <td className="p-2 font-mono text-rose-300">{r.durationFormatted}</td>
                          <td className="p-2 text-slate-200 truncate max-w-[110px]">{r.initiatedBy}</td>
                          <td className="p-2 truncate max-w-[130px] text-amber-200 font-medium">{r.stoppageType}</td>
                          <td className="p-2 truncate max-w-[160px] text-slate-400">{r.actionsTaken}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Import Options & Mode Selection */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <label className="flex items-start sm:items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 mt-0.5 sm:mt-0"
                  />
                  <span className="text-[11px] leading-relaxed">
                    <strong className="text-white">Substituir todos os registos existentes:</strong> Apaga os registos atuais e grava apenas os do ficheiro (se desmarcado, junta evitando duplicações por data e máquina).
                  </span>
                </label>
              </div>

              {/* Final Upload CTA Button */}
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={isImporting || parseResult.records.length === 0}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 text-xs font-bold text-slate-950 uppercase tracking-wider hover:brightness-105 active:scale-[0.99] transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-slate-950" />
                    <span>A gravar registos na base de dados permanente...</span>
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 text-slate-950" />
                    <span>Carregar {parseResult.records.length} Registos para a Base Central StopTRACK</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SEGURANÇA & CREDENCIAIS */}
      {activeTab === 'security' && (
        <div className="my-4 flex-1 space-y-4">
          {/* Identity Info Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400 font-mono">
              <ShieldCheck className="h-4 w-4" />
              <span>Conta de Administrador Atual</span>
            </div>

            <div className="grid grid-cols-1 gap-3 text-xs">
              <div className="rounded-xl bg-slate-950/70 p-3 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">Nível de Acesso</span>
                <p className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Total / Backend
                </p>
              </div>
            </div>
          </div>

          {/* Change Credentials Form */}
          <div className="rounded-2xl border border-amber-500/30 bg-slate-900/90 p-4 sm:p-5 shadow-xl">
            <div className="border-b border-slate-800 pb-2 mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 font-mono flex items-center gap-1.5">
                <KeyRound className="h-4 w-4" />
                <span>Alterar Palavra-passe e Email</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Defina a sua palavra-passe pessoal para assegurar que apenas você consegue aceder e modificar o backend.
              </p>
            </div>

            {/* Error / Success Notices */}
            {credError && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-950/80 p-3 text-xs text-rose-200">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <p>{credError}</p>
              </div>
            )}

            {credSuccess && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/80 p-3 text-xs text-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <p>{credSuccess}</p>
              </div>
            )}

            <form onSubmit={handleSecuritySubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Palavra-passe Atual <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Introduza a sua palavra-passe atual"
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    tabIndex={-1}
                  >
                    {showCurrentPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Nova Palavra-passe
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      placeholder="Mínimo 4 caracteres"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      tabIndex={-1}
                    >
                      {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                    Confirmar Nova Palavra-passe
                  </label>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={confirmNewPw}
                    onChange={(e) => setConfirmNewPw(e.target.value)}
                    placeholder="Repita a nova palavra-passe"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Novo Email de Administrador (Opcional)
                </label>
                <input
                  type="email"
                  value={newEmailInput}
                  onChange={(e) => setNewEmailInput(e.target.value)}
                  placeholder="Introduza o novo email"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={isUpdatingCredentials}
                className="w-full rounded-xl bg-amber-500 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isUpdatingCredentials ? 'A atualizar...' : 'Gravar Novas Credenciais de Acesso'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Resetting to Defaults */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="max-w-sm w-full rounded-2xl border border-rose-500/40 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase text-white font-mono">Restaurar Padrões de Fábrica?</h4>
                <p className="text-[11px] text-slate-400">Esta ação irá repor os operadores e avarias originais.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Tem a certeza de que deseja restaurar as configurações de fábrica? Os dados de paragens históricos não serão apagados.
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-500 active:scale-[0.98] transition-all"
              >
                {isResetting ? 'A restaurar...' : 'Sim, Restaurar'}
              </button>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Actions: Reset to factory defaults & Back */}
      <div className="space-y-2 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span>Base de dados central permanente</span>
          <button
            type="button"
            onClick={() => {
              playIndustrialClick();
              setShowResetConfirm(true);
            }}
            className="flex items-center gap-1 text-slate-400 hover:text-rose-400 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Restaurar Padrões</span>
          </button>
        </div>

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
    </div>
  );
};
