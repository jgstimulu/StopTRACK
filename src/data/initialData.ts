import { Machine, DowntimeType, StoppageRecord, Operator, StoppageTypeItem } from '../types/manutrack';

export const MACHINES_DATA: Machine[] = Array.from({ length: 30 }, (_, i) => {
  const num = (i + 1).toString().padStart(2, '0');
  const code = `F${num}`;
  
  let section = 'Linha 1';
  if (i >= 20) section = 'Linha 3';
  else if (i >= 10) section = 'Linha 2';

  return {
    id: code,
    code: code,
    name: `Máquina ${code}`,
    section,
  };
});

export const INITIAL_OPERATORS: Operator[] = [];

export const DEFAULT_OPERATORS: string[] = [];

export const INITIAL_STOPPAGE_TYPES: StoppageTypeItem[] = [
  { id: 'st-1', name: 'Avaria Mecânica', color: 'rose', description: 'Rolamentos, correias, engrenagens, quebras estruturais', active: true },
  { id: 'st-2', name: 'Avaria Elétrica', color: 'amber', description: 'Motores, sensores, disjuntores, cablagem, PLCs', active: true },
  { id: 'st-3', name: 'Problema Pneumático / Hidráulico', color: 'sky', description: 'Fugas de ar, cilindros, válvulas solenóide, pressão de óleo', active: true },
  { id: 'st-4', name: 'Falta de Matéria-Prima', color: 'orange', description: 'Ausência de bobines, caixas, químicos ou insumos', active: true },
  { id: 'st-5', name: 'Setup / Mudança de Formato', color: 'indigo', description: 'Ajuste de moldes, troca de ferramentas, afinação', active: true },
  { id: 'st-6', name: 'Limpeza e Higienização', color: 'emerald', description: 'Lavagem de linha, aspiração, desinfeção', active: true },
  { id: 'st-7', name: 'Manutenção Preventiva', color: 'blue', description: 'Revisão periódica programada, lubrificação', active: true },
  { id: 'st-8', name: 'Qualidade / Afinação', color: 'purple', description: 'Desvio de tolerâncias, defeito de produto, amostras', active: true },
  { id: 'st-9', name: 'Operacional / Outro', color: 'slate', description: 'Pausa operacional, falta de operador, outros motivos', active: true },
];

export const STOPPAGE_TYPES = INITIAL_STOPPAGE_TYPES.map(st => ({
  type: st.name,
  color: st.color,
  description: st.description,
}));

export const INITIAL_STOPPAGES_SEED: StoppageRecord[] = [];

