export interface StoppageTypeItem {
  id: string;
  name: string;
  color: string;
  description: string;
  active: boolean;
}

export type DowntimeType = string;

export interface Operator {
  id: string;
  name: string;
  role: string; // e.g. "Operador", "Técnico Mecânico", "Chefe de Linha"
  canStart: boolean; // Pode dar início a paragens
  canClose: boolean; // Pode fechar paragens
  active: boolean;
}

export interface Machine {
  id: string; // F01 to F30
  code: string; // F01
  name: string;
  section: string;
}

export type StoppageStageLevel = 1 | 2 | 3;
// 1 = Diagnóstico (Triagem inicial / Deteção de causa raiz)
// 2 = Intervenção (Múltiplas etapas possíveis: Mecânica, Elétrica, Afinação, etc.)
// 3 = Fecho (Finalização, Teste em vazio, Arranque de máquina)

export interface StoppageStage {
  id: string;
  order: number;
  level?: StoppageStageLevel; // 1 | 2 | 3
  levelLabel?: string; // "1. Diagnóstico", "2. Intervenção", "3. Fecho"
  type: string; // e.g. "Diagnóstico Inicial", "Avaria Mecânica", "Avaria Elétrica", "Qualidade / Afinação", "Arranque e Teste"
  description: string; // O que foi realizado nesta fase
  technician: string; // Nome do técnico, mecânico ou operador
  durationMinutes: number; // Duração desta etapa em minutos
  notes?: string;
}

export interface ActiveDowntime {
  id: string;
  machineId: string;
  machineName: string;
  startTimestamp: number;
  startDateFormatted: string; // e.g. 20/10/2026
  startTimeFormatted: string; // e.g. 11:32:05
  shift?: string; // e.g. "1º Turno", "2º Turno", "Turno Noturno"
  initiatedBy: string;
  assignedTechnician?: string; // Técnico atualmente alocado ou a intervir
  currentStage?: string; // Etapa atual (ex.: "Diagnóstico Inicial", "Intervenção Mecânica", "Afinação")
  currentLevel?: StoppageStageLevel; // Nível atual: 1 (Diagnóstico), 2 (Intervenção), 3 (Fecho)
  stageStartTimestamp?: number; // Início da etapa atual para cálculo live da fase
  completedStages?: StoppageStage[]; // Fases concluídas durante esta mesma paragem
}

export type StoppagePriority = 'Baixa' | 'Média' | 'Alta' | 'Crítica';
export type StoppageStatus = 'Resolvido' | 'Em Decorrer' | 'Pendente';

export interface StoppageRecord {
  id: string;
  machineId: string;
  machineName: string;
  date: string;
  startTime: string;
  endTime: string;
  startTimestamp: number;
  endTimestamp: number;
  durationMs: number;
  durationFormatted: string; // HH:MM:SS
  shift?: string; // e.g. "1º Turno", "2º Turno", "Turno Noturno"
  priority?: StoppagePriority | string; // 'Baixa' | 'Média' | 'Alta' | 'Crítica'
  status?: StoppageStatus | string; // 'Resolvido' | 'Em Decorrer' | 'Pendente'
  machineStopped?: boolean; // A máquina parou? (tique no fecho). Registos antigos não têm este campo.
  initiatedBy: string;
  closedBy: string;
  stoppageType: string;
  stoppageDescription: string;
  actionsTaken: string;
  otherObservations?: string;
  stages?: StoppageStage[]; // Decomposição cronológica da intervenção por etapas
  createdAt: number;
}

export type AppPage =
  | 'home'
  | 'select_machine'
  | 'timing'
  | 'close_form'
  | 'history'
  | 'dashboard'
  | 'admin'
  | 'active_monitoring'
  | 'manual_entry';


