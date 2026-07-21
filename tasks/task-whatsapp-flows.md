# Task: WhatsApp Flows — anamnese, triagem e reagendamento nativos dentro do WhatsApp

## Header
- Task ID: FLOWS-01
- Sprint: piloto (fase 1) / pós-piloto (fase 2)
- Title: Suporte a WhatsApp Flows no adapter Meta + fluxos de anamnese, triagem de lead e escolha de horário
- Owner: —
- Status: Todo
- Priority: P1 (efeito uau de demo + diferencial que quase ninguém no Brasil usa)

## Context
- Business context: WhatsApp Flows renderiza formulários e telas nativas DENTRO da conversa (campos, dropdowns, date picker, múltiplas telas), sem o paciente sair do WhatsApp nem baixar nada. Casos matadores para estética: (1) anamnese preenchida antes da consulta, (2) triagem/qualificação de lead estruturada na captação, (3) reagendamento escolhendo horário em lista nativa. Pouquíssimas empresas no Brasil usam Flows; nenhum concorrente direto do nicho entrega isso hoje.
- Restrição importante: **Flows só funciona na Meta Cloud API oficial.** O adapter `evolution-whatsapp.adapter.ts` (não-oficial) NÃO suporta — a feature deve degradar graciosamente para perguntas em texto/botões quando o provider do tenant não for Meta. A factory (`messaging-provider.factory.ts`) já permite essa checagem por capability.
- Related modules: `messaging` (meta-whatsapp.adapter — já envia `type: "interactive"` e parseia respostas interativas, linhas ~221 e ~380), `agent` (IntentRouter, captação), `scheduling` (slots), `patients`, futura `ClinicalFormResponse` (task de anamnese 2.3 do doc de gaps — Flows é o canal de coleta dela).
- Related decisions: manter multi-tenant guardrails; nada de dado sensível de saúde sem consentimento (LGPD art. 11).

## Objective
O sistema envia, recebe e processa WhatsApp Flows: a clínica dispara uma anamnese pré-consulta que o paciente preenche dentro do WhatsApp e cujo resultado cai estruturado no prontuário; o agente de captação usa um Flow de triagem para qualificar leads; e (fase 2) o paciente escolhe horário real em tela nativa alimentada dinamicamente pela agenda.

## Scope

### Fase 1 — Flows estáticos (sem endpoint criptografado) — PILOTO
- In scope:
  - **Capability no adapter:** interface `MessagingProviderAdapter` ganha `supportsFlows(): boolean` (Meta = true; Evolution/mock = false). Callers fazem fallback para fluxo de texto/botões quando false.
  - **Envio de Flow:** novo método no meta-whatsapp.adapter para mensagem `type: "interactive"` com `interactive.type: "flow"` (flow_id, flow_cta, flow_action: "navigate", screen inicial, `flow_message_version: "3"`). Suportar envio dentro da janela 24h (interactive) e fora dela via template com botão de Flow (template category + flow button) — documentar os dois caminhos.
  - **Recepção da resposta:** webhook entrega `interactive.nfm_reply.response_json` — parsear no whatsapp-webhooks.service, criar `MessageEventType.FLOW_RESPONSE` (novo enum, seguir padrão) com payload estruturado, rotear para handler por `flowToken` (ver abaixo), e ecoar resumo legível na thread para a recepção ver o que o paciente preencheu.
  - **Flow token e correlação:** todo envio gera `flowToken` (uuid) persistido em nova tabela `FlowDispatch` (tenantId, flowKind, flowToken, patientId?, threadId, appointmentId?, protocolInstanceId?, status PENDING/COMPLETED/EXPIRED, sentAt, completedAt, responsePayload Json?). Correlação da resposta é pelo token — nunca por telefone (multi-tenant safety).
  - **Registro dos Flows na Meta:** os Flow JSONs (telas) são criados via API/BM da Meta por WABA. Criar script/rotina de provisioning (`scripts/provision-flows.ts`) que publica os JSONs versionados do repo (`apps/api/src/modules/messaging/flows/definitions/*.json`) para a WABA do tenant no onboarding, guardando `flowId` por tenant+kind em `IntegrationConnection` metadata ou tabela própria `TenantFlow`.
  - **Flow 1 — Anamnese pré-consulta (`anamnese_basica_v1`):** telas: dados de saúde geral (alergias, medicamentos, gestante/lactante, condições de pele), consentimento LGPD explícito (checkbox obrigatório com texto claro), assinatura de ciência. Resposta vira `ClinicalFormResponse` (se a task 2.3 ainda não existir, persistir em FlowDispatch.responsePayload e migrar depois — não bloquear). Disparo automático: junto da confirmação D-1 quando o ConsultationType exigir anamnese e o paciente não tiver uma válida (validade configurável, ex. 180 dias).
  - **Flow 2 — Triagem de captação (`triagem_lead_v1`):** usado pelo agente de captação quando intenção = LEAD_CAPTURE: interesse (lista de procedimentos do tenant, gerada no provisioning), urgência, período preferido, como conheceu. Resultado alimenta o lead e o roteamento (interesse de alto tíquete → prioridade no handoff).
  - **Observabilidade:** métricas no command center: flows enviados/completados/expirados por kind, taxa de conclusão, tempo médio de preenchimento. AgentExecution registra quando um flow foi disparado por decisão do agente.
  - **Fallback e expiração:** cron marca FlowDispatch PENDING > 48h como EXPIRED e (para anamnese obrigatória) notifica recepção; paciente que responde texto em vez de abrir o Flow segue atendido normalmente pelo agente.
- Out of scope fase 1: endpoint criptografado, dados dinâmicos em tela, Flow de pagamento.

### Fase 2 — Flows dinâmicos (data_exchange) — PÓS-PILOTO
- **Endpoint criptografado obrigatório:** Flows com `flow_action: "data_exchange"` exigem endpoint HTTPS registrado na Meta com par de chaves RSA-2048 (payloads cifrados AES + chave cifrada RSA; implementar encrypt/decrypt conforme spec oficial de Flows Encryption). Novo controller `flows-endpoint.controller.ts` com healthcheck exigido pela Meta, rotação de chave documentada, chaves por env/secret manager — nunca no banco.
- **Flow 3 — Reagendamento com horários reais (`reagendar_v1`):** paciente toca "remarcar" na confirmação → Flow abre → endpoint responde com telas populadas pelos slots reais (SchedulingService + SlotHold ao selecionar) → confirmação na última tela → Appointment atualizado. Elimina o vai-e-vem de texto para remarcar.
- **Flow 1b — Anamnese condicional:** ramificação de telas conforme respostas (ex.: "usa ácido? → quais?") via data_exchange.

## Design técnico — pontos de atenção
1. **Versionamento de Flow JSON:** definitions no repo com sufixo `_v1`; alteração = nova versão publicada + FlowDispatch grava a versão respondida (anamnese é documento — a versão respondida importa juridicamente).
2. **LGPD:** anamnese = dado sensível. Consentimento é tela do próprio Flow, resposta armazenada com timestamp e hash no AuditLog; acesso à resposta segue RBAC clínico; incluir no doc de retenção.
3. **Evolution adapter:** `supportsFlows() === false` ⇒ agente usa o caminho atual de perguntas sequenciais; anamnese cai em link web (public-booking pode hospedar o form como fallback universal).
4. **Template com botão de Flow (fora da janela 24h):** exige aprovação Meta do template; incluir no checklist de onboarding da clínica junto com os templates de confirmação/recall.
5. **Idempotência do webhook:** nfm_reply pode reentregar — dedup por flowToken + hash do payload (padrão WebhookEvent existente).

## Deliverables
- Documentation: `docs/WHATSAPP_FLOWS.md` (arquitetura, provisioning, encryption fase 2, fallbacks, LGPD) + atualização do WHATSAPP_CLINIC_ONBOARDING_CHECKLIST
- Code: escopo fase 1 (fase 2 em PR separado)
- Tests: abaixo

## Acceptance criteria (fase 1)
1. Tenant Meta: agente de captação com intenção LEAD_CAPTURE envia Flow de triagem; resposta cria/enriquece o lead e aparece resumida na thread da recepção
2. Consulta D-1 de ConsultationType com anamnese exigida e sem resposta válida dispara Flow de anamnese junto da confirmação; resposta fica vinculada ao paciente e ao appointment com consentimento registrado
3. Tenant Evolution: mesmos gatilhos degradam para o fluxo de texto atual sem erro
4. Resposta de Flow correlaciona SEMPRE pelo flowToken; teste de isolamento multi-tenant cobre token de outro tenant sendo rejeitado
5. FlowDispatch expira em 48h via cron e notifica recepção quando anamnese era obrigatória
6. Command center exibe taxa de conclusão por flow kind
7. Provisioning script publica as definitions na WABA de um tenant novo em 1 comando
8. Zero regressão em messaging/agent

## Test plan
- Unit: builder do payload interactive flow; parser do nfm_reply; correlação por token; expiração; capability fallback
- Integration: webhook fixture com nfm_reply real (anonimizada) → FlowDispatch COMPLETED → dados no lead/paciente; tenant Evolution → fallback textual
- Contract: shape do interactive flow message v3 e do nfm_reply
- Mocks: adapter outbound, Meta Flows API (provisioning)
- Estimated external API cost impact: Flow em si não tem custo adicional além da conversa Meta; template com botão de Flow segue pricing da categoria do template

## Demo script (para venda)
Na demo com a dona: "vou marcar uma avaliação pra você agora" → confirmação chega no WhatsApp dela com botão "Preencher ficha" → ela abre a anamnese DENTRO do WhatsApp, preenche em 40 segundos → a ficha aparece na tela da recepção na hora. Frase de fechamento: "sua paciente chega com a ficha pronta, sem imprimir papel, sem baixar app". Ninguém no mercado mostra isso hoje.
