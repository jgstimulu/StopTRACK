# Padronização de Ocorrências: Fecho Ativo e Registo Manual Retroativo (Revisão 3)

Revisão integral para aplicar e validar a taxonomia de paragens padronizada, os respetivos submenus específicos (Afinação Mola, Afinação Mecânica com Curso/Tempo/Ajuste, Avaria Mecânica com Parada e Observações, e Outro) e a resolução do erro de gravação/falso aviso de validação tanto no **Fecho de Paragem Ativa (`PageCloseStoppage`)** como no **Registo Manual de Ocorrências (`PageManualEntry`)** e **Edição (`EditStoppageModal`)**.

---

## Decisões Confirmadas & Âmbito Alargado

> [!IMPORTANT]
> **Extensão ao Registo Manual de Ocorrências:**
> 1. O **Registo Manual Retroativo (`PageManualEntry.tsx`)** passa a ter exatamente as mesmas regras e submenus que o fecho da máquina ativa.
> 2. **Eliminação do falso erro de "campos não preenchidos"**: Em ambos os formulários (`PageCloseStoppage` e `PageManualEntry`), erros devolvidos pela rede ou base de dados deixam de ser atribuídos a campos do formulário. São exibidos num banner de erro do servidor dedicado e claro.
> 3. **4 Tipos Principais de Topo Fixados**:
>    - 🟠 **Afinação Mola**: Submenu de 8 ações (`Fechar Baixo`, `Abrir Baixo`, `Corrigir Espiral`, `Abrir Todo`, `Fechar Todo`, `Corrigir Escada`, `Mola`, `Outro`).
>    - 🔵 **Afinação Mecânica**: Componentes (`Braços`, `Pica`, `Cabeça`, `Borboleta`, `Outro`) com sub-opções (`Curso`, `Tempo`, `Ajuste`).
>    - 🔴 **Avaria Mecânica**: Paragem garantida (`machineStopped = true`) com opção `Parada` e bloco de observações técnicas vinculado.
>    - ⚪ **Outro**: Intervenção operacional ou motivo livre.
> 4. **Cálculo de Tempo de Afinação**: Informação de "Tempo Total de Afinação" visível em Afinação Mola e Afinação Mecânica (máquina em ensaio ou pequenas paragens parciais).
> 5. **Autorização & PIN no Registo Manual**: No registo manual, o PIN do operador que valida o fecho é verificado via login temporário e aceite pelo servidor sem rejeições 401 erróneas.

---

## 1. Arquitetura da Solução & Fluxo Unificado

```
┌────────────────────────────────────────────────────────────────────────┐
│             REGISTO MANUAL & FECHO DE OCORRÊNCIA NA MÁQUINA            │
│                 (PageManualEntry & PageCloseStoppage)                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┴───────────────────────────────┐
    ▼                                                               ▼
┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
│  SELETOR DE TIPOLOGIA PADRONIZADA    │        │  DADOS OPERACIONAIS & AUTORIZAÇÃO    │
│  • Afinação Mola (8 ações de mola)   │        │  • Máquina, Data, Horas (Início/Fim) │
│  • Afinação Mecânica (Órgãos +       │        │  • Turno (1º, 2º ou Noturno)         │
│    Curso / Tempo / Ajuste)           │        │  • Operador de Início / Fecho        │
│  • Avaria Mecânica (Paragem          │        │  • PIN de validação do operador      │
│    Garantida + Observações)          │        │    (no registo manual retroativo)    │
│  • Outro                             │        └──────────────────┬───────────────────┘
└──────────────────┬───────────────────┘                           │
                   │                                               │
                   ▼                                               ▼
┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
│ SÍNTESE AUTOMÁTICA (100% EDITÁVEL)   │        │ VALIDAÇÃO ESTRITA NO CLIENTE         │
│ • Descrição da Paragem               │        │ • Apenas campos reais não            │
│ • Ação Realizada                     │        │   preenchidos ativam o alerta        │
│ • Observações complementares         │        │   "Campos em falta"                  │
└──────────────────┬───────────────────┘        └──────────────────┬───────────────────┘
                   │                                               │
                   └───────────────────────┬───────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        ENVIO PARA O SERVIDOR                           │
│ • Endpoint: POST /api/stoppages                                        │
│ • Fecho de ativa: Validação direta da máquina e operador               │
│ • Registo manual: Autorização via PIN de operador (canClose) ou Admin  │
│ • Resposta de erro: Tratada num banner isolado "Erro do Servidor",     │
│   sem contaminar os campos de texto preenchidos.                       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Implementação Detalhada por Módulo

### 2.1 Componente `StoppageTaxonomySelector.tsx`
- **Priorização dos 4 tipos padrão**: Garante que os botões `Afinação Mola`, `Afinação Mecânica`, `Avaria Mecânica` e `Outro` são sempre renderizados, independentemente de tipos legados existentes na tabela `stoppage_types` do Supabase.
- **Submenu Afinação Mola**:
  - 8 Ações táteis com multi-seleção e contadores.
  - Alerta de contagem de tempo total de afinação.
- **Submenu Afinação Mecânica**:
  - Multi-seleção de órgãos (`Braços`, `Pica`, `Cabeça`, `Borboleta`, `Outro`).
  - Cada órgão selecionado abre as tags de género de afinação (`Curso`, `Tempo`, `Ajuste`).
- **Submenu Avaria Mecânica**:
  - Indicação imediata de paragem física da máquina (`machineStopped = true`).
  - Bloco de observações da anomalia mecânica.
- **Geração de Texto em Tempo Real**: Atualiza a descrição e ação realizada, respeitando se o utilizador já escreveu manualmente.

### 2.2 `PageManualEntry.tsx` (Registo Manual Retroativo)
- **Integração total do `StoppageTaxonomySelector`**:
  - Quando o utilizador altera o tipo no ecrã de registo manual, os submenus abrem imediatamente.
  - Sincronização dos campos estruturados (`springAdjustments`, `mechanicalAdjustments`, `machineStopped`, `isTuningIntervention`).
- **Separação de erros**:
  - Criação de `serverError: string | null`.
  - Se `onSaveRecord` falhar (ex: PIN incorreto ou erro de ligação à nuvem), o erro é mostrado num banner de erro do sistema vermelho com texto explicativo (ex: *"PIN de autorização incorreto"* ou *"Falha de ligação à base de dados"*).
  - O aviso *"Atenção: Por favor complete os campos em falta"* é reservado unicamente a campos de formulário efetivamente vazios (ex: falta preencher hora ou operador).

### 2.3 `PageCloseStoppage.tsx` (Fecho da Máquina Ativa)
- Aplicação das mesmas correções de separação de erros (`serverError`) e sincronização dos submenus de taxonomia.

### 2.4 Backend `server.ts`
- Ajustar `POST /api/stoppages` para que:
  - O fecho de paragens ativas em curso seja aceite de forma fluida a partir do terminal da fábrica.
  - No registo manual, o PIN do operador autorizado seja verificado e aceite sem desfasamentos de sessão.
  - Respostas de erro incluam mensagens em português claras e sem ambiguidades.

---

## 3. Plano de Ficheiros a Modificar

1. **`src/components/StoppageTaxonomySelector.tsx`**:
   - Garantir apresentação instantânea dos submenus dos 4 tipos principais em qualquer ecrã onde o seletor esteja inserido.
2. **`src/pages/PageManualEntry.tsx`**:
   - Assegurar a ligação bidirecional com o seletor e isolamento do estado `serverError`.
3. **`src/pages/PageCloseStoppage.tsx`**:
   - Isolamento do estado `serverError` e ligação aos submenus.
4. **`server.ts`**:
   - Garantir validação de autorização estável para registos manuais e fechos ativos.
5. **Verificação**:
   - `compile_applet` e `lint_applet` para validação de integridade.
