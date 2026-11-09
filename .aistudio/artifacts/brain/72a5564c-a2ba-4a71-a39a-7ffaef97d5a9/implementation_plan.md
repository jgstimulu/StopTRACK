# Padronização de Tipologia de Paragens e Submenus de Ações Recorrentes (Revisão 2)

Reestruturação dos tipos de paragem e introdução de submenus hierárquicos de seleção múltipla de ações e ajustes recorrentes, com geração automática de resumos editáveis e distinção clara entre **tempo total de afinação** (com ou sem paragem total) e **avaria mecânica** (paragem garantida).

---

## Decisões Confirmadas & Regras Operacionais

> [!IMPORTANT]
> **Regras Operacionais Fundamentais Estabelecidas:**
> 1. **Afinação Mola & Afinação Mecânica (Tempo Total de Afinação)**:
>    - Nas afinações, a máquina **pode não parar totalmente** ou ter **vários pequenos arranques e paragens** durante os ensaios de afinação.
>    - O sistema contabiliza o **tempo de afinação total** da intervenção (desde a abertura até à conclusão).
>    - A indicação de paragem é flexível / adaptada (com indicação informativa de marcha de ensaio / pequenas paragens transitórias, sem forçar paragem total).
> 2. **Avaria Mecânica (Paragem Garantida)**:
>    - A avaria mecânica é **garantidamente uma paragem** de produção (`machineStopped = true` automático).
>    - Foco total nas observações da causa técnica e resolução mecânica.
> 3. **Novos Tipos Oficiais**:
>    - `Afinação Mola`
>    - `Afinação Mecânica`
>    - `Avaria Mecânica`
>    - `Outro`
> 4. **Geração Automática de Texto Editável**: Ao selecionar ações recorrentes nos submenus, o sistema sintetiza automaticamente o texto técnico nos campos de **Descrição da Paragem** e **Ação Realizada**, mantendo ambos 100% editáveis pelo supervisor.
> 5. **Preservação de Histórico**: Registos anteriores mantêm as suas designações intactas no histórico.

---

## 1. Visão Geral da Interface & Submenus Dinâmicos

### 1.1 Quatro Tipos Principais no Topo
- 🟠 **Afinação Mola** (Ajuste de conformação de mola)
- 🔵 **Afinação Mecânica** (Ajuste dimensional e temporal de órgãos)
- 🔴 **Avaria Mecânica** (Quebra ou falha mecânica - máquina parada garantidamente)
- ⚪ **Outro** (Intervenções diversas ou operacionais)

---

### 1.2 Painel de Submenus por Tipo

#### A. Afinação Mola (Cálculo do Tempo Total de Afinação)
- **Nota Operacional Visível**: *"Tempo de afinação contínuo (máquina pode realizar múltiplos testes e arranques durante o ajuste)."*
- **Ações Recorrentes (Multi-seleção por botões táteis)**:
  - `Fechar Baixo`
  - `Abrir Baixo`
  - `Corrigir Espiral`
  - `Abrir Todo`
  - `Fechar Todo`
  - `Corrigir Escada`
  - `Mola`
  - `Outro` (com campo rápido se necessário)
- **Geração Automática**:
  - *Descrição/Motivo*: `Afinação Mola: [Ações selecionadas]`
  - *Ação Corretiva*: `Afinação de mola executada: [Ações selecionadas]`

#### B. Afinação Mecânica (Componentes + Género de Ajuste)
- **Nota Operacional Visível**: *"Tempo de afinação mecânica total (intervenção em marcha ou ensaios parciais)."*
- **Componentes Mecânicos (Multi-seleção)**:
  - `Braços`
  - `Pica`
  - `Cabeça`
  - `Borboleta`
  - `Outro`
- **Submenu de Género de Ajuste** (para cada componente selecionado ou global da intervenção):
  - `Curso` (afinação de amplitude/deslocamento)
  - `Tempo` (afinação de sincronismo/temporização)
  - `Ajuste` (calibração/folga/afinação geral)
- **Geração Automática**:
  - *Descrição/Motivo*: `Afinação Mecânica: Braços (Curso, Ajuste), Cabeça (Tempo)`
  - *Ação Corretiva*: `Intervenção mecânica efetuada em Braços [Curso, Ajuste] e Cabeça [Tempo]`

#### C. Avaria Mecânica (Paragem Garantida da Linha)
- **Nota Operacional Visível**: *"Paragem garantida da máquina por falha mecânica."*
- **Estado de Paragem**: `Parada = Sim` (bloqueado/garantido).
- **Submenu de Causa & Observações**:
  - Campo focado em **Observações da Avaria Mecânica**: descrição da falha, componentes danificados e ações imediatas.

#### D. Outro
- Campo livre para anotação de motivos operacionais ou específicos.

---

## 2. Diagrama de Fluxo & Lógica de Negócio

```
┌────────────────────────────────────────────────────────────────────────┐
│                      TIPO DE PARAGEM SELECIONADO                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼─────────────────────────┐
         ▼                          ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Afinação Mola   │      │Afinação Mecânica │      │ Avaria Mecânica  │
│(Tempo Total Afin)│      │(Tempo Total Afin)│      │(Paragem Garant.) │
└────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                         │                         │
         │ Máquina em ensaios      │ Máquina em ensaios      │ Máquina PARADA
         │ (micro-arranques/par.)  │ (micro-arranques/par.)  │ (machineStopped=true)
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ Submenu Ações:   │      │ Componentes:     │      │ Submenu Falha:   │
│• Fechar Baixo    │      │• Braços  • Pica  │      │• Paragem total   │
│• Abrir Baixo     │      │• Cabeça  • Borb. │      │• Observações     │
│• Corrigir Espiral│      │• Outro           │      │  técnicas da     │
│• Abrir Todo      │      └────────┬─────────┘      │  avaria mecânica │
│• Fechar Todo     │               ▼                └────────┬─────────┘
│• Corrigir Escada │      ┌──────────────────┐               │
│• Mola   • Outro  │      │ Sub-ajustes:     │               │
└────────┬─────────┘      │• Curso           │               │
         │                │• Tempo           │               │
         │                │• Ajuste          │               │
         │                └────────┬─────────┘               │
         └─────────────────────────┼─────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│             GERAÇÃO AUTOMÁTICA DE RESUMO (EDITÁVEL)                    │
│ • Descrição da Paragem (Motivo / Causa)                                │
│ • Ação Realizada / Resolução                                           │
│ • Resumo detalhado disponível para consulta e relatórios               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Estrutura de Dados e Compatibilidade

### 3.1 Extensão no `StoppageRecord`
```typescript
export interface MechanicalAdjustmentItem {
  component: string;
  adjustmentTypes: ('Curso' | 'Tempo' | 'Ajuste')[];
}

export interface StoppageRecord {
  // Campos existentes
  id: string;
  machineId: string;
  machineName: string;
  date: string;
  startTime: string;
  endTime: string;
  startTimestamp: number;
  endTimestamp: number;
  durationMs: number;
  durationFormatted: string;
  shift: string;
  priority: StoppagePriority;
  status: StoppageStatus;
  machineStopped: boolean; // true garantido para Avaria Mecânica; flexível para Afinações
  initiatedBy: string;
  closedBy: string;
  stoppageType: string;
  stoppageDescription: string;
  actionsTaken: string;
  otherObservations?: string;

  // Novos campos estruturados para taxonomia
  springAdjustments?: string[];
  mechanicalAdjustments?: MechanicalAdjustmentItem[];
  isTuningIntervention?: boolean; // true para Afinação Mola e Afinação Mecânica
}
```

---

## 4. Fases de Execução

### Fase 1: Atualização dos Tipos no Catálogo & Constantes
- Definir em `src/data/initialData.ts`:
  - `st-mola`: **Afinação Mola**
  - `st-afin-mec`: **Afinação Mecânica**
  - `st-avaria-mec`: **Avaria Mecânica**
  - `st-outro`: **Outro**
- Garantir suporte a tipos históricos sem quebras.

### Fase 2: Componente Reutilizável de Submenus (`StoppageTaxonomySelector`)
- Construir o componente interativo que integra:
  - Seleção dos 4 tipos de topo com cores e ícones industriais.
  - Submenu de **Afinação Mola** com as 8 opções (`Fechar Baixo`, `Abrir Baixo`, etc.).
  - Submenu de **Afinação Mecânica** com componentes (`Braços`, `Pica`, `Cabeça`, `Borboleta`, `Outro`) e badges interativos de tipo de afinação (`Curso`, `Tempo`, `Ajuste`).
  - Submenu de **Avaria Mecânica** com aviso de paragem obrigatória e campo de observações.
  - Regra de máquina parada automática:
    - Se `Avaria Mecânica` -> `machineStopped` fica automaticamente marcado como `true`.
    - Se `Afinação Mola` ou `Afinação Mecânica` -> indicação de tempo total de afinação com paragem flexível/marcha de ensaio.

### Fase 3: Integração nas 3 Vistas Principais
- `src/pages/PageCloseStoppage.tsx`: No fecho da paragem ativa pelos supervisores/operadores.
- `src/pages/PageManualEntry.tsx`: No registo manual de paragens ou afinações.
- `src/components/EditStoppageModal.tsx`: Na edição/correção de paragens existentes com autenticação por PIN.

### Fase 4: Verificação & Testes
- Validar sincronização de texto em tempo real (edição manual livre preservada).
- Executar `compile_applet` e `lint_applet`.
- Validar comportamento responsivo no telemóvel e no tablet de posto de trabalho.
