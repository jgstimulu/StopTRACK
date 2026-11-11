# Resiliência Total na Gravação de Paragens & Sincronização em Segundo Plano

Eliminação definitiva do erro de acesso à base central no fecho e registo de paragens, garantindo que nenhum registo de trabalho é perdido: gravação imediata no dispositivo com fila de sincronização em segundo plano e política de gravação garantida no servidor (sem bloqueios de concorrência ou rejeição por timestamps).

---

## Decisões Confirmadas

> [!IMPORTANT]
> **Decisões Operacionais Confirmadas pelo Utilizador:**
> 1. **Resiliência Offline / Falha de Ligação**: Se a ligação à base de dados central falhar ou tiver latência momentânea, a aplicação **guarda imediatamente o registo no dispositivo** (`localStorage` com flag de pendente) e **conclui o fecho da máquina**, agendando a sincronização em segundo plano. O operador nunca fica bloqueado nem perde o seu trabalho.
> 2. **Gravação Garantida no Servidor**: O servidor passa a **gravar sempre o registo** de paragem na tabela `stoppages` e a limpar a paragem ativa da máquina, eliminando rejeições de concorrência estrita (erro 409 *"A paragem ativa foi alterada noutro posto"* ou discrepâncias de milissegundos).

---

## 1. Visão Geral da Arquitetura de Gravação Resiliente

```
┌────────────────────────────────────────────────────────────────────────┐
│             AÇÃO DO OPERADOR: "GRAVAR E SAIR" / FECHAR PARAGEM         │
│                 (PageCloseStoppage ou PageManualEntry)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Salvaguarda Imediata no Dispositivo (Garantia de Zero Perda)        │
│ • Registo adicionado ao histórico local (localStorage)                 │
│ • Estado da máquina limpo no ecrã (paragem concluída)                  │
│ • Marcado como pendente de sincronização (pendingSync = true)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
               ┌────────────────────┴────────────────────┐
               │ Tentativa de Gravação na Nuvem (API)     │
               ▼                                         ▼
   [Ligação e Supabase OK]                   [Falha de Rede / Supabase 503]
               │                                         │
               ▼                                         ▼
┌──────────────────────────────┐          ┌──────────────────────────────┐
│ • Sucesso 201 no servidor    │          │ • Aplicação não bloqueia     │
│ • pendingSync marcado falso  │          │ • Notificação informativa:   │
│ • Notificação verde:         │          │   "Guardado no dispositivo.  │
│   "Paragem guardada na       │          │    Sincronização em curso."  │
│    nuvem com sucesso!"       │          │ • Entra na fila de envio     │
│ • Retorna ao ecrã inicial    │          │ • Retorna ao ecrã inicial    │
└──────────────────────────────┘          └──────────────┬───────────────┘
                                                         │
                                                         ▼
                                          ┌──────────────────────────────┐
                                          │ Sincronizador de Fundo:      │
                                          │ Reenvia para o Supabase      │
                                          │ a cada ciclo ou ao detetar   │
                                          │ ligação restabelecida.       │
                                          └──────────────────────────────┘
```

---

## 2. Estratégia de Execução no Servidor (`server.ts` & `supabaseStore.ts`)

### 2.1 Política de Gravação Garantida (Zero Falsos Conflitos)
- No método `saveStoppage`:
  - Se a função RPC `save_stoppage_and_clear_active` reportar conflito ou erro de validação de timestamp ativo, o servidor executa **imediatamente um fallback de gravação direta**:
    1. Inserção / atualização garantida na tabela `stoppages` via PostgREST (`on_conflict=id`).
    2. Remoção da paragem ativa correspondente da máquina em `active_stoppages`.
  - Desta forma, o registo histórico do trabalho executado pelo operador nunca é recusado.

### 2.2 Contingência Local no Servidor
- Caso o Supabase esteja temporariamente indisponível (ex.: quebra de DNS externa ou indisponibilidade da cloud), o servidor guarda o registo no ficheiro de contingência `data/db.json` e retorna `status 201` com indicação de contingência, integrando os dados na base central assim que a conectividade for restabelecida.

### 2.3 Tolerância a Falhas na Inicialização (`initializeSupabaseStorage`)
- O middleware de inicialização do servidor deixa de abortar pedidos com erro 503 caso uma tabela secundária (`app_settings` / `auth_sessions`) tenha atraso de cache. A sincronização de metadados ocorre de forma assíncrona sem interromper o tráfego da API.

---

## 3. Estratégia de Execução no Cliente (`App.tsx`, `PageCloseStoppage`, `PageManualEntry`)

### 3.1 Salvaguarda Atómica no Dispositivo
- No handler `handleSaveAndExit` e `handleSaveManualRecord`:
  1. A paragem é imediatamente adicionada ao estado local `records` e persistida em `localStorage`.
  2. A paragem ativa da máquina é limpa da memória e do ecrã da fábrica.
  3. É efetuada a chamada de sincronização à API. Se a API responder com sucesso, o registo fica confirmado.
  4. Se a API falhar (ex.: sinal Wi-Fi fraco no posto de trabalho), a paragem mantém-se salva no dispositivo, sendo colocada na fila de sincronização em segundo plano, e o operador é informado com mensagem clara de sucesso local:
     > *"Paragem guardada no dispositivo! A sincronização com a base central será concluída em segundo plano."*
  5. A interface volta de imediato ao ecrã inicial ou histórico, permitindo que a linha de produção continue sem interrupções.

### 3.2 Fila de Sincronização em Segundo Plano (`syncPendingStoppages`)
- Adição de rotina em `src/services/api.ts` e `App.tsx` que verifica periodicamente os registos com `pendingSync === true` e os envia para a nuvem quando a ligação estiver ativa.

---

## 4. Ficheiros a Modificar

1. **`server/supabaseStore.ts`**:
   - Ajustar `saveStoppage` com fallback direto para a tabela `stoppages` e limpeza de `active_stoppages`.
2. **`server.ts`**:
   - Ajustar `POST /api/stoppages` para política de gravação garantida e contingência local.
   - Tornar `initializeSupabaseStorage` não bloqueante para chamadas de rotina.
3. **`src/App.tsx`**:
   - Implementar persistência local prioritária em `handleSaveAndExit` e `handleSaveManualRecord`.
   - Adicionar mecanismo de sincronização em segundo plano para paragens pendentes.
4. **`src/pages/PageCloseStoppage.tsx` & `src/pages/PageManualEntry.tsx`**:
   - Informar o operador de gravação com sucesso (local ou nuvem), assegurando navegação fluida sem bloquear no ecrã.
5. **Verificação**:
   - Executar `compile_applet` e `lint_applet` para validação rigorosa de tipos e sintaxe.
