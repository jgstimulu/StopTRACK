-- Migração: Catálogo de Modelos de Avaria e Paragem Padronizados (stoppage_templates)
-- Permite enriquecer paragens com subcategorias, causas típicas, ações corretivas padrão e palavras-chave semânticas.

create table if not exists public.stoppage_templates (
  id text primary key check (char_length(id) between 1 and 128),
  stoppage_type_id text not null check (char_length(stoppage_type_id) between 1 and 128),
  title text not null check (char_length(title) between 1 and 128),
  subcategory text not null default '' check (char_length(subcategory) <= 128),
  typical_cause text not null default '' check (char_length(typical_cause) <= 500),
  default_description text not null default '' check (char_length(default_description) <= 5000),
  default_actions text not null default '' check (char_length(default_actions) <= 5000),
  keywords text[] not null default '{}',
  active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stoppage_templates_type_idx
  on public.stoppage_templates (stoppage_type_id, active);

alter table public.stoppage_templates enable row level security;

revoke all on table public.stoppage_templates from public, anon, authenticated;
grant all on table public.stoppage_templates to service_role;

-- Seeding inicial de modelos padrão para a indústria transformadora
insert into public.stoppage_templates (id, stoppage_type_id, title, subcategory, typical_cause, default_description, default_actions, keywords, display_order)
values
  -- Avaria Mecânica (st-1)
  (
    'tpl-mec-1',
    'st-1',
    'Rolamento Danificado / Gripado',
    'Transmissão Mecânica',
    'Falta de lubrificação ou fadiga do rolamento do veio principal.',
    'Ruído excessivo e vibração anormal no conjunto de rolamentos. Bloqueio parcial do veio.',
    'Desmontagem do mancal, remoção do rolamento gripado, limpeza do veio, montagem de novo rolamento e lubrificação com massa de alta temperatura.',
    ARRAY['rolamento', 'gripado', 'vibração', 'veio', 'lubrificação', 'mancal'],
    1
  ),
  (
    'tpl-mec-2',
    'st-1',
    'Correia de Transmissão Partida ou Frouxa',
    'Transmissão Mecânica',
    'Desgaste por atrito ou tensão desajustada na correia.',
    'Quebra/patinagem da correia de transmissão com perda de tração e rotação.',
    'Substituição da correia gasta por nova unidade com referência correspondente, ajuste de tensão com tensiómetro e teste de rotação.',
    ARRAY['correia', 'patinagem', 'tração', 'tensão', 'polia'],
    2
  ),
  (
    'tpl-mec-3',
    'st-1',
    'Bloqueio Mecânico por Obstrução de Peça',
    'Alimentação / Guiamento',
    'Encravamento de componente ou sucata no tapete de transporte.',
    'Linha de transporte parada por obstrução mecânica e bloqueio de guias.',
    'Paragem de segurança, desobstrução manual dos fragmentos, verificação de folgas das guias e teste de fluxo livre.',
    ARRAY['encravamento', 'obstrução', 'guias', 'tapete', 'bloqueio'],
    3
  ),

  -- Avaria Elétrica (st-2)
  (
    'tpl-elec-1',
    'st-2',
    'Disjuntor de Proteção Motor Disparado',
    'Quadro Elétrico / Motores',
    'Sobrecarga térmica transitória ou pico de corrente no motor.',
    'Disparo do térmico no quadro de potência. Motor de acionamento sem alimentação.',
    'Inspeção térmica do enrolamento, medição de resistência de isolamento (megômetro), rearme do disjuntor e medição de consumo por fase.',
    ARRAY['disjuntor', 'motor', 'sobrecarga', 'quadro elétrico', 'térmico', 'amperagem'],
    1
  ),
  (
    'tpl-elec-2',
    'st-2',
    'Falha / Desalinhamento de Sensor Ótico ou Indutivo',
    'Automação e Sensores',
    'Depósito de pó/resíduos na lente ótica ou desalinhamento mecânico.',
    'Sinal de deteção intermitente no sensor de presença da estação de trabalho.',
    'Limpeza da lente/cabeça do sensor, reaperto do suporte mecânico, ajuste da distância de comutação e verificação no PLC.',
    ARRAY['sensor', 'ótico', 'indutivo', 'deteção', 'fotocélula', 'alinhamento'],
    2
  ),

  -- Problema Pneumático / Hidráulico (st-3)
  (
    'tpl-pneu-1',
    'st-3',
    'Queda de Pressão / Fuga em Tubagem Rápida',
    'Pneumática',
    'Furo ou desconexão em racord rápido da linha de ar comprimido.',
    'Alarme de baixa pressão pneumática na máquina. Fuga de ar audível.',
    'Localização da fuga, corte da secção danificada, substituição do racord rápido e verificação de estanqueidade a 6 bar.',
    ARRAY['ar comprimido', 'pressão', 'fuga', 'pneumático', 'racord', 'válvula'],
    1
  ),
  (
    'tpl-pneu-2',
    'st-3',
    'Cilindro Pneumático com Movimento Lento ou Bloqueado',
    'Atuadores',
    'Desgaste de vedantes internos ou estrangulador de escape desregulado.',
    'Atuador pneumático não completa o curso dentro do tempo limite.',
    'Substituição do kit de vedantes do cilindro, afinação dos reguladores de fluxo unidirecionais e lubrificação da haste.',
    ARRAY['cilindro', 'atuador', 'vedantes', 'curso', 'êmbolo', 'estrangulador'],
    2
  ),

  -- Falta de Matéria-Prima (st-4)
  (
    'tpl-mat-1',
    'st-4',
    'Esgotamento de Bobine / Fita de Embalagem',
    'Insumos / Consumíveis',
    'Consumo total da bobine em linha sem reposição preventiva atempada.',
    'Paragem automática por sensor de fim de fita/bobine.',
    'Carregamento de nova bobine, enfiamento do material pelas guias de tensão e teste de selagem.',
    ARRAY['matéria-prima', 'bobine', 'embalagem', 'consumíveis', 'reposição'],
    1
  ),

  -- Setup / Mudança de Formato (st-5)
  (
    'tpl-set-1',
    'st-5',
    'Troca de Molde / Ferramenta de Corte',
    'Troca de Ferramenta',
    'Mudança de lote de produção conforme planeamento fabril.',
    'Troca programada de matriz de estampagem/corte para novo produto.',
    'Desmontagem do ferramental anterior, limpeza de mesas, fixação de novo molde, aperto com torquímetro e calibração de altura.',
    ARRAY['setup', 'molde', 'ferramenta', 'troca de formato', 'calibração'],
    1
  ),

  -- Limpeza e Higienização (st-6)
  (
    'tpl-limp-1',
    'st-6',
    'Limpeza de Fim de Turno / Desinfeção de Linha',
    'Higienização',
    'Procedimento padrão de higiene e conservação operacional.',
    'Limpeza geral de resíduos, aspiração de poeiras e lavagem de superfícies.',
    'Aplicação de produto desengordurante, enxaguamento, secagem a ar comprimido e desinfeção.',
    ARRAY['limpeza', 'higienização', 'lavagem', 'desinfeção', 'resíduos'],
    1
  ),

  -- Manutenção Preventiva (st-7)
  (
    'tpl-prev-1',
    'st-7',
    'Lubrificação Programada e Verificação de Folgas',
    'Preventiva Sistemática',
    'Cumprimento do plano de manutenção preventiva quinzenal.',
    'Execução do plano de lubrificação mecânica e verificação geral de componentes.',
    'Engraxamento de pontos rotativos, aperto de parafusos de fixação, verificação de níveis de óleo e registo na folha de manutenção.',
    ARRAY['preventiva', 'lubrificação', 'engraxamento', 'inspeção', 'plano quinzenal'],
    1
  ),

  -- Qualidade / Afinação (st-8)
  (
    'tpl-qual-1',
    'st-8',
    'Desvio Dimensional / Rebarba Excessiva',
    'Controlo de Qualidade',
    'Desgaste do gume de corte ou descalibração do batente de encosto.',
    'Peças rejeitadas na inspeção de qualidade por não conformidade dimensional.',
    'Ajuste micrométrico do batente, retificação ou rotação da lâmina de corte e validação das primeiras 5 peças com paquímetro.',
    ARRAY['qualidade', 'desvio', 'dimensional', 'afinação', 'rebarba', 'tolerância'],
    1
  )
on conflict (id) do update set
  title = excluded.title,
  subcategory = excluded.subcategory,
  typical_cause = excluded.typical_cause,
  default_description = excluded.default_description,
  default_actions = excluded.default_actions,
  keywords = excluded.keywords,
  display_order = excluded.display_order;
