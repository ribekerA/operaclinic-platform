# Task: Recall clínico por protocolo ("o sistema se paga")

## Header
- Task ID: RECALL-01
- Sprint: piloto
- Title: Motor de recall pós-protocolo com agendamento pelo agente e métrica de receita recuperada
- Owner: —
- Status: Todo
- Priority: P0 (argumento de ROI nº 1)

## Context
- Business context: estética vive de recorrência (botox 4-6 meses, limpeza mensal, pacotes). Concorrentes têm apenas lembrete genérico de consulta marcada; nenhum tem recall automático derivado do protocolo clínico do procedimento realizado, com a IA conduzindo o reagendamento e o dono vendo "R$ recuperados". ~70% da fundação já existe: ProcedureProtocol, PatientProtocolInstance, ProtocolSessionAppointment, follow-ups (padrão APPOINTMENT_REMINDER_24H com dispatch dedup + cron), agente de agendamento, allowAutomatedMessaging por contato.
- Related decisions: reutilizar o padrão de AppointmentFollowUpDispatch (idempotência por kind+alvo+janela); mensagens ativas fora da janela 24h exigem template Meta aprovado.
- Related modules: `procedure-protocols`, `follow-ups`, `agent`, `messaging` (templates), `scheduling`, `reports`, `clinic-insights`.

## Objective
Quando um paciente conclui (ou abandona no meio) um protocolo cujo procedimento tem intervalo de retorno definido, o sistema dispara na data certa uma mensagem de recall via template WhatsApp; a resposta do paciente cai no agente, que oferece horários reais e agenda. Cada agendamento originado de recall é marcado na origem e somado num painel "receita recuperada pela IA" visível ao dono da clínica.

## Scope
- In scope:
  - **Schema — ProcedureProtocol:** adicionar `recallIntervalDays Int?` (intervalo pós-conclusão para retorno; null = sem recall) e `recallMessageTemplateKey String?` (chave do MessageTemplate a usar; null = template default do tenant)
  - **Schema — PatientProtocolInstance:** garantir data de conclusão (`completedAt`) — verificar se existe; se não, adicionar e preencher quando a última ProtocolSessionAppointment for concluída
  - **Schema — novo kind:** `AppointmentFollowUpKind.PROTOCOL_RECALL` (seguir enum existente) e permitir que AppointmentFollowUpDispatch referencie `patientProtocolInstanceId` além de appointment (campo opcional + índice)
  - **Schema — Appointment:** campo `origin` enum (`RECEPTION_MANUAL`, `PUBLIC_BOOKING`, `AGENT_CONVERSATION`, `AGENT_RECALL`, …) — verificar se já existe origem; se existir, apenas adicionar o valor `AGENT_RECALL`
  - **Cron de elegibilidade** (novo controller no módulo follow-ups, espelhando appointment-follow-ups-cron):
    - Seleciona PatientProtocolInstance com `completedAt + recallIntervalDays` dentro da janela (default 30 min, mesmo padrão do reminder), sem dispatch PROTOCOL_RECALL prévio para a instância, contato primário com `allowAutomatedMessaging = true`, tenant com feature `recall.enabled`
    - Também cobre **protocolo abandonado**: instância sem sessão há `intervalBetweenSessionsDays * 2` dias e não concluída → recall de reengajamento (kind próprio `PROTOCOL_ABANDONED_RECALL` ou flag no payload; decidir na implementação, manter dedup)
  - **Disparo:** cria dispatch (PENDING → SENT/FAILED, mesmo ciclo do reminder), envia MessageTemplate aprovado com variáveis `{{nome}}`, `{{procedimento}}`, `{{clinica}}` e CTA de resposta; abre/reutiliza MessageThread do paciente
  - **Resposta do paciente → agente:** a resposta entra na janela 24h; IntentRouter já classifica BOOK_APPOINTMENT; passar contexto de recall na thread (ex.: metadata `recallInstanceId`) para o agente saudar com contexto ("que bom te ver de volta! quer agendar seu retorno de {{procedimento}}?") e para o Appointment criado herdar `origin = AGENT_RECALL` + link à instância
  - **Métrica de ROI** (reports + clinic-insights + web):
    - Por período: recalls enviados, respondidos, agendados, comparecidos; receita = soma do preço do ConsultationType dos appointments AGENT_RECALL com status concluído (se preço não existir no ConsultationType, adicionar campo `defaultPriceCents Int?` — verificar schema)
    - Card no dashboard da clínica: "Este mês a IA trouxe N pacientes de volta = R$ X" + funil (enviado → respondido → agendado → compareceu)
  - **Controles do tenant:** TenantSettings `recall.enabled`, `recall.sendHourLocal` (default 10h, respeitar timezone via SchedulingTimezoneService), `recall.maxPerPatientPerQuarter` (default 2, anti-spam), opt-out automático se paciente responder pedindo para não receber (intent OUT_OF_SCOPE + palavra-chave → seta allowAutomatedMessaging=false + auditoria)
  - **UI web:** no cadastro de protocolo (clinic area), campos de intervalo de recall e template; na tela do paciente, histórico de recalls
- Out of scope (fases seguintes):
  - Recall proativo por ociosidade de agenda (yield management — task futura P2)
  - Recall por e-mail/SMS
  - A/B de mensagens

## Design técnico — fluxo

```
[Cron 5/5 min] → elegibilidade (janela + dedup + opt-in + feature flag)
   → cria AppointmentFollowUpDispatch(kind=PROTOCOL_RECALL, protocolInstanceId)
   → envia template via adapter WhatsApp (fora da janela 24h ⇒ template obrigatório)
   → dispatch SENT + AuditLog + observability counter

[Paciente responde] → webhook → thread com metadata recall
   → IntentRouter → agente de agendamento com contexto do protocolo
   → SlotHold → Appointment(origin=AGENT_RECALL, protocolInstanceId)
   → nova PatientProtocolInstance (novo ciclo) se protocolo recorrente

[Reports] → agregação por origin=AGENT_RECall + status → card ROI
```

## Deliverables
- Documentation: `docs/RECALL_ENGINE.md` (regras de elegibilidade, dedup, opt-out, cálculo de ROI) + atualização do WHATSAPP_BLUEPRINT com o template de recall a submeter à Meta
- Code: itens do escopo
- Tests: abaixo

## Acceptance criteria
1. Protocolo com `recallIntervalDays=150` concluído em D0 gera exatamente 1 dispatch em D+150 na hora local configurada; reexecução do cron não duplica
2. Contato com `allowAutomatedMessaging=false` nunca recebe recall; tentativa fica registrada como SKIPPED com motivo
3. Resposta do paciente ao recall leva a agendamento pelo agente sem intervenção humana no caminho feliz, e o Appointment nasce com origin AGENT_RECALL vinculado à instância
4. Paciente que responde "não quero mais receber" tem opt-out aplicado + AuditLog e recebe confirmação educada
5. Card de ROI mostra funil e valor em R$ consistente com os appointments do período (teste com dados seed)
6. Protocolo abandonado (sem sessão por 2× o intervalo) gera recall de reengajamento uma única vez
7. Limite `maxPerPatientPerQuarter` respeitado mesmo com múltiplos protocolos elegíveis
8. Template não aprovado/inexistente ⇒ dispatch FAILED com motivo claro no command center, sem exception não tratada
9. Tudo multi-tenant: nenhuma query sem tenantId (seguir guardrails existentes); testes cobrem isolamento
10. Zero regressão nos testes de follow-ups, scheduling e agent

## Test plan
- Unit: elegibilidade (janela, dedup, opt-in, quota trimestral, abandono), cálculo de data com timezone, montagem de variáveis do template, agregação de ROI
- Integration: seed protocolo+instância concluída → avanço de relógio (mock) → cron → dispatch → mock adapter confirma envio; resposta simulada → appointment AGENT_RECALL criado; opt-out end-to-end
- Contract: payload do template Meta com variáveis
- Mocks: adapter WhatsApp outbound, relógio
- Estimated external API cost impact: 1 conversa Meta iniciada por recall (categoria utility/marketing conforme template — atenção: Meta pode classificar como marketing, custo maior por conversa; documentar no RECALL_ENGINE.md e repassar no pricing)

## Métrica de sucesso do piloto
Meta com as fundadoras: ≥ 25% dos recalls respondidos, ≥ 40% dos respondidos agendados. Com agenda média de R$ 300/procedimento e 100 instâncias elegíveis/mês, isso é ~R$ 3.000/mês recuperados — o número que vai no depoimento e no seu pitch.
