# WhatsApp Operacional - One Pager Executivo

Data: 2026-04-05  
Objetivo: alinhar decisao de execucao com risco controlado para rollout de WhatsApp por clinica.

## Decisao que precisamos tomar

Adotar oficialmente a sequencia 2 -> 3 -> 1 para evitar risco operacional em cliente real:

- 2: setup tecnico por clinica
- 3: governanca operacional (SLA, handoff, gate, rollback)
- 1: validacao em campo real (piloto 5% + janela 24h)

Sem essa ordem, cliente vira ambiente de descoberta de processo.

---

## Estado atual (resumo)

O sistema tem base tecnica para integracao WhatsApp por tenant:
- cadastro/listagem de conexao de integracao
- webhook inbound estruturado
- check de readiness para credenciais e conexoes ativas

Ainda falta fechamento operacional para campo:
- checklist de staging 24h com evidencias reais
- gate formal com GO/HOLD/NO-GO
- ownership operacional por clinica

---

## O que esta pronto

- fluxo de conexao por tenant
- webhook e thread/evento persistido
- readiness com verificacoes de mensageria
- runbook de rollout e rollback do agent layer

---

## O que ainda bloqueia piloto real

1. D0 nao certificado para a clinica piloto
- conexao ativa sem lacuna
- verify token validado
- inbound/outbound de teste com evidencias

2. D1 nao formalizado
- SLA de resposta e handoff por prioridade
- gatilhos de escalonamento
- criterio de gate e rollback testado

3. D7 nao iniciado
- janela T0/T+12h/T+24h ainda sem evidencias oficiais

---

## Risco de pular etapa

- aumento de falha silenciosa em webhook
- atraso de resposta em recepcao sem dono claro
- regressao percebida pelo cliente antes de detectar internamente
- decisao de rollout sem base objetiva

---

## Plano recomendado (curto)

Semana 1
- concluir D0 em 1 clinica candidata
- concluir D1 com aprovacao formal

Semana 2
- executar D7 com 5% por 24h
- decidir GO/HOLD/NO-GO

Semana 3
- se GO, subir para 25% com mesmo gate

---

## Criterio objetivo de GO

Pode avancar se todos forem verdade:
- sem incidente cross-tenant
- failure rate <= limiar acordado
- p95 <= limiar acordado
- sem loop de falha sem handoff
- sem regressao critica em scheduling/recepcao/mensageria

---

## Donos e aprovadores

- Dono tecnico: Tech Lead
- Dono operacional: Operacoes/Recepcao
- Aprovacao de gate: Tech Lead + Operacoes + Produto

---

## Documentos de apoio

- [WHATSAPP_BLUEPRINT_D0_D1_D7.md](WHATSAPP_BLUEPRINT_D0_D1_D7.md)
- [WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md](WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md)
- [WHATSAPP_CLINIC_ONBOARDING_CHECKLIST.md](WHATSAPP_CLINIC_ONBOARDING_CHECKLIST.md)
- [WHATSAPP_15MIN_MEETING_SCRIPT.md](WHATSAPP_15MIN_MEETING_SCRIPT.md)
- [AGENT_LAYER_STAGING_5_PERCENT_CHECKLIST.md](AGENT_LAYER_STAGING_5_PERCENT_CHECKLIST.md)

---

## Mensagem curta para envio no grupo

"Pessoal, para reduzir risco no rollout de WhatsApp, vamos executar na ordem 2->3->1: primeiro setup tecnico por clinica, depois governanca operacional, e so no final validacao real em campo (5% por 24h). A reuniao de decisao vai fechar GO/HOLD/NO-GO com criterio objetivo e plano de rollback."