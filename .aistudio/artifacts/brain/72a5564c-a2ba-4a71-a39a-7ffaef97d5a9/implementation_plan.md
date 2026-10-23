# Implementação Concluída: Arquitetura de 3 Níveis de Etapas e Gestão de Múltiplas Intervenções

A estruturação solicitada para as etapas de paragem foi totalmente integrada em todo o fluxo da aplicação.

---

## 1. Arquitetura dos 3 Níveis de Etapas

### **Nível 1 · Diagnóstico**
- **Objetivo**: Triagem inicial, inspeção visual, leitura de alarmes e identificação da causa raiz.
- **Início Automático**: Logo que uma paragem é iniciada numa máquina (F01–F30), o cronómetro arranca automaticamente no **Nível 1 (Diagnóstico)** sob a alçada de quem iniciou o registo.
- **Opções Rápidas**: *Diagnóstico Inicial / Triagem*, *Inspeção Visual e Alarmes*, *Análise de Causa Raiz*.

### **Nível 2 · Intervenção / Resolução (Múltiplas Etapas Sucessivas)**
- **Objetivo**: Execução da intervenção corretiva técnica.
- **Múltiplas Etapas Encadeadas**: Resolve o caso real de uma avaria que começa por ser mecânica e depois exige intervenção elétrica ou afinação:
  - Exemplo de sequência ao vivo:
    - Etapa 2.1: *Avaria Mecânica* (Mecânico Carlos, 45 min)
    - Etapa 2.2: *Avaria Elétrica* (Eletricista Tiago, 30 min)
    - Etapa 2.3: *Qualidade / Afinação* (Supervisor Rui, 20 min)
- **Opções Rápidas**: *Avaria Mecânica*, *Avaria Elétrica*, *Pneumática / Hidráulica*, *Substituição de Peças*, *Falta de Matéria-Prima / Abastecimento*, *Qualidade / Afinação*, *Limpeza / Desobstrução* ou tipo personalizado.

### **Nível 3 · Fecho / Finalização**
- **Objetivo**: Teste em vazio, arranque de máquina, validação com primeiras peças e entrega da linha à produção.
- **Opções Rápidas**: *Arranque e Produção*, *Teste em Vazio e Validação*, *Verificação de Primeiras Peças*, *Entrega Operacional da Linha*.

---

## 2. Onde Está Visível e Funcional

1. **Modal de Transição em Tempo Real (`StageTransitionModal.tsx`)**:
   - Barra superior com indicador visual dos 3 Níveis (`1. Diagnóstico → 2. Intervenção → 3. Fecho`).
   - Seletor direto para avançar de nível ou encadear uma nova intervenção no Nível 2.
   - Cálculo automático dos minutos decorridos na fase anterior e atribuição do novo técnico responsável sem nunca interromper o tempo global da máquina.

2. **Editor de Etapas (`StagesEditor.tsx`)**:
   - Disponível no fecho de paragem e no registo manual retroativo.
   - Botões de inserção rápida por nível (`+ 1. Diagnóstico`, `+ 2. Mecânica`, `+ 2. Elétrica`, `+ 2. Afinação`, `+ 3. Fecho / Arranque`).
   - Dropdown em cada linha para alterar o nível (`Nível 1 · Diagnóstico`, `Nível 2 · Intervenção`, `Nível 3 · Fecho`).
   - Barra visual de linha temporal codificada por cores (Azul para Diagnóstico, Âmbar/Laranja para Intervenções, Verde para Fecho).

3. **Painel de Cronómetros Paralelos (`PageActiveMonitoring.tsx`)**:
   - Cartões compactos verticais exibem em destaque a **Fase em Curso** com o badge de nível correspondente (ex: `1. Diagnóstico`, `2. Intervenção`, `3. Fecho`) e o contador parcial de tempo dessa fase.

4. **Ecrã do Cronómetro Individual (`PageTimer.tsx`)**:
   - Barra de progresso dos 3 Níveis logo abaixo do cabeçalho da máquina.
   - Botão "Trocar Etapa" para transição rápida entre Diagnóstico, Intervenções e Fecho.

5. **Histórico e Exportação CSV (`PageHistory.tsx` & `csvExport.ts`)**:
   - Cada linha na decomposição de etapas do histórico exibe o distintivo do nível (`1. Diagnóstico`, `2. Intervenção`, `3. Fecho`).
   - O ficheiro CSV exporta as etapas com a etiqueta do nível (ex: `[N1-Diagnóstico] #1 ... | [N2-Intervenção] #2 ... | [N3-Fecho] #3 ...`).

---

## 3. Estado de Verificação
- `tsc --noEmit` executado com 0 erros.
- `compile_applet` executado com sucesso.
- Servidor e rotas da API em execução estável.
