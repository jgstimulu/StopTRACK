# Plano de Implementação: Catálogo de Modelos e Preenchimento Padronizado de Paragens (Supabase)

## 1. Visão Geral e Objetivos

Este plano define a arquitetura e implementação da funcionalidade de **padronização e preenchimento automático de paragens/avarias**, preparando a aplicação para análise semântica e contextual futura.

Com base nas decisões confirmadas:
1. **Comportamento no Fecho/Registo/Edição:** Ao selecionar um tipo de paragem (ex.: Mecânica, Elétrica, Operacional), o sistema disponibiliza e pré-preenche sugestões editáveis de subcategoria, causa típica, descrição padronizada e ações corretivas recomendadas. O operador ou supervisor mantém a liberdade de ajustar qualquer campo antes de guardar.
2. **Nível de Detalhe:** O catálogo estrutura subcategorias, causas típicas, descrição modelo, ações corretivas e palavras-chave (tags) semânticas para indexação.
3. **Persistência no Supabase:** Criação de uma tabela dedicada `stoppage_templates` com sincronização bidirecional, fallback offline seguro e gestão administrativa completa.

---

## 2. Decisões do Utilizador (Contexto das Perguntas)

| Pergunta | Resposta Selecionada |
| :--- | :--- |
| **Comportamento de preenchimento automático** | *Pré-preencher sugestão editável ao selecionar o tipo* |
| **Nível de detalhe e padronização** | *Subcategorias, causas típicas e ações por tipo* |
| **Estrutura na base de dados Supabase** | *Criar tabela dedicada `stoppage_templates` no Supabase* |

---

## 3. Arquitetura e Fluxo de Dados

```
+--------------------------------------------------------------------------------+
|                             Painel de Administração                             |
|              (Configuração do Catálogo de Modelos e Palavras-Chave)             |
+---------------------------------------+----------------------------------------+
                                        |
                                        v  (CRUD Templates)
+--------------------------------------------------------------------------------+
|                        API Express + Supabase Client                           |
|       - GET/POST/PUT/DELETE  /api/stoppage-templates                           |
|       - Cache local e fallback offline no servidor local                       |
+---------------------------------------+----------------------------------------+
                                        |
                                        v
+--------------------------------------------------------------------------------+
|                         Tabela: stoppage_templates                             |
|  (id, stoppage_type_id, subcategory, typical_cause, default_description,        |
|   default_actions, keywords[], active, created_at, updated_at)                 |
+---------------------------------------+----------------------------------------+
                                        |
                  +---------------------+---------------------+
                  | Sincronização e Cache em Memória          |
                  v                                           v
+-----------------------------------+     +-----------------------------------+
|  Registo / Fecho de Paragens      |     |     Edição / Correção de Paragem  |
|  (PageCloseStoppage, ManualEntry) |     |       (EditStoppageModal)         |
+-----------------+-----------------+     +-----------------+-----------------+
                  |                                         |
                  +--------------------+--------------------+
                                       |
                                       v
         Ao selecionar tipo de paragem / escolher modelo rápido:
         - Sugestão é inserida nos campos (Descrição, Causa, Ações)
         - Operador edita livremente os detalhes específicos
         - Guardado na tabela `stoppages` com vínculo do modelo
```

---

## 4. Alterações Propostas por Componente

### 4.1. Base de Dados Supabase (Migração SQL)
- **Ficheiro:** `supabase/migrations/20261102020000_stoppage_templates.sql`
- **Conteúdo:**
  - Tabela `stoppage_templates`:
    ```sql
    CREATE TABLE IF NOT EXISTS stoppage_templates (
      id TEXT PRIMARY KEY,
      stoppage_type_id TEXT NOT NULL REFERENCES stoppage_types(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      subcategory TEXT NOT NULL,
      typical_cause TEXT NOT NULL,
      default_description TEXT NOT NULL,
      default_actions TEXT NOT NULL,
      keywords TEXT[] NOT NULL DEFAULT '{}',
      active BOOLEAN NOT NULL DEFAULT true,
      display_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    ```
  - Seeding inicial de modelos padrão industriais (ex.: Rolamento gripado, Sensor desalinhado, Falha pneumática, Falta de matéria-prima, Troca de ferramenta, Limpeza de linha).
  - Atualização da tabela `stoppages` com colunas opcionais para análise semântica: `template_id TEXT`, `subcategory TEXT`, `typical_cause TEXT`, `corrective_actions TEXT`.

### 4.2. Servidor Backend (`server.ts` & `server/supabaseStore.ts`)
- **Ficheiro:** `server/supabaseStore.ts`
  - Métodos `getStoppageTemplates()`, `createStoppageTemplate()`, `updateStoppageTemplate()`, `deleteStoppageTemplate()`.
  - Fallback offline robusto para operar mesmo sem conectividade momentânea ao Supabase.
- **Ficheiro:** `server.ts`
  - Rotas RESTful:
    - `GET /api/stoppage-templates`: lista modelos ativos ou todos (admin).
    - `POST /api/stoppage-templates`: cria novo modelo (protegido por PIN de supervisor/admin).
    - `PUT /api/stoppage-templates/:id`: atualiza modelo existente.
    - `DELETE /api/stoppage-templates/:id`: desativa ou remove modelo.
  - Validação dos campos enriquecidos no payload de criação e edição de paragens.

### 4.3. Tipos e Modelo de Dados Frontend (`src/types.ts`)
- **Ficheiro:** `src/types.ts`
  - Interface `StoppageTemplate`:
    ```ts
    export interface StoppageTemplate {
      id: string;
      stoppageTypeId: string;
      title: string;
      subcategory: string;
      typicalCause: string;
      defaultDescription: string;
      defaultActions: string;
      keywords: string[];
      active: boolean;
      displayOrder?: number;
    }
    ```
  - Enriquecimento de `StoppageRecord` com `templateId?`, `subcategory?`, `typicalCause?`, `correctiveActions?`.

### 4.4. Interface de Registo e Fecho de Paragens
- **Ficheiros:**
  - `src/components/PageCloseStoppage.tsx`
  - `src/components/PageManualEntry.tsx`
  - `src/components/EditStoppageModal.tsx`
- **Funcionalidades UX:**
  - Ao selecionar o tipo de paragem, se houver modelos associados:
    - Apresenta badge/seletor visual discreto de modelos frequentes (ex.: "Sensor sujo", "Correia partida", "Bloqueio mecânico").
    - Pré-preenche imediatamente os campos com o modelo padrão recomendado, sem bloquear o utilizador.
    - Se o operador alterar o modelo na dropdown de sugestões rápidas, o texto é atualizado com confirmação inteligente (ou preservando notas manuais caso o utilizador já tenha escrito).
  - Novos campos integrados de forma limpa e ergonómica:
    - **Subcategoria** (seleção ou texto padrão)
    - **Causa Típica Identificada**
    - **Descrição da Avaria**
    - **Ações Corretivas Aplicadas**
    - **Palavras-chave Semânticas / Tags** (preparação de contexto para IA/pesquisa)

### 4.5. Gestão no Ecrã de Administração (`src/components/PageAdmin.tsx`)
- **Ficheiro:** `src/components/PageAdmin.tsx`
- **Funcionalidades:**
  - Novo separador/seção: **"Catálogo de Avarias e Modelos Padronizados"**.
  - Tabela/cartões com filtros por Tipo de Paragem.
  - Modal/formulário para criar e editar modelos (Título, Subcategoria, Causa Típica, Descrição Padrão, Ações Corretivas e lista de Palavras-Chave separadas por vírgula).
  - Ativar/desativar modelos e reordenar.

---

## 5. Plano de Verificação

### 5.1. Testes Automatizados e Build
1. `npm run build` para garantir conformidade de tipos TypeScript e integridade dos pacotes.
2. Verificação de rotas da API com chamadas HTTP (`GET`, `POST`, `PUT`, `DELETE` em `/api/stoppage-templates`).

### 5.2. Testes de Cenários de Utilizador
1. **Cenário de Fecho com Sugestão:**
   - Iniciar paragem do tipo "Avaria Mecânica".
   - Abrir fecho de paragem: verificar que os campos de subcategoria, causa típica e descrição são sugeridos automaticamente.
   - Modificar texto e submeter fecho. Confirmar no Supabase que a paragem guarda tanto o texto editado como a taxonomia padronizada.
2. **Cenário de Edição Posterior (com PIN):**
   - Abrir o histórico de paragens fechadas.
   - Clicar em "Editar/Corrigir Paragem", introduzir o PIN.
   - Trocar o modelo selecionado ou ajustar a descrição; gravar e validar que os dados atualizados permanecem intactos após recarregamento.
3. **Cenário de Gestão de Catálogo (Admin):**
   - Aceder à Administração -> Catálogo de Avarias.
   - Criar um novo modelo personalizado (ex.: tipo Elétrica, subcategoria "Sensores Fotoelétricos", palavras-chave "ótica, reflexão, poeira").
   - Testar o registo de uma paragem desse tipo e confirmar que o novo modelo surge imediatamente como sugestão.
4. **Cenário de Resiliência Offline:**
   - Simular indisponibilidade temporária do Supabase; verificar que o cache local permite continuar a preencher paragens sem erro.
