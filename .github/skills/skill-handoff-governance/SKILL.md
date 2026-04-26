---
name: skill-handoff-governance
description: 'Governanca de handoff humano para operacao de clinica estetica. Use para decidir se uma thread pode permanecer automatizada ou deve escalar para humano com prioridade, motivo operacional, resumo auditavel e recomendacao de SLA.'
argument-hint: 'Informe a thread atual, contexto do tenant, contexto do paciente, historico recente e sinais de risco ou falha.'
user-invocable: true
---

# Skill Handoff Governance

## Objetivo

Aplicar politica de escalonamento humano na operacao clinica para definir quando uma thread pode permanecer automatizada e quando deve ser enviada para atendimento humano com prioridade, justificativa e contexto operacional claro.

## Quando usar

- Quando houver duvida se uma thread pode seguir em automacao assistida.
- Quando for necessario decidir handoff apos triagem, scheduling assistido ou falha operacional.
- Quando houver sinais de sensibilidade, urgencia, baixa confianca ou contexto insuficiente.
- Quando for preciso impedir fechamento indevido de casos sensiveis.

## Regras fixas

- Respeitar contexto do tenant e do paciente em toda decisao.
- Nunca fechar caso sensivel sem politica valida de handoff.
- Nunca manter automacao quando houver urgencia, risco operacional relevante ou baixa confianca sem mitigacao.
- Nao inventar contexto inexistente; separar fatos, hipoteses e lacunas.
- Escalonar quando houver falha de integracao, conflito de agenda, bloqueio comercial/financeiro ou ausencia persistente de contexto suficiente.
- Registrar motivo operacional claro e auditavel para qualquer handoff.
- Nao permitir que a automacao contorne regras criticas do backend ou do scheduling.

## Entradas esperadas

- Thread atual.
- Historico recente da conversa.
- Contexto do tenant.
- Contexto do paciente, se houver.
- Classificacao previa da intencao, se existir.
- Sinais de falha, bloqueio ou risco operacional.

## Criterios minimos de handoff

- urgencia
- reclamacao sensivel
- duvida fora de escopo
- falha de integracao
- baixa confianca da classificacao
- conflito de agenda
- bloqueio comercial/financeiro
- ausencia de contexto suficiente apos tentativas razoaveis

## Defaults de execucao

- Na presenca de qualquer criterio minimo critico, priorizar handoff sobre continuidade automatizada.
- Se houver mais de um risco concorrente, usar o risco de maior severidade para definir prioridade.
- Em caso de duvida entre continuar automatizado ou escalar, preferir escalonamento seguro.
- Se a automacao puder continuar, isso deve estar sustentado por contexto suficiente, baixa ambiguidade e baixo risco operacional.
- Casos sensiveis nao podem ser encerrados automaticamente apenas por ausencia de nova mensagem do paciente.
- Mesmo quando handoff for nao, o motivo pode registrar sinal prospectivo de escalonamento se o risco evoluir ou se novas lacunas aparecerem.
- Na ausencia de urgencia explicita, reclamacao sensivel ou falha operacional relevante devem tender a SLA ate_15_min.
- Continuidade automatizada nao autoriza fechamento definitivo do caso sem confirmacao valida do fluxo correspondente.

## Procedimento

1. Consolidar contexto operacional
- Reunir thread, historico, tenant, paciente, classificacao anterior e sinais de falha.
- Verificar se ha contexto suficiente para decidir sem inventar estado.

2. Identificar sinais de severidade e risco
- Avaliar urgencia, sensibilidade, impacto no atendimento, risco financeiro/comercial, conflito de agenda e falha tecnica.
- Marcar explicitamente quais sinais sao fatos e quais ainda sao hipotese.

3. Verificar criterios minimos de handoff
- Checar cada criterio minimo exigido por esta skill.
- Se qualquer criterio estiver presente com evidencia suficiente, marcar handoff como sim ou, no minimo, recomendado com prioridade correspondente.

4. Avaliar suficiência da automacao
- Confirmar se a thread pode continuar automatizada sem violar backend authority, scheduling authority, RBAC ou guardrails de handoff.
- Se houver baixa confianca, ambiguidade relevante ou contexto insuficiente apos tentativas razoaveis, interromper continuidade automatizada.

5. Determinar prioridade do handoff
- Classificar prioridade em critica, alta, media ou baixa.
- Urgencia, reclamacao sensivel com impacto relevante, falha severa e risco de dano operacional elevam prioridade.

6. Justificar a decisao
- Registrar motivo operacional claro, curto e auditavel.
- Explicar por que a thread deve escalar ou por que pode permanecer automatizada com seguranca.
- Quando handoff for nao, registrar no motivo qualquer condicao objetiva que deve disparar futuro escalonamento.

7. Preparar resumo para atendente humano
- Consolidar contexto util para continuidade do atendimento.
- Incluir apenas fatos confirmados, riscos observados e lacunas relevantes.

8. Recomendar SLA
- Sugerir SLA de resposta humana conforme prioridade e impacto operacional.
- Quando houver urgencia ou risco critico, recomendar SLA imediato.

9. Bloquear fechamento indevido
- Se o caso for sensivel, ambiguo ou incompleto, impedir recomendacao de encerramento.
- So permitir continuidade automatizada quando houver base operacional segura.
- Mesmo com risco baixo, manter o caso em acompanhamento do fluxo ate confirmacao valida de conclusao; nao recomendar fechamento definitivo por padrao.

10. Emitir saida estruturada
- Retornar handoff sim/nao, prioridade, motivo, resumo para atendente humano e recomendacao de SLA.
- Separar fatos, hipoteses e lacunas quando houver relevancia para auditoria ou continuidade.

## Logica de decisao e branching

- Se houver urgencia: handoff sim com prioridade critica ou alta, conforme impacto.
- Se houver reclamacao sensivel: handoff sim, mesmo que a intencao principal pareca clara.
- Se houver duvida fora de escopo: handoff sim ou recomendacao de coleta minima seguida de handoff, conforme risco.
- Se houver falha de integracao: handoff sim quando a falha bloquear continuidade segura ou gerar risco de experiencia/operacao.
- Se houver baixa confianca da classificacao: handoff sim ou coleta adicional limitada; nunca fechamento automatico.
- Se houver conflito de agenda: handoff ou nova consulta segura ao scheduling, sem improviso operacional.
- Se houver bloqueio comercial/financeiro: handoff para equipe ou fluxo humano responsavel.
- Se nao houver contexto suficiente apos tentativas razoaveis: handoff sim com resumo das tentativas realizadas.

## Formato de saida obrigatoria

Retornar sempre JSON estrito com os seguintes campos:

- handoff
- prioridade
- motivo
- resumo_para_humano
- recomendacao_sla
- fatos_confirmados
- hipoteses
- lacunas

## Contrato semantico da saida

- handoff: sim ou nao.
- prioridade: critica, alta, media ou baixa.
- motivo: texto curto com racional operacional do escalonamento ou da permanencia automatizada.
- resumo_para_humano: resumo objetivo para continuidade do atendimento, ou null quando handoff for nao.
- recomendacao_sla: imediato, ate_15_min, ate_1_hora, mesmo_turno ou fila_padrao.
- fatos_confirmados: lista de sinais e evidencias confirmadas.
- hipoteses: lista de inferencias ainda nao confirmadas.
- lacunas: lista do que ainda falta para decidir ou operar com seguranca.

## Exemplo de shape de saida

```json
{
  "handoff": "sim",
  "prioridade": "alta",
  "motivo": "Ha reclamacao sensivel com baixa confianca para resolucao automatizada e risco de agravamento da experiencia.",
  "resumo_para_humano": "Paciente relata insatisfacao com atendimento anterior e pede retorno urgente. Nao ha contexto suficiente para resolucao segura por automacao.",
  "recomendacao_sla": "ate_15_min",
  "fatos_confirmados": [
    "Mensagem contem reclamacao sensivel",
    "Nao ha contexto completo do caso anterior"
  ],
  "hipoteses": [
    "Pode haver impacto reputacional se a resposta atrasar"
  ],
  "lacunas": [
    "Falta historico completo do atendimento citado"
  ]
}
```

## Checklist de qualidade antes de concluir

- A decisao respeita tenant context e contexto do paciente.
- Casos sensiveis nao foram marcados para fechamento indevido.
- Handoff foi acionado nos criterios minimos obrigatorios quando aplicavel.
- A justificativa esta curta, auditavel e operacional.
- O resumo para humano contem apenas o necessario para continuidade segura.
- A recomendacao de SLA condiz com severidade e risco.
