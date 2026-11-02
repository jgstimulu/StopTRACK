import { Machine, DowntimeType, StoppageRecord, Operator, StoppageTypeItem, StoppageTemplate } from '../types/manutrack';

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

export const INITIAL_STOPPAGE_TEMPLATES: StoppageTemplate[] = [
  {
    id: 'tpl-mec-1',
    stoppageTypeId: 'st-1',
    title: 'Rolamento Danificado / Gripado',
    subcategory: 'Transmissão Mecânica',
    typicalCause: 'Falta de lubrificação ou fadiga do rolamento do veio principal.',
    defaultDescription: 'Ruído excessivo e vibração anormal no conjunto de rolamentos. Bloqueio parcial do veio.',
    defaultActions: 'Desmontagem do mancal, remoção do rolamento gripado, limpeza do veio, montagem de novo rolamento e lubrificação com massa de alta temperatura.',
    keywords: ['rolamento', 'gripado', 'vibração', 'veio', 'lubrificação', 'mancal'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-mec-2',
    stoppageTypeId: 'st-1',
    title: 'Correia de Transmissão Partida ou Frouxa',
    subcategory: 'Transmissão Mecânica',
    typicalCause: 'Desgaste por atrito ou tensão desajustada na correia.',
    defaultDescription: 'Quebra ou patinagem da correia de transmissão com perda de tração e rotação.',
    defaultActions: 'Substituição da correia gasta por nova unidade com referência correspondente, ajuste de tensão com tensiómetro e teste de rotação.',
    keywords: ['correia', 'patinagem', 'tração', 'tensão', 'polia'],
    active: true,
    displayOrder: 2,
  },
  {
    id: 'tpl-mec-3',
    stoppageTypeId: 'st-1',
    title: 'Bloqueio Mecânico por Obstrução de Peça',
    subcategory: 'Alimentação / Guiamento',
    typicalCause: 'Encravamento de componente ou sucata no tapete de transporte.',
    defaultDescription: 'Linha de transporte parada por obstrução mecânica e bloqueio de guias.',
    defaultActions: 'Paragem de segurança, desobstrução manual dos fragmentos, verificação de folgas das guias e teste de fluxo livre.',
    keywords: ['encravamento', 'obstrução', 'guias', 'tapete', 'bloqueio'],
    active: true,
    displayOrder: 3,
  },
  {
    id: 'tpl-elec-1',
    stoppageTypeId: 'st-2',
    title: 'Disjuntor de Proteção Motor Disparado',
    subcategory: 'Quadro Elétrico / Motores',
    typicalCause: 'Sobrecarga térmica transitória ou pico de corrente no motor.',
    defaultDescription: 'Disparo do térmico no quadro de potência. Motor de acionamento sem alimentação.',
    defaultActions: 'Inspeção térmica do enrolamento, medição de resistência de isolamento (megômetro), rearme do disjuntor e medição de consumo por fase.',
    keywords: ['disjuntor', 'motor', 'sobrecarga', 'quadro elétrico', 'térmico', 'amperagem'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-elec-2',
    stoppageTypeId: 'st-2',
    title: 'Falha / Desalinhamento de Sensor Ótico ou Indutivo',
    subcategory: 'Automação e Sensores',
    typicalCause: 'Depósito de pó/resíduos na lente ótica ou desalinhamento mecânico.',
    defaultDescription: 'Sinal de deteção intermitente no sensor de presença da estação de trabalho.',
    defaultActions: 'Limpeza da lente/cabeça do sensor, reaperto do suporte mecânico, ajuste da distância de comutação e verificação no PLC.',
    keywords: ['sensor', 'ótico', 'indutivo', 'deteção', 'fotocélula', 'alinhamento'],
    active: true,
    displayOrder: 2,
  },
  {
    id: 'tpl-pneu-1',
    stoppageTypeId: 'st-3',
    title: 'Queda de Pressão / Fuga em Tubagem Rápida',
    subcategory: 'Pneumática',
    typicalCause: 'Furo ou desconexão em racord rápido da linha de ar comprimido.',
    defaultDescription: 'Alarme de baixa pressão pneumática na máquina. Fuga de ar audível.',
    defaultActions: 'Localização da fuga, corte da secção danificada, substituição do racord rápido e verificação de estanqueidade a 6 bar.',
    keywords: ['ar comprimido', 'pressão', 'fuga', 'pneumático', 'racord', 'válvula'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-pneu-2',
    stoppageTypeId: 'st-3',
    title: 'Cilindro Pneumático com Movimento Lento ou Bloqueado',
    subcategory: 'Atuadores',
    typicalCause: 'Desgaste de vedantes internos ou estrangulador de escape desregulado.',
    defaultDescription: 'Atuador pneumático não completa o curso dentro do tempo limite.',
    defaultActions: 'Substituição do kit de vedantes do cilindro, afinação dos reguladores de fluxo unidirecionais e lubrificação da haste.',
    keywords: ['cilindro', 'atuador', 'vedantes', 'curso', 'êmbolo', 'estrangulador'],
    active: true,
    displayOrder: 2,
  },
  {
    id: 'tpl-mat-1',
    stoppageTypeId: 'st-4',
    title: 'Esgotamento de Bobine / Fita de Embalagem',
    subcategory: 'Insumos / Consumíveis',
    typicalCause: 'Consumo total da bobine em linha sem reposição preventiva atempada.',
    defaultDescription: 'Paragem automática por sensor de fim de fita/bobine.',
    defaultActions: 'Carregamento de nova bobine, enfiamento do material pelas guias de tensão e teste de selagem.',
    keywords: ['matéria-prima', 'bobine', 'embalagem', 'consumíveis', 'reposição'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-set-1',
    stoppageTypeId: 'st-5',
    title: 'Troca de Molde / Ferramenta de Corte',
    subcategory: 'Troca de Ferramenta',
    typicalCause: 'Mudança de lote de produção conforme planeamento fabril.',
    defaultDescription: 'Troca programada de matriz de estampagem/corte para novo produto.',
    defaultActions: 'Desmontagem do ferramental anterior, limpeza de mesas, fixação de novo molde, aperto com torquímetro e calibração de altura.',
    keywords: ['setup', 'molde', 'ferramenta', 'troca de formato', 'calibração'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-limp-1',
    stoppageTypeId: 'st-6',
    title: 'Limpeza de Fim de Turno / Desinfeção de Linha',
    subcategory: 'Higienização',
    typicalCause: 'Procedimento padrão de higiene e conservação operacional.',
    defaultDescription: 'Limpeza geral de resíduos, aspiração de poeiras e lavagem de superfícies.',
    defaultActions: 'Aplicação de produto desengordurante, enxaguamento, secagem a ar comprimido e desinfeção.',
    keywords: ['limpeza', 'higienização', 'lavagem', 'desinfeção', 'resíduos'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-prev-1',
    stoppageTypeId: 'st-7',
    title: 'Lubrificação Programada e Verificação de Folgas',
    subcategory: 'Preventiva Sistemática',
    typicalCause: 'Cumprimento do plano de manutenção preventiva quinzenal.',
    defaultDescription: 'Execução do plano de lubrificação mecânica e verificação geral de componentes.',
    defaultActions: 'Engraxamento de pontos rotativos, aperto de parafusos de fixação, verificação de níveis de óleo e registo na folha de manutenção.',
    keywords: ['preventiva', 'lubrificação', 'engraxamento', 'inspeção', 'plano quinzenal'],
    active: true,
    displayOrder: 1,
  },
  {
    id: 'tpl-qual-1',
    stoppageTypeId: 'st-8',
    title: 'Desvio Dimensional / Rebarba Excessiva',
    subcategory: 'Controlo de Qualidade',
    typicalCause: 'Desgaste do gume de corte ou descalibração do batente de encosto.',
    defaultDescription: 'Peças rejeitadas na inspeção de qualidade por não conformidade dimensional.',
    defaultActions: 'Ajuste micrométrico do batente, retificação ou rotação da lâmina de corte e validação das primeiras 5 peças com paquímetro.',
    keywords: ['qualidade', 'desvio', 'dimensional', 'afinação', 'rebarba', 'tolerância'],
    active: true,
    displayOrder: 1,
  },
];

export const STOPPAGE_TYPES = INITIAL_STOPPAGE_TYPES.map(st => ({
  type: st.name,
  color: st.color,
  description: st.description,
}));

export const INITIAL_STOPPAGES_SEED: StoppageRecord[] = [];


