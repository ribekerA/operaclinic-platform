---
name: skill-whatsapp-intent-triage
description: 'Triagem estruturada de mensagens inbound de WhatsApp para operacao de clinica estetica. Use para classificar intencao, urgencia, estagio da conversa, necessidade de handoff humano e proxima acao com saida auditavel para consumo por agente.'
argument-hint: 'Informe a mensagem, contexto da thread, tenant e qualquer contexto do paciente disponivel.'
user-invocable: true
---

# Skill WhatsApp Intent Triage

## Objetivo

Classificar mensagens inbound de WhatsApp no contexto de operacao clinica estetica para identificar intencao, urgencia, estagio da conversa e necessidade de handoff humano sem extrapolar autoridade operacional.

## Quando usar

- Quando entrar nova mensagem inbound em thread de WhatsApp.
- Quando o agente precisar decidir entre responder, pedir mais contexto ou escalar para humano.
- Quando houver necessidade de padronizar triagem para roteamento operacional e auditoria.
- Quando houver risco de ambiguidade entre fluxo assistido, atendimento humano e regra critica do backend.

## Regras fixas

- Nao confirmar agenda por conta propria.
- Nao assumir dados que nao estejam no contexto.
- Elevar para handoff quando houver urgencia, reclamacao sensivel, ambiguidade relevante, falha de contexto ou risco operacional.
- Sempre retornar saida estruturada para consumo por agente.
- Nunca tratar agente como autoridade de regra de negocio.
- Scheduling permanece autoridade para disponibilidade, hold, appointment lifecycle e conflito.
- Respeitar tenant context, RBAC, rastreabilidade e auditoria em toda classificacao.

## Entradas esperadas

- Mensagem recebida.
- Contexto da thread.
- Contexto do paciente, se houver.
- Contexto do tenant.
- Historico recente da conversa.

## Categorias minimas obrigatorias

- agendamento
- remarcacao
- cancelamento
- confirmacao
- duvida operacional
- status de atendimento
- comercial/onboarding
- reclamacao
- urgencia
- fora de escopo

## Defaults de execucao

- Em caso de conflito entre sinais, priorizar seguranca operacional e handoff.
- Quando faltarem dados essenciais, classificar com menor confianca e explicitar lacuna.
- Na duvida entre confianca media e baixa, adotar baixa.
- Quando uma mensagem misturar mais de uma intencao, escolher a intencao principal pelo risco e impacto operacional, registrando o subtipo ou observacao secundaria.
- Se a urgencia for incerta mas plausivel, tratar como elevacao preventiva para humano.
- Comercial/onboarding pode seguir fluxo assistido quando houver contexto suficiente, guardrails claros e ausencia de risco relevante.

## Procedimento

1. Validar contexto disponivel
- Verificar se ha tenant context, thread atual e historico suficiente para classificar com seguranca.
- Se faltar contexto critico, reduzir confianca e avaliar handoff imediato.

2. Extrair sinais da mensagem
- Identificar pedido explicito, sinais implicitos, tom, prazo, dor, insatisfacao e referencias a agenda ou atendimento.
- Separar o que e fato textual do que seria apenas inferencia.

3. Classificar intencao principal
- Escolher uma categoria principal entre as categorias minimas obrigatorias.
- Definir subtipo quando houver especificidade relevante, como primeira consulta, retorno, reagendamento por conflito, cancelamento tardio ou reclamacao pos-atendimento.

4. Determinar estagio da conversa
- Identificar se a conversa esta em abertura, continuidade, resolucao, bloqueio, pos-atendimento ou escalacao.
- Usar o historico recente para evitar regressao de estagio.

5. Avaliar urgencia
- Classificar urgencia em baixa, media, alta ou critica.
- Sinais de risco clinico, conflito severo, reclamacao sensivel, sofrimento, ameaças ou falha operacional recorrente elevam urgencia.

6. Medir confianca
- Definir nivel de confianca em alta, media ou baixa.
- Confianca baixa exige justificativa curta e, quando aplicavel, recomendacao de obter contexto adicional ou fazer handoff.

7. Decidir proxima acao
- Escolher uma proxima acao operacional segura: responder com orientacao, pedir dado faltante, acionar fluxo interno, encaminhar para scheduling, encaminhar para recepcao/comercial ou fazer handoff humano.
- Nunca recomendar confirmacao de disponibilidade sem consultar a autoridade de scheduling.

8. Decidir handoff
- Marcar handoff como obrigatorio, recomendado ou nao necessario.
- Handoff obrigatorio em urgencia, reclamacao sensivel, ambiguidade relevante, falha de contexto, risco operacional ou fora de escopo relevante.

9. Gerar justificativa auditavel
- Produzir justificativa curta baseada em evidencias observadas na mensagem e no contexto.
- Nao incluir suposicoes nao confirmadas como se fossem fatos.

10. Emitir saida estruturada
- Retornar no formato obrigatorio definido nesta skill.
- Se houver incerteza, explicitar lacuna e impacto na triagem.

## Logica de decisao e branching

- Se houver urgencia alta ou critica: handoff obrigatorio e proxima acao orientada a resposta humana imediata.
- Se houver reclamacao sensivel: handoff obrigatorio, mesmo com intencao aparente clara.
- Se faltar tenant context ou historico minimo: reduzir confianca e preferir handoff ou pedido objetivo de contexto.
- Se a mensagem mencionar agenda: classificar a intencao, mas nao confirmar horario ou disponibilidade.
- Se a mensagem estiver fora de escopo: marcar fora de escopo e recomendar handoff ou orientacao segura.
- Se houver multiplas intencoes: priorizar a que tiver maior risco operacional, urgencia ou impacto no atendimento.

## Formato de saida obrigatoria

Retornar sempre JSON estrito com os seguintes campos:

- intencao_principal
- subtipo_intencao
- estagio_conversa
- urgencia
- nivel_confianca
- proxima_acao_recomendada
- handoff_necessario
- tipo_handoff
- justificativa_auditavel_curta
- fatos_observados
- hipoteses
- lacunas

## Contrato semantico da saida

- intencao_principal: uma das categorias minimas obrigatorias.
- subtipo_intencao: texto curto e objetivo, ou null quando nao aplicavel.
- estagio_conversa: abertura, continuidade, resolucao, bloqueio, pos-atendimento ou escalacao.
- urgencia: baixa, media, alta ou critica.
- nivel_confianca: alta, media ou baixa.
- proxima_acao_recomendada: instrucao operacional clara e segura.
- handoff_necessario: sim ou nao.
- tipo_handoff: humano-imediato, humano-prioritario, humano-padrao ou null.
- justificativa_auditavel_curta: 1 a 3 frases objetivas baseadas em evidencia.
- fatos_observados: lista curta de evidencias textuais ou contextuais.
- hipoteses: lista curta de inferencias ainda nao confirmadas.
- lacunas: lista curta do que falta para decisao mais segura.

## Exemplo de shape de saida

```json
{
	"intencao_principal": "agendamento",
	"subtipo_intencao": "primeira_consulta",
	"estagio_conversa": "abertura",
	"urgencia": "baixa",
	"nivel_confianca": "media",
	"proxima_acao_recomendada": "solicitar dados faltantes e encaminhar consulta de disponibilidade ao scheduling",
	"handoff_necessario": "nao",
	"tipo_handoff": null,
	"justificativa_auditavel_curta": "A mensagem solicita marcacao de consulta, sem sinal de urgencia. Nao ha confirmacao de horario no contexto atual.",
	"fatos_observados": [
		"Paciente pediu para marcar atendimento",
		"Nao ha horario confirmado no contexto"
	],
	"hipoteses": [
		"Pode ser primeira consulta"
	],
	"lacunas": [
		"Falta verificar disponibilidade no scheduling",
		"Falta confirmar dados minimos do paciente"
	]
}
```

## Checklist de qualidade antes de concluir

- A classificacao respeita tenant context e nao inventa dados.
- O resultado nao confirma agenda nem substitui scheduling authority.
- Handoff foi elevado corretamente em urgencia, reclamacao sensivel, ambiguidade ou risco.
- A justificativa e curta, auditavel e baseada em evidencias.
- Fatos, hipoteses e lacunas estao separados.
- A saida esta estruturada para consumo por agente sem ambiguidade.
