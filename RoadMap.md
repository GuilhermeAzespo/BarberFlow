# 🗺️ BarberFlow — RoadMap Oficial de Implementações

Este documento define o plano estratégico de evolução do **BarberFlow**, contendo os **6 novos módulos e melhorias** selecionados, organizados em ordem crescente de complexidade (**do mais rápido/simples ao mais robusto**) e agrupados por sinergia técnica para acelerar as entregas.

---

## 📊 Visão Geral da Sequência (Do Mais Fácil ao Mais Complexo)

| Ordem | Item Original | Funcionalidade / Módulo | Complexidade | Categoria | Pode ser Add-on? |
| :---: | :---: | :--- | :---: | :--- | :---: |
| **Fase 1** | Item 1 | **Sistema de Cupons de Desconto no Super Admin** | 🟢 Fácil | Receita & Vendas SaaS | ✅ **Concluído** |
| **Fase 2** | Item 4 | **Planos Anuais / Semestrais no Checkout** | 🟢 Fácil–Médio | Receita & Caixa SaaS | ✅ **Concluído** |
| **Fase 3** | Item 5 | **Régua Automática de Cobrança da Assinatura** | 🟡 Médio | Retenção & Automação SaaS | N/A (Automação SaaS) |
| **Fase 4** | Item 2 | **Cartão Fidelidade Digital Automático** | 🟡 Médio | Fidelização da Barbearia | ✅ Sim (Plano ou Add-on) |
| **Fase 5** | Item 6 | **Recuperação de "Clientes Sumidos" & Aniversariantes (WhatsApp)** | 🟠 Médio–Avançado | Marketing & Retorno | ✅ Sim (Plano ou Add-on) |
| **Fase 6** | Item 3 | **Clube de Assinatura da Barbearia (Planos para Clientes)** | 🔴 Avançado | Receita Recorrente do Salão | ✅ Sim (Plano ou Add-on) |

> 💡 **Por que essa ordem?**
> - As **Fases 1, 2 e 3** atacam diretamente o módulo de **Billing / Mercado Pago** que acabamos de blindar, destravando vendas com cupons, antecipação de 6 a 12 meses de caixa e renovação automática sem inadimplência.
> - As **Fases 4, 5 e 6** criam **3 novos módulos de alto valor** para as barbearias (todos compatíveis com o bloco de **Add-ons** do Super Admin), indo do Cartão Fidelidade até o Clube de Assinatura completo.

---

## 🚀 Detalhamento Técnico de Cada Fase

---

### 🟢 FASE 1: Sistema de Cupons de Desconto no Super Admin *(Item 1)* — ✅ [CONCLUÍDO]
**Objetivo:** Permitir que o Super Admin crie cupons promocionais (ex: `BEMVINDO30`, `PARCEIRO50`, `BLACKFRIDAY`) para campanhas comerciais, parcerias e conversão de salões em período de teste (`Trial`).

#### O que foi implementado:
- [x] **Catálogo e Persistência no Backend (`coupons.ts`):**
  - Armazenamento em `SystemSetting` com schema robusto: `code`, `description`, `discountType` (`PERCENTAGE` | `FIXED_CENTS`), `discountValue`, `maxUses`, `usedCount`, `expiresAt`, `appliesTo` (`ALL` | `PLANS_ONLY` | `ADDONS_ONLY`), `isActive`.
  - Validação em tempo real garantindo regras de expiração, limite de uso, tipo de produto e piso mínimo de R$ 1,00 para o Mercado Pago.
- [x] **Painel Super Admin (`/admin`):**
  - Nova aba **"Cupons"** na barra de navegação com contador dinâmico de cupons ativos.
  - Painel com KPIs (Total de Cupons, Cupons Ativos, Usos Totais).
  - Formulário modal/inline de criação de cupom com pré-visualização.
  - Ações de pausar/ativar em 1 clique e exclusão com confirmação.
- [x] **Checkout de Planos (`/planos`):**
  - Campo com ícone de cupom, validação instantânea no backend, feedback visual com valor original riscado e economia destacada em verde.
  - Integração nos fluxos PIX e Cartão de Crédito.
- [x] **Checkout de Add-ons (`/nfse`):**
  - Validação de cupom no modal de ativação do emissor fiscal NFS-e (compatível com cupons para `ALL` ou `ADDONS_ONLY`).
- [x] **Incremento Automático de Uso (`webhooks.routes.ts` & Polling):**
  - Ao aprovar o pagamento (seja via Webhook do Mercado Pago ou Polling de status), o contador `usedCount` é incrementado atomicamente.

---

### 🟢 FASE 2: Planos Anuais e Semestrais no Checkout *(Item 4)* — ✅ [CONCLUÍDO]
**Objetivo:** Antecipar 6 ou 12 meses de faturamento no seu caixa do Mercado Pago, oferecendo desconto progressivo para o salão que fechar o ciclo Semestral ou Anual.

#### O que foi implementado:
- [x] **Motor de Ciclos de Cobrança no Backend (`billing-cycles.ts`):**
  - Definição dos ciclos `MONTHLY` (30 dias / 1 mês), `SEMIANNUAL` (180 dias / 6 meses) e `ANNUAL` (365 dias / 12 meses).
  - Cálculo de desconto progressivo e valor mensal equivalente.
  - Persistência das configurações dos ciclos em `SystemSetting`.
- [x] **Seletor de Ciclos na Tela de Planos (`/planos`):**
  - Seletor moderno de ciclos no topo da tabela de preços com badges de desconto (`10% OFF` e `20% OFF • 2 meses grátis`).
  - Cards de planos recalculados dinamicamente com valor mensal equivalente, total a ser cobrado e economia destacada em verde.
  - Seletor rápido de ciclo dentro do modal de checkout.
- [x] **Parcelamento no Cartão de Crédito (Mercado Pago):**
  - Dropdown de parcelas integrado no checkout de cartão de crédito.
  - Suporte a até 6x no Semestral e até 12x no Anual, com validação de limite no backend.
- [x] **Renovação Automática Inteligente (`billing.routes.ts` & `webhooks.routes.ts`):**
  - Extensão exata do período de acesso (`+30`, `+180` ou `+365` dias) a partir da data de término atual da assinatura (ou da data atual para novas assinaturas).
  - Registro de metadados do ciclo (`billingCycle`, `cycleDays`, `grossAmountCents`) no `SaaSPayment`.
- [x] **Painel de Gestão no Super Admin (`/admin`):**
  - Bloco completo de configuração dos ciclos na aba "Planos & Vitrine".
  - Ativação/desativação individual de cada ciclo, edição da porcentagem de desconto (0% a 60%) e limite máximo de parcelas permitidas.
  - Salva via `PUT /api/superadmin/billing-cycles` com feedback imediato.

---

### 🟡 FASE 3: Régua Automática de Cobrança da Assinatura *(Item 5)*
**Objetivo:** Reduzir a inadimplência a zero automatizando os lembretes de renovação do SaaS com o PIX pronto para pagamento.

#### Escopo de Implementação:
- **Worker / Agendador Diário no Backend:**
  - Varredura automática diária (ex: às 09:00 da manhã) nas assinaturas dos salões:
    1. **Faltam 3 dias para vencer (`D-3`):** Aviso preventivo amigável.
    2. **Dia do vencimento (`D0`):** Aviso de vencimento hoje + geração automática do **QR Code e PIX Copia e Cola** no Mercado Pago.
    3. **Vencido há 2 dias (`D+2`):** Aviso de regularização antes de suspensão.
- **Canais de Disparo:**
  - Envio automático por **E-mail (SMTP)** com layout corporativo do BarberFlow, botão *"Renovar Agora"* e código PIX Copia e Cola direto no corpo do e-mail.
  - Exibição de alerta direto no topo do painel da barbearia com botão de pagamento em 1 clique.
- **Histórico de Disparos:**
  - Controle de logs para nunca enviar a mesma cobrança duas vezes no mesmo dia.

---

### 🟡 FASE 4: Cartão Fidelidade Digital Automático *(Item 2)*
**Objetivo:** Fidelizar o cliente final da barbearia (ex: *"Complete 10 cortes e ganhe 1 Corte ou Barba grátis"*), integrado ao WhatsApp e à Vitrine Online.

#### Escopo de Implementação:
- **Configuração da Barbearia:**
  - Ativar/desativar o Programa de Fidelidade, definir a meta de selos (ex: `10 cortes`) e o prêmio (ex: `1 Corte Grátis`).
- **Acúmulo Automático de Selos:**
  - Quando o agendamento muda para **Concluído (`COMPLETED`)**, o sistema adiciona `+1 selo` automaticamente na ficha do cliente.
  - **Notificação no WhatsApp:** O Bot da barbearia envia automaticamente: *"✂️ Parabéns, [Nome]! Você ganhou +1 selo no Cartão Fidelidade da [Barbearia]. Agora você tem 7/10 selos!"*.
  - Ao atingir `10/10`, notifica que o cliente desbloqueou a recompensa e libera o resgate na comanda.
- **Visualização na Vitrine Pública (`/[slug]`):**
  - O cliente pode consultar seus selos digitando seu WhatsApp na vitrine da barbearia.
- **Integração com Add-ons Super Admin:**
  - Aparece na aba `Add-ons` do `/admin` para você decidir se vem incluso nos planos ou se é vendido como módulo avulso.

---

### 🟠 FASE 5: Recuperação Automática de "Clientes Sumidos" & Aniversariantes no WhatsApp *(Item 6)*
**Objetivo:** Fazer o BarberFlow gerar dinheiro ativo para o barbeiro, trazendo de volta clientes que estão há muito tempo sem cortar e parabenizando aniversariantes.

#### Escopo de Implementação:
- **Cadastro de Clientes & Agendamento:**
  - Inclusão do campo opcional **Data de Nascimento (`birthDate`)** na ficha do cliente e no formulário de agendamento.
- **Robô 1 — Recuperação de Clientes Inativos ("Clientes Sumidos"):**
  - O dono da barbearia define o prazo de retorno (ex: `25 dias` ou `30 dias` sem agendar).
  - O sistema identifica clientes cujo último corte foi há `X` dias e que não possuem agendamento futuro, disparando mensagem personalizada via WhatsApp com o link da vitrine (`/[slug]/agendar`).
- **Robô 2 — Parabéns de Aniversário:**
  - No dia do aniversário do cliente, dispara mensagem automática de felicitações com mimo/desconto configurável pelo salão.
- **Fila Inteligente Anti-Banimento:**
  - Disparos espaçados em horário comercial com controle de histórico (para não repetir mensagens para o mesmo cliente em menos de 30 dias).
- **Integração com Add-ons Super Admin:**
  - Módulo configurável na aba `Add-ons` do Super Admin.

---

### 🔴 FASE 6: Clube de Assinatura da Barbearia *(Item 3)*
**Objetivo:** Permitir que a barbearia crie e venda seus próprios planos recorrentes para os clientes finais (ex: *"Clube VIP: Cabelo Ilimitado por R$ 119,90/mês"* ou *"4 Cortes no mês por R$ 99,90"*).

#### Escopo de Implementação:
- **Gestão de Planos do Clube (Painel do Salão):**
  - Criação de planos do salão: nome, preço mensal, serviços cobertos, limite de usos no mês (ex: `4 usos/mês` ou `Ilimitado`) e dias da semana permitidos (ex: *Terça a Quinta* ou *Todos os dias*).
- **Gestão de Clientes Assinantes:**
  - Vínculo do cliente ao plano do clube, status (`Ativo`, `Pendente`, `Vencido`), data de renovação e contador de cortes utilizados no ciclo atual (`Ex: 2 de 4 cortes usados`).
- **Integração com a Agenda & Vitrine (`/[slug]/agendar`):**
  - Quando um cliente assinante ativo agenda pela vitrine ou na recepção, o sistema reconhece que o serviço faz parte do Clube VIP dele e abate 1 uso do pacote automaticamente.
- **Cobrança Opcional via Mercado Pago do Próprio Salão:**
  - A barbearia pode gerar o PIX de renovação do clube direto para o cliente usando o token Mercado Pago do próprio salão (100% sem custo e sem tributação para você).
- **Integração com Add-ons Super Admin:**
  - Módulo premium configurável na aba `Add-ons` do Super Admin.

---

## ✅ Status de Execução do RoadMap

- [ ] **Fase 1:** Sistema de Cupons de Desconto no Super Admin
- [ ] **Fase 2:** Planos Anuais / Semestrais no Checkout
- [ ] **Fase 3:** Régua Automática de Cobrança da Assinatura
- [ ] **Fase 4:** Cartão Fidelidade Digital Automático
- [ ] **Fase 5:** Recuperação Automática de "Clientes Sumidos" & Aniversariantes no WhatsApp
- [ ] **Fase 6:** Clube de Assinatura da Barbearia

