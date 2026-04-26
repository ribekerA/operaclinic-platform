---
name: skill-commercial-qualification
description: 'Qualificacao comercial para SaaS de clinicas esteticas. Use para classificar lead, etapa do funil, prontidao de onboarding, bloqueios de compra, risco comercial e proxima acao segura sem assumir confirmacoes financeiras ou de ativacao fora do fluxo oficial.'
argument-hint: 'Informe a mensagem do lead ou cliente, contexto da thread, tenant, etapa comercial atual e qualquer validacao operacional ja disponivel.'
user-invocable: true
---

# Skill Commercial Qualification

## Objetivo

Qualificar leads e oportunidades comerciais no contexto de um SaaS multi-tenant para clinicas esteticas, determinando etapa do funil, prontidao de onboarding, bloqueios de compra e proxima acao segura sem prometer pagamento, ativacao ou integracao nao confirmados.

## Quando usar

- Quando houver conversa comercial ou onboarding inicial com lead ou cliente.
- Quando for necessario identificar maturidade da oportunidade e proximo passo do funil.
- Quando houver bloqueios de decisao, duvidas operacionais, sensibilidade financeira ou sinais de risco comercial.
- Quando o agente comercial precisar decidir se pode continuar o fluxo ou deve escalar para humano.

## Regras fixas

- Nao confirmar pagamento por conta propria.
- Nao prometer ativacao sem confirmacao real no fluxo oficial.
- Nao tratar webhook, integracao parcial ou evento isolado como verdade absoluta.
- Nao inventar porte, budget, decisor, prazo ou readiness operacional.
- Separar sempre fatos, hipoteses e lacunas.
- Escalar quando houver tema financeiro sensivel, excecao operacional, baixa confianca relevante ou bloqueio persistente.
- Respeitar tenant context, rastreabilidade e politicas comerciais vigentes.

## Entradas esperadas

- Mensagem atual do lead ou cliente.
- Historico recente da thread.
- Contexto do tenant, se houver.
- Etapa comercial atual, se conhecida.
- Evidencias operacionais validas ja disponiveis.

## Eixos de qualificacao

- perfil da clinica
- dor principal
- urgencia de adocao
- maturidade operacional
- prontidao para onboarding
- risco comercial
- bloqueios de decisao
- sensibilidade financeira

## Defaults de execucao

- Na falta de evidencias fortes, manter qualificacao condicionada e explicitar lacunas.
- Em caso de ambiguidade entre interesse inicial e onboarding real, priorizar classificacao mais conservadora.
- Se houver bloqueio financeiro ou promessa de ativacao em risco, preferir handoff humano.
- Pedir somente o contexto minimo necessario para avancar uma etapa do funil.
- So marcar prontidao de onboarding quando houver sinais suficientes de decisor, necessidade, fit operacional e proximo passo claro.

## Procedimento

1. Consolidar contexto comercial
- Reunir mensagem atual, historico, etapa conhecida e validacoes disponiveis.
- Identificar se o caso e lead inicial, follow-up, negociacao, pre-onboarding ou onboarding em curso.

2. Extrair sinais de qualificacao
- Identificar dor, urgencia, interesse, perfil de uso, maturidade da clinica, objecoes e sinais de decisao.
- Marcar o que e fato textual versus inferencia.

3. Classificar etapa do funil
- Classificar em descoberta, qualificacao, proposta, negociacao, pre-onboarding, onboarding ou bloqueado.
- Se a etapa nao estiver clara, registrar menor confianca e o dado minimo necessario para confirmar.

4. Avaliar prontidao de onboarding
- Verificar se ja existem sinais suficientes de interesse validado, contexto operacional minimo e possibilidade de avancar.
- Se faltarem decisor, escopo, validacao comercial ou condicoes operacionais basicas, nao marcar onboarding como pronto.

5. Identificar bloqueios e riscos
- Detectar bloqueio comercial, financeiro, operacional, integracao, alinhamento interno ou falta de contexto.
- Classificar severidade do bloqueio e impacto no avanço.

6. Determinar proxima acao segura
- Escolher entre responder duvida, pedir informacao minima, propor proximo passo comercial, registrar bloqueio ou escalar para staff.
- Nunca confirmar estados financeiros ou de ativacao sem validacao real.

7. Definir necessidade de handoff
- Escalar quando houver baixa confianca relevante, bloqueio persistente, tema financeiro sensivel, promessa de ativacao em risco ou excecao fora de escopo.
- Se nao houver handoff, deixar claro qual condicao deve disparar escalonamento futuro.

8. Emitir saida estruturada
- Retornar qualificacao, etapa do funil, bloqueios, proxima acao, necessidade de handoff e justificativa auditavel.
- Separar fatos, hipoteses e lacunas.

## Logica de decisao e branching

- Se a conversa for exploratoria e sem contexto suficiente: classificar como descoberta ou qualificacao inicial e pedir o minimo necessario.
- Se houver forte fit, dor clara e proximo passo comercial definido: avancar etapa com qualificacao condicional ou confirmada, conforme evidencia.
- Se houver tema financeiro sensivel: handoff humano ou bloqueio ate validacao segura.
- Se houver expectativa de ativacao imediata sem base oficial: nao confirmar; registrar risco e escalar se necessario.
- Se houver integracao parcial ou webhook isolado sendo usado como prova de prontidao: tratar como evidencia parcial e nao como estado final.
- Se houver bloqueio interno da clinica ou ausencia de decisor: manter fluxo comercial, mas nao avancar onboarding como pronto.

## Formato de saida obrigatoria

Retornar sempre JSON estrito com os seguintes campos:

- etapa_funil
- nivel_qualificacao
- prontidao_onboarding
- bloqueios
- risco_comercial
- proxima_acao_recomendada
- handoff_necessario
- justificativa_auditavel_curta
- fatos_confirmados
- hipoteses
- lacunas

## Contrato semantico da saida

- etapa_funil: descoberta, qualificacao, proposta, negociacao, pre-onboarding, onboarding ou bloqueado.
- nivel_qualificacao: alta, media, baixa ou condicional.
- prontidao_onboarding: pronto, parcial ou nao_pronto.
- bloqueios: lista objetiva de bloqueios comerciais, financeiros ou operacionais.
- risco_comercial: baixo, medio, alto ou critico.
- proxima_acao_recomendada: instrucao operacional segura para avancar o caso.
- handoff_necessario: sim ou nao.
- justificativa_auditavel_curta: 1 a 3 frases com racional operacional da decisao.
- fatos_confirmados: lista de evidencias confirmadas.
- hipoteses: lista de inferencias ainda nao confirmadas.
- lacunas: lista do que falta para avancar com seguranca.

## Exemplo de shape de saida

```json
{
  "etapa_funil": "qualificacao",
  "nivel_qualificacao": "condicional",
  "prontidao_onboarding": "parcial",
  "bloqueios": [
    "Decisor final ainda nao confirmado"
  ],
  "risco_comercial": "medio",
  "proxima_acao_recomendada": "coletar perfil operacional da clinica e confirmar quem aprova implantacao antes de avancar para pre-onboarding",
  "handoff_necessario": "nao",
  "justificativa_auditavel_curta": "Ha interesse claro e dor operacional identificada, mas ainda faltam confirmacoes de decisor e readiness para onboarding.",
  "fatos_confirmados": [
    "Lead relata problema com recepcao e WhatsApp",
    "Ha interesse em demonstracao e onboarding"
  ],
  "hipoteses": [
    "Clinica pode estar pronta para onboarding apos validacao do decisor"
  ],
  "lacunas": [
    "Falta confirmar responsavel pela contratacao",
    "Falta confirmar janela de implantacao"
  ]
}
```

## Checklist de qualidade antes de concluir

- Nenhum status financeiro ou de ativacao foi inventado.
- A etapa do funil e a prontidao de onboarding estao sustentadas por evidencia suficiente.
- Bloqueios comerciais, financeiros e operacionais foram explicitados.
- O handoff foi acionado nos casos sensiveis ou fora de escopo.
- Fatos, hipoteses e lacunas estao separados.
- A saida esta pronta para consumo por agente comercial sem ambiguidade.
