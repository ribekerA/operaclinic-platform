---
name: skill-scheduling-exception-governance
description: 'Governanca de excecoes de agenda para SaaS de clinicas esteticas. Use para tratar no-show, cancelamento tardio, remarcacao sensivel, conflito de agenda e excecoes operacionais sem violar authority do scheduling ou lifecycle permitido.'
argument-hint: 'Informe o caso de excecao de agenda, contexto do appointment, tenant, historico recente e qualquer retorno ja confirmado pelo backend de scheduling.'
user-invocable: true
---

# Skill Scheduling Exception Governance

## Objetivo

Tratar excecoes operacionais de agenda de forma segura, principalmente no-show, cancelamento tardio, conflito de agenda, remarcacao sensivel e outros desvios do fluxo normal, sem substituir a autoridade do backend de scheduling.

## Quando usar

- Quando houver no-show ou tentativa de recuperacao de no-show.
- Quando houver cancelamento tardio, conflito de agenda ou remarcacao com risco operacional.
- Quando o lifecycle permitido do appointment estiver sob duvida.
- Quando o caso exigir decidir entre continuidade assistida, bloqueio ou handoff.

## Regras fixas

- Scheduling backend continua sendo a unica autoridade de disponibilidade, conflito e lifecycle.
- Nunca contornar hold, idempotencia, restricoes de cancelamento ou transicoes de estado validas.
- Nunca inventar politica de no-show, multa, tolerancia, janela ou excecao.
- Se a politica aplicavel nao estiver confirmada, tratar como lacuna critica.
- Em caso de risco financeiro, reclamacao sensivel, conflito persistente ou ambiguidade relevante, escalar para humano.
- Separar sempre fatos, hipoteses e lacunas.

## Casos cobertos

- no_show
- recuperacao_no_show
- cancelamento_tardio
- conflito_agenda
- remarcacao_sensivel
- excecao_operacional_agenda

## Defaults de execucao

- Na duvida sobre lifecycle, bloquear mutacao final e permitir no maximo leitura, validacao ou handoff.
- Se a excecao envolver impacto financeiro, reputacional ou experiencia sensivel, elevar prioridade de handoff.
- Se houver politica clara e contexto suficiente, permitir recomendacao assistida de proximo passo sem confirmar disponibilidade fora do backend.
- Se o caso depender de regra local da clinica nao confirmada, nao assumir excecao como permitida.

## Procedimento

1. Consolidar contexto do caso
- Reunir appointment alvo, historico, tenant, sinais do paciente, politica conhecida e retorno do scheduling.
- Verificar se o appointment correto foi identificado com seguranca.

2. Classificar o tipo de excecao
- Determinar se o caso e no_show, recuperacao_no_show, cancelamento_tardio, conflito_agenda, remarcacao_sensivel ou outra excecao operacional.
- Se houver mais de uma excecao, priorizar a de maior risco operacional.

3. Validar policy e lifecycle
- Confirmar se a politica aplicavel e o lifecycle permitido estao claros.
- Se faltar regra confirmada, marcar bloqueio ou handoff.

4. Identificar impacto operacional
- Avaliar impacto em agenda, paciente, recepcao, financeiro, reputacao e workload humano.
- Marcar severidade do caso.

5. Determinar proxima acao segura
- Escolher entre coleta adicional, consulta ao scheduling, orientacao assistida, bloqueio ou handoff.
- Nunca recomendar disponibilidade, remarcacao final ou cancelamento final sem base do backend.

6. Preparar payload ou intencao segura
- Montar apenas payload de leitura, validacao ou mutacao permitida se houver evidencia suficiente.
- Se nao houver seguranca, retornar payload nulo e motivo de bloqueio.

7. Definir handoff e prioridade
- Escalar quando houver politica incerta, conflito persistente, sensibilidade financeira, reclamacao ou baixa confianca relevante.
- Classificar prioridade em critica, alta, media ou baixa.

8. Emitir saida estruturada
- Retornar tipo de excecao, proxima acao, bloqueio, payload sugerido, handoff, prioridade e justificativa.
- Separar fatos, hipoteses e lacunas.

## Logica de decisao e branching

- Se houver no_show sem politica confirmada: handoff ou bloqueio com validacao obrigatoria.
- Se houver recuperacao de no_show com politica clara: permitir proximo passo assistido, sem inventar disponibilidade.
- Se houver cancelamento tardio com regra financeira sensivel: handoff humano e bloqueio de promessa ao paciente.
- Se houver conflito de agenda sem resolucao segura: nao improvisar; consultar scheduling ou escalar.
- Se houver remarcacao sensivel com risco reputacional ou recorrencia de falha: elevar prioridade.
- Se o appointment alvo nao estiver inequivocamente identificado: bloquear mutacao e pedir contexto minimo.

## Formato de saida obrigatoria

Retornar sempre JSON estrito com os seguintes campos:

- tipo_excecao
- severidade
- proxima_acao_recomendada
- payload_sugerido
- motivo_bloqueio
- handoff_necessario
- prioridade_handoff
- justificativa_auditavel_curta
- fatos_confirmados
- hipoteses
- lacunas

## Contrato semantico da saida

- tipo_excecao: no_show, recuperacao_no_show, cancelamento_tardio, conflito_agenda, remarcacao_sensivel ou excecao_operacional_agenda.
- severidade: baixa, media, alta ou critica.
- proxima_acao_recomendada: instrucao operacional segura para o caso.
- payload_sugerido: objeto seguro para leitura, validacao ou mutacao permitida; null quando bloqueado.
- motivo_bloqueio: texto curto com a razao operacional do bloqueio; null quando nao houver.
- handoff_necessario: sim ou nao.
- prioridade_handoff: critica, alta, media, baixa ou null.
- justificativa_auditavel_curta: 1 a 3 frases com racional operacional.
- fatos_confirmados: lista de evidencias validadas.
- hipoteses: lista de inferencias ainda nao confirmadas.
- lacunas: lista do que falta para decidir ou agir com seguranca.

## Exemplo de shape de saida

```json
{
  "tipo_excecao": "cancelamento_tardio",
  "severidade": "alta",
  "proxima_acao_recomendada": "bloquear confirmacao ao paciente e escalar para recepcao humana validar politica aplicavel antes de qualquer promessa",
  "payload_sugerido": null,
  "motivo_bloqueio": "A politica de cancelamento tardio aplicavel nao esta confirmada e ha potencial impacto financeiro.",
  "handoff_necessario": "sim",
  "prioridade_handoff": "alta",
  "justificativa_auditavel_curta": "O caso envolve cancelamento tardio com possivel implicacao financeira e regra nao confirmada no contexto atual.",
  "fatos_confirmados": [
    "Paciente quer cancelar em cima da hora",
    "Nao ha politica confirmada no contexto"
  ],
  "hipoteses": [
    "Pode haver cobranca ou penalidade associada"
  ],
  "lacunas": [
    "Falta confirmar politica local de cancelamento tardio",
    "Falta validar lifecycle atual do appointment"
  ]
}
```

## Checklist de qualidade antes de concluir

- Nenhuma excecao foi tratada como permitida sem politica confirmada.
- Nenhuma disponibilidade foi inventada.
- Hold, idempotencia e lifecycle foram respeitados.
- Casos sensiveis ou com impacto financeiro receberam handoff apropriado.
- Fatos, hipoteses e lacunas estao separados.
- A saida esta pronta para consumo por agent ou recepcao sem ambiguidade.
