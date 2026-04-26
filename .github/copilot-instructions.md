---
name: OperaClinic Platform - Copilot Instructions
description: "Regras obrigatórias de arquitetura, operação e qualidade para evoluir o SaaS multi-tenant OperaClinic com segurança, confiabilidade e auditabilidade."
---

# Copilot Instructions — OperaClinic Platform

**Versão**: 1.0  
**Escopo**: Arquitetura, qualidade, operação e automação de SaaS multi-tenant para clínicas estéticas  
**Linguagem**: Português (BR) para documentação interna; inglês para código  
**Atualização**: Quando documentação conflitar com código, sinalizar drift explicitamente

---

## 1. Visão do Produto

OperaClinic é um **SaaS multi-tenant** que reduz perda operacional em clínicas estéticas através de:

- **Agenda como núcleo**: Disponibilidade, hold, conflito e lifecycle são autoridade absoluta do backend.
- **Recepção assistida**: Triagem rápida, agendamento seguro e redução de no-show.
- **Mensageria via WhatsApp**: Canal de atendimento, agendamento e confirmação.
- **Automação governada**: Agents e skills executam dentro de guardrails claros, nunca substituem decisão comercial ou operacional.
- **Isolamento multi-tenant garantido**: Cada clínica é uma unidade operacional independente.

**Objetivo mensurável**: ↓ no-show, ↓ tempo de resposta em atendimento, ↑ ocupação de agenda, ↑ velocidade de onboarding.

---

## 2. Regras Obrigatórias de Arquitetura

### 2.1 Isolamento Multi-Tenant (Não-Negociável)

- **Nunca** processar operação sem validar `tenantId` na autorização e na transação.
- **Sempre** escrever `tenantId` em toda entidade de negócio (scheduling, appointment, message, audit).
- **Sempre** filtrar queries por `tenantId` no SELECT, UPDATE, DELETE — não contar com middleware apenas.
- **Quando** terceira parte (webhook, integração) envia dados, validar tenant ownership antes de aplicar qualquer mutação.
- **Rate limiting e abuse protection** são scoped-por-tenant ou por-requester origin, nunca globais.

**Referência em código**: [apps/api/src/modules/commercial/commercial.service.ts](apps/api/src/modules/commercial/commercial.service.ts) — `confirmCheckout` valida tenant ownership via public token lookup.

### 2.2 Backend é Autoridade — Agents Nunca Sobrescrevem

| Então | Autoridade Primária | Agent Permitido | Agent Bloqueado |
|-------|-----|--------|---------|
| Disponibilidade de slot | Backend `scheduling` | Recomendar, reformatar disponibilidade | Confirmar ou prometer slot |
| Hold / Reservation | Backend `scheduling` | Sugerir hold por contexto | Criar hold fora do fluxo oficial |
| Lifecycle de appointment | Backend `scheduling` | Sugerir mudança de estado | Mudar estado sem validação backend |
| Regra de no-show | Backend + clinic owner | Alertar e relatar no-show | "Ignorer" no-show; criar exceção não autorizada |
| Preço, desconto, plano | Backend `billing` | Refletir dado do backend | Inventar preço ou criar disconto |
| Integrações (ex.: WhatsApp) | Backend adapter | Formatar mensagem, triagem | Ignorar falha de entrega ou retry |

**Se houver dúvida sobre autoridade**, escalar para handoff humano.

### 2.3 Transação e Idempotência

- **Toda operação crítica** (agendamento, pagamento, onboarding) usa `$transaction` ou equivalent.
- **Idempotência**: operação repetida com mesmo input produz mesmo resultado, sem efeito colateral duplicado.
- **Retry e deduplicação**: para integrações externas (WhatsApp, pagamento), incluir `idempotencyKey` ou similar.
- **Atomicidade**: mutação nunca fica half-done; ou completa ou reverte.

### 2.4 RBAC e Auditoria

- **Toda ação** que afete scheduling, pagamento, onboarding ou clinic config escreve audit log com:
  - `tenantId`, `actorId`, `action`, `targetId`, `timestamp`, `metadata` (o que mudou).
- **Permissões** checadas no controller ou service, nunca assumir contexto de requisição sem validação explícita.
- **Logs são imutáveis**: uma vez escrito, audit log não é modificado ou eliminado.

---

## 3. Regras por Fluxo Crítico

### 3.1 Recepção & Agendamento (Scheduling Authority)

**Pré-condição**: Appointment está no backend como single source of truth.

| Fluxo | Regra | Validação |
|-------|-------|-----------|
| **Buscar disponibilidade** | Backend retorna slots livres do dia/profissional/clínica. | Agent formata e apresenta; nunca inventa slot. |
| **Sugerir slot** | Agent recomenda baseado em contexto (próximo disponível, preferência de horário, histórico). | Backend valida disponibilidade no momento do booking. |
| **Criar appointment** | Frontend OU agent envia request; backend validadisponibilidade, hold, conflito e lifecycle. | Se backend rejeita (slot ocupado, profissional indisponível), agent reporta e oferece alternativas. |
| **Confirmar appointment** | Backend persiste appointment + envia confirmação (SMS/WhatsApp/push). | Agent não "confirma" — agent formata e entrega ao backend. |
| **Remarcação** | Agent coleta novo slot candidate; backend valida (e.g., pode desmarcar antigo? há hold? há pré-requisito?). | Se backend rejeita, agent explica bloqueio a paciente. |
| **Cancelamento** | Backend valida se pode cancelar (ciclo, timing, politica). | Agent responde com motivo de bloqueio se houver. |
| **Check-in** | Backend valida se é dia, horário e appointment existe. | Reception UI é autoridade; agent nunca faz check-in. |

**Bloqueadores de Agent Scheduling**:
- ❌ Não confirmar slot sem backend validar disponibilidade no momento.
- ❌ Não mudar status de appointment sem autoridade do backend.
- ❌ Não criar hold fora do fluxo official `scheduling.hold`.
- ❌ Não ignorar erro de conflito ou indisponibilidade.

### 3.2 Onboarding Comercial & Ativação

**Hierarquia de Confiança**:
1. Backend state transacional (ex.: `CommercialOnboardingStatus.PAID`).
2. Integrações conciliadas (ex.: pagamento confirmado + webhook + backend atualizado).
3. Evidência parcial (ex.: webhook recebido, mas não conciliado).
4. Relato manual sem validação sistêmica.

| Etapa | Regra | Bloqueador |
|-------|-------|-----------|
| **Lead capturado** | Commercial module cria registrocom status `INITIATED`. | Nenhum; registro é informativo. |
| **Checkout iniciado** | Payment adapter gera URL; backend persiste `AWAITING_PAYMENT`. | Nenhum; aguardando confirmação. |
| **Pagamento confirmado** | Payment webhook + backend reconcilia → status `PAID`. | Se webhook duplicado, deduplicar. Divergência entre webhook e transação = handoff humano. |
| **Ativação iniciada** | Backend cria tenant, clinic, admin user, subscription. Status → `ONBOARDING_STARTED`. | Ativação é **completa** só se todos os marcos estão OK. Parcial = permanecer em `ONBOARDING_STARTED`. |
| **Ativação completa** | Clinic pode fazer login, criar pacientes, schedules. Status → `ONBOARDING_COMPLETED`. | Check-in smoke test ou validação real do flow deve passar. |

**Bloqueadores de Agent**:
- ❌ Não dizer "pagamento confirmado" sem backend state validar.
- ❌ Não prometer "clínica ativa" sem todos os marcos operacionais completos.
- ❌ Não ignorar divergência entre webhook, payment adapter e backend state.
- ❌ Em dúvida: handoff para humano + escalação financeira.

### 3.3 Mensageria WhatsApp & Triagem

**Fluxo**: Inbound WhatsApp → Triagem + Intent Classification → Routing (agent, queue, handoff).

| Etapa | Regra | Validação |
|-------|-------|-----------|
| **Receber msg** | Backend adapter captura; auuditoria com `messageId`, `tenantId`, `senderId`, `timestamp`. | Deduplicar por `messageId`. |
| **Triagem** | Skill de intent classificaacomo: agendamento, confirmação, dúvida, urgência, escalação. | Confiança < threshold → handoff. |
| **Contexto paciente** | Backend busca paciente por WhatsApp ou name/tel; guarda contexto. | Ambiguidade (múltiplo pacientes) → solicitarwclarificação. |
| **Roteamento** | Agent recomenda próxima ação: responder agora, agendar, escalar, ou entregar humano. | Urgência, violação RBAC ou complexidade → handoff obrigatório. |
| **Enviar resposta** | Backend adapter envia reply; registra `outboundMessageId`, `status`, `timestamp`. | Falha de envio → retry com backoff; relatório de deliverability. |

**Garantias de Auditoria**:
- Toda mensagem é rastreável: inbound/outbound `messageId`, tenant, actor, timing.
- Handoff é registrado com motivo e SLA esperado.
- Zero perda de mensagem: se backend nãoconfirmar, retornar erro ao adapter.

### 3.4 Handoff Humano (Obrigatório em Urgência / Ambiguidade / Falha)

**Gatilhos Automáticos de Handoff**:

| Sinal | SLA Recomendado | Ação |
|-------|-------|-------|
| Urgência (ex.: "dor"/ "emergência") | 5 min | Humano avalia. |
| Ambiguidade (ex.: paciente não encontrado ou múltiplas matches) | 10 min | Humano clarifica ou escala. |
| Falha de backend (erro HTTP 5xx, timeout) | 5 min | Log + relatório + fallback humano. |
| Sensível (ex.: reclamação, feedback negativo) | 10 min | Humano responde com empatia. |
| Fora de escopo agent (ex.: configuração clínica, admin policy) | 15 min | Humano avalia; pode escalarpara commercial. |
| Risco financeiro (divergência pagamento, chargeback, inadimplência) | Imediato | Escalação para CFO/Commercial. |

**Saída de Handoff obrigatória**:
```json
{
  "handoff_necessario": true,
  "motivo": "Ambiguidade de paciente: encontrados 2 registros (id123, id456)",
  "urgencia": "alta|media|baixa",
  "contexto_sucinto": "Msg: 'Quero remarcar'; paciente não identificado",
  "sla_recomendado": "10min",
  "actor_recomendado": "reception_team|commercial|admin",
  "fatos": ["msg recebida em 2025-04-04 14:30", "tenant_id: clinic-abc"],
  "lacunas": ["paciente não encontrado no CRM"]
}
```

---

## 4. O Que Priorizar

### A. Reduir No-Show e Ocupação

- **Alta prioridade**: Confirmação de appointment 24h antes + recordatório.
- **Alta prioridade**: Captura de motivo de no-show; realimentar scheduling para próximas ofertas.
- **Média**: Sugestão de slot alternativo if cancelado ou no-show.

### B. Velocidade de Onboarding

- **Alta prioridade**: Reduzir tempo "INITIATED" → "ONBOARDING_COMPLETED" (target < 24h).
- **Alta prioridade**: Erro de integrações (WhatsApp, pagamento) é detectado immediato + alert.
- **Média**: Feedback ao lead durante onboarding para reduzir abandono.

### C. Observabilidade & Auditoria

- **Alta prioridade**: Toda ação crítica em audit log com `tenantId`, `actorId`, `timestamp`, `metadata`.
- **Alta prioridade**: Métrica de "mensagens processadas", "agendamentos criados", "no-shows" por tenant.
- **Alta prioridade**: Alert quando backend autoridade falha (ex.: scheduling unavailable).

### D. Segurança & Isolamento

- **Alta prioridade**: Nenhuma operação lê ou escreve sem `tenantId` validado.
- **Alta prioridade**: Token de acesso (JWT) inclui `tenantId` e `userId` — controller valida ambos.
- **Alta prioridade**: Teste E2E smoke: mesmo navegador, dois tenants → isolamentocompleto.

### E. Handoff & RBAC

- **Alta prioridade**: Responsável de onboarding recebe alert quando lead entra em urgência.
- **Alta prioridade**: Receptionist pode criar appointment mas pode não mudar status sem autoridade.
- **Média**: Audit log mostra quem fez o quê quando; nunca "anônimo".

---

## 5. O Que Evitar

### Arquitetura & Design

- ❌ **Não criar "agent authority"**: agentes são helpers, nunca donos de regra de negócio.
- ❌ **Não confiar em mocks para validar prontidão produtiva**: smoke test é HTTP real, base de dados real.
- ❌ **Não adicionar estado sem isolamento multi-tenant**: toda entidade precisa de `tenantId`.
- ❌ **Não fazer mutação sem transação**: "half-done" é risco de corrupção e divergência.
- ❌ **Não ignorar erro de integrações externas**: webhook/SMS/WhatsApp falhas precisam retry + observabilidade.

### Features e Expansão

- ❌ **Não criar feature isolada**: sempre considerar impacto em no-show, ocupação, tempo de resposta.
- ❌ **Não expandir agent sem guardrails e teste**: "faz mais de tudo" é caminho para caos operacional.
- ❌ **Não prometer ativação ou pagamento sem marco oficial do backend**: sinalizar como "em processamento".
- ❌ **Não ocultar incerteza**: se contexto é ambíguo, dizer claramente; escalar.

### Operação e Produção

- ❌ **Não rollout sem smoke test + plano de rollback**: toda mudança causa impacto real em recepção.
- ❌ **Não deixar audit log vazio ou genérico**: "changed" não é suficiente; registrar antes/depois ou metadata clara.
- ❌ **Não ignorar drift documental**: documentação obsoleta é pior que sem documentação.
- ❌ **Não assumir tenant context sem validação**: requisição vem do cliente; nunca confiar cegamente.

---

## 6. Como Validar Alterações

### Checklist Obrigatório Antes de Merge

#### 🔒 Segurança & Isolamento
- [ ] Toda mutação valida `tenantId` in auth + query/transaction.
- [ ] Teste E2E: dois tenants isolados no mesmo navegador → sem vazamento de dados.
- [ ] Token JWT incluiu `tenantId` + `userId` + expiração.
- [ ] Rate limiting / abuse protection scoped-per-tenant ou per-origin.

#### 📐 Arquitetura
- [ ] Backend é autoridade: frontend/agent nunca sobrescreve regra crítica sem validação.
- [ ] Transação (`$transaction`, DB transaction) cobre toda operação crítica.
- [ ] Idempotência: repetir request 2x produz mesmo estado 1x.
- [ ] Retry logic incluído para integrações externas (WhatsApp, payment, etc).

#### 📍 Auditoria & Observabilidade
- [ ] Audit log registrado para ações em: scheduling, pagamento, onboarding, RBAC.
- [ ] Log inclui: `tenantId`, `actorId`, `action`, `targetId`, `timestamp`, `metadata`.
- [ ] Métrica relevante adicionada (ex.: "appointments_created_per_tenant", "no_show_rate").
- [ ] Handoff tem critério claro e SLA definido.

#### ✅ Testes
- [ ] Unit + integration: testa auth, tenant isolation, happy path e error path.
- [ ] Smoke E2E: fluxo real de ponta a ponta passa (ex: login 2 clínicaspain → zero vazamento).
- [ ] Cobertura mínima 70% em fluxo crítico (scheduling, pagamento, reception).

#### 📋 Qualidade
- [ ] Documentação atualizada se fluxo ou regra mudou.
- [ ] Drift documental sinalizado: "Nota: [file.md](file.md) diz X, mas código faz Y; atualizar".
- [ ] Linguagem: código em EN, docs internas em PT-BR.
- [ ] Sem console.log ou TODOs soltos; tech debt registrado em issue.

#### 🚀 Rollout
- [ ] Plano de rollout definido: canary, feature flag, ou full.
- [ ] Rollback factível: como retornar se quebrar produção?
- [ ] Alerta / métrica para detecção rápida de regressão.

### Padrão de Resposta para Feedback de Copilot

**Quando propor alteração ou responder pergunta sobre OperaClinic**:

```
1. SITUAÇÃO REAL
   - O que o código/fluxo faz hoje?
   - Qual é o problema ou lacuna?

2. OBJETIVO IDEAL
   - O que deveria acontecer?
   - Por que isso reduz no-show / acelera onboarding?

3. CAMINHO RECOMENDADO
   - Qual mudança é mínima, mais segura e mais auditável?
   - Onde estão os riscos?

4. PRÓXIMOS PASSOS PRÁTICOS
   - Código, arquivo e linha a alterar.
   - Teste(s) que validam mudança.

5. CRITÉRIO DE SUCESSO
   - Como saber que funcionou?
   - Qual métrica melhora?
```

### Quando Sinalizar Drift Documental

```
🚨 DRIFT DETECTADO
   Arquivo: [docs/AI_RULES.md](docs/AI_RULES.md) linha 42
   Diz: "Agentes nunca modificam scheduling"
   Código: [apps/api/src/modules/scheduling/scheduling.controller.ts](apps/api/src/modules/scheduling/scheduling.controller.ts#L89)
           → currentamente permite agent.updateAppointmentStatus()
   
   Impacto: Alto; violation de backend autority
   Ação recomendada: 
   - [ ] Remover permissão do agent OU
   - [ ] Atualizar documentação se mudança foi intencional
```

---

## 7. Escalação e Exceções

**Quando é permitido desviar**:

- Desvio é permitido apenas com **justificativa técnica explícita**, **avaliação de risco** e **registro da decisão**.
- Exemplo: "Violamos isolamento multi-tenant em webhook porque backend estava indisponível temporariamente. Mitigação: add retry + manual audit. Decisão registrada em issue #XYZ."

**Quem autoriza exceção**:

- Menor risco (código style, docs): Tech lead da sprint.
- Médio risco (performance, UX trade-off): Product + Tech lead.
- Alto risco (segurança, tenant isolation, handoff bypassado): CTO / Tech lead + security review.

**Escalação ao humano**:

- **Imediato**: Segurança, tenant isolation, financial divergence, emergency signal.
- **< 10 min**: Ambiguidade contexto, falha de backend, fora de escopo agent.
- **< 24 h**: Feedback negativo, onboarding stalled, no-show pattern anomalía.

---

## 8. Referências Rápidas

| Documento | Proposito |
|-----------|-----------|
| [README.md](README.md) | Setup, comandos, smoke E2E. |
| [docs/ARCHITECTURE_DECISIONS_IN_CODE.md](docs/ARCHITECTURE_DECISIONS_IN_CODE.md) | Onde enforcement de regras no código. |
| [.github/instructions/saas-clinica-operacao.instructions.md](.github/instructions/saas-clinica-operacao.instructions.md) | Regras operacionais gerais. |
| [.github/instructions/billing-ativacao-integracoes.instructions.md](.github/instructions/billing-ativacao-integracoes.instructions.md) | Billing, pagamento, onboarding. |
| [.github/instructions/contrato-saida-agentes-skills.instructions.md](.github/instructions/contrato-saida-agentes-skills.instructions.md) | Contrato saída agents/skills. |
| [apps/api/src/modules/scheduling](apps/api/src/modules/scheduling) | Scheduling authority. |
| [apps/api/src/modules/commercial](apps/api/src/modules/commercial) | Onboarding + ativação. |
| [apps/api/src/modules/reception](apps/api/src/modules/reception) | Reception baseline. |

---

## 9. TL;DR — Regras Absolutas

1. **Isolamento**: Nunca processar sem validar `tenantId`.
2. **Autoridade**: Backend dono de scheduling, pagamento, RBAC. Agent = helper, nunca owner.
3. **Transação**: Mutação crítica = `$transaction` ou DB atomic. Sem half-done.
4. **Auditoria**: Toda ação crítica em audit log com `tenantId`, `actorId`, `timestamp`, `metadata`.
5. **Handoff**: Urgência, ambiguidade, falha → escalar; nunca ocultar incerteza.
6. **Smoke Test**: Toda mudança passa smoke E2E real antes de merge.
7. **Docs**: Drift sinalizado; código em EN, docs internas em PT-BR.
8. **Métrica**: Feature priorizada se reduz no-show, acelera onboarding, ou melhora ocupação.

---

**Versão**: 1.0  
**Última atualização**: 2026-04-04  
**Mantido por**: Tech team OperaClinic  
**TODO**: Revisar trimestral ou após cada release maior.
