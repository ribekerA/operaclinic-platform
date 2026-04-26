---
name: skill-safe-scheduling-assistant
description: 'Assistente seguro de scheduling para SaaS de clinicas esteticas. Use para transformar intencao de agendamento, remarcacao, cancelamento, confirmacao ou recuperacao de no-show em proxima acao operacional segura, coleta minima de contexto e payloads para o backend sem substituir a autoridade de disponibilidade e conflito.'
argument-hint: 'Informe a intencao, contexto da conversa, dados do paciente, tenant e qualquer retorno do backend de scheduling ja disponivel.'
user-invocable: true
---

# Skill Safe Scheduling Assistant

## Objetivo

Ajudar agentes e recepcao a conduzir agendamento de forma segura, transformando intencao de scheduling em acao operacional preparada para o backend sem substituir a autoridade de disponibilidade, conflito e lifecycle.

## Quando usar

- Quando houver intencao de agendamento, remarcacao, cancelamento, confirmacao ou recuperacao de no-show.
- Quando o agente precisar saber se ja ha contexto suficiente para acionar o modulo de scheduling.
- Quando for necessario organizar dados faltantes e sugerir o proximo passo da conversa.
- Quando houver retorno do backend com janelas disponiveis e for preciso recomendar opcoes sem violar a autoridade do scheduling.
- Para excecoes mais sensiveis de agenda, como cancelamento tardio, conflito persistente, remarcacao sensivel ou no-show com politica incerta, prefira skill-scheduling-exception-governance.

## Regras fixas

- Scheduling backend e a unica autoridade de disponibilidade e conflito.
- Nunca criar appointment fora das regras validas.
- Nunca ignorar slot hold, idempotencia ou lifecycle permitido.
- Se faltar contexto, pedir somente o necessario.
- Se houver conflito, ambiguidade ou falha, encaminhar para handoff ou nova coleta de dados.
- Nunca confirmar disponibilidade sem resposta valida do backend.
- Nunca tratar agente ou recepcao assistida como autoridade de regra critica.
- Respeitar tenant context, RBAC, auditoria e rastreabilidade em toda recomendacao.

## Entradas esperadas

- Intencao operacional atual.
- Contexto da conversa e historico recente.
- Contexto do paciente, se houver.
- Contexto do tenant.
- Dados operacionais ja coletados.
- Retornos anteriores do backend de scheduling, quando existirem.

## Casos cobertos

- agendamento
- remarcacao
- cancelamento
- confirmacao
- recuperacao_de_no_show

## Contexto minimo por tipo de acao

- agendamento: paciente identificado ou identificavel, servico/procedimento, unidade ou contexto equivalente quando aplicavel, preferencia de periodo se existir.
- remarcacao: identificador confiavel do agendamento atual ou contexto suficiente para localizar o appointment correto.
- cancelamento: identificador confiavel do agendamento atual e motivo se exigido pela operacao.
- confirmacao: appointment alvo identificado de forma segura.
- recuperacao_de_no_show: identificacao do caso, status atual e proximo fluxo permitido.

## Defaults de execucao

- Na falta de contexto essencial, bloquear payload final e recomendar coleta objetiva do dado faltante.
- Quando houver retorno parcial do backend, usar apenas o que foi confirmado pelo backend como fato.
- Se houver mais de uma acao plausivel, priorizar a acao de menor risco operacional e maior reversibilidade.
- Em caso de incerteza sobre lifecycle permitido, nao sugerir mutacao final; escalar ou pedir validacao adicional.
- Ao recomendar janelas, apresentar apenas opcoes retornadas pelo backend, sem inferir disponibilidade adicional.
- Em caso de duvida critica sobre lifecycle, hold ou conflito, permitir no maximo payload parcial de leitura ou validacao; nunca payload mutativo final.
- Quando houver preferencia de periodo, unidade, profissional ou recurso informada pelo paciente, usar essa preferencia para ordenar as opcoes retornadas pelo backend.
- Recuperacao de no-show pode seguir fluxo assistido apenas quando politica, contexto e proximo passo permitido estiverem claramente confirmados.

## Procedimento

1. Identificar a intencao operacional
- Confirmar se o caso e agendamento, remarcacao, cancelamento, confirmacao ou recuperacao de no-show.
- Se a intencao vier ambigua, pedir o minimo necessario para desambiguar.

2. Validar contexto e elegibilidade
- Verificar tenant context, identificacao do paciente, dados do fluxo e qualquer restricao operacional conhecida.
- Verificar se o caso possui dados suficientes para preparar intencao ou payload seguro.

3. Determinar status da coleta de contexto
- Classificar como completo, parcial ou insuficiente.
- Listar exatamente quais dados faltam e por que sao necessarios.

4. Validar restricoes criticas de scheduling
- Confirmar se existe dependencia de hold, janela, appointment atual, idempotencia ou lifecycle permitido.
- Se qualquer restricao critica estiver sem evidencias suficientes, bloquear mutacao e recomendar coleta ou handoff.

5. Sugerir proxima acao segura
- Se o contexto estiver insuficiente, recomendar a pergunta minima necessaria.
- Se o contexto estiver adequado para consulta ao backend, recomendar preparo de payload/intencao de leitura ou validacao.
- Se houver conflito, ambiguidade ou falha, recomendar handoff ou nova coleta direcionada.

6. Preparar payload sugerido
- Montar payload ou intencao operacional apenas com dados confirmados.
- Nao incluir campos inventados, defaults nao autorizados ou suposicoes sobre disponibilidade.
- Se o payload nao puder ser montado com seguranca, retornar bloqueio explicito.

7. Recomendar opcoes de janela quando houver retorno do backend
- Organizar janelas confirmadas retornadas pelo backend.
- Priorizar clareza operacional: data, faixa de horario, unidade, profissional ou recurso quando disponivel.
- Quando houver preferencia valida do paciente, ordenar primeiro as janelas aderentes a essa preferencia.
- Nunca sugerir janela nao retornada pelo backend.

8. Cobrir branching por tipo de fluxo
- Agendamento: preparar consulta de disponibilidade ou criacao segura apos retorno valido.
- Remarcacao: validar appointment atual, lifecycle permitido e necessidade de novo hold.
- Cancelamento: validar appointment alvo e restricoes de cancelamento.
- Confirmacao: validar appointment alvo e etapa permitida do lifecycle.
- Recuperacao de no-show: validar se o caso permite reengajamento, remarcacao assistida ou handoff conforme politica confirmada.

9. Decidir bloqueio ou handoff
- Bloquear quando faltar contexto essencial, houver conflito nao resolvido, restricao de lifecycle, falha de backend ou ambiguidade relevante.
- Fazer handoff quando o caso exigir decisao humana, excecao operacional ou tratamento sensivel.

10. Emitir saida estruturada
- Retornar status da coleta de contexto, proxima acao recomendada, dados faltantes, payload sugerido e motivo de bloqueio se houver.
- Separar fatos confirmados, hipoteses e lacunas quando houver risco de interpretacao indevida.

## Logica de decisao e branching

- Se nao houver dados suficientes para localizar o appointment alvo em remarcacao, cancelamento ou confirmacao: bloquear mutacao e pedir identificacao objetiva.
- Se existir retorno do backend com conflito ou indisponibilidade: nao contornar; sugerir nova coleta de preferencia ou handoff.
- Se houver hold expirado, ausente ou inconsistente: nao prosseguir com criacao; solicitar nova validacao ao scheduling.
- Se houver risco de duplicidade ou idempotencia nao garantida: bloquear payload final ate confirmacao operacional.
- Se o lifecycle atual nao suportar a transicao desejada: nao sugerir acao mutativa fora do fluxo permitido.
- Se houver incerteza relevante, limitar a recomendacao a payload de leitura/validacao ou coleta adicional.
- Se o no-show exigir politica especifica nao confirmada: escalar para handoff ou confirmar regra antes de agir.

## Formato de saida obrigatoria

Retornar sempre JSON estrito com os seguintes campos:

- status_coleta_contexto
- proxima_acao_recomendada
- dados_faltantes
- payload_sugerido
- motivo_bloqueio
- fatos_confirmados
- hipoteses
- lacunas

## Contrato semantico da saida

- status_coleta_contexto: completo, parcial ou insuficiente.
- proxima_acao_recomendada: instrucao operacional segura e objetiva.
- dados_faltantes: lista de dados ainda necessarios; lista vazia quando nao houver.
- payload_sugerido: objeto com dados confirmados para o modulo de scheduling, ou null quando bloqueado.
- motivo_bloqueio: texto curto explicando por que nao e seguro prosseguir, ou null quando nao houver bloqueio.
- fatos_confirmados: lista de fatos observados e validados.
- hipoteses: lista de inferencias ainda nao confirmadas.
- lacunas: lista de ausencias relevantes para a decisao.

## Exemplo de shape de saida

```json
{
  "status_coleta_contexto": "parcial",
  "proxima_acao_recomendada": "pedir preferencia de periodo e encaminhar consulta de disponibilidade ao scheduling",
  "dados_faltantes": [
    "preferencia de periodo",
    "confirmacao da unidade de atendimento"
  ],
  "payload_sugerido": {
    "tipo": "consulta_disponibilidade",
    "paciente_id": "patient_123",
    "servico_id": "service_laser",
    "tenant_id": "tenant_a"
  },
  "motivo_bloqueio": null,
  "fatos_confirmados": [
    "Paciente identificado",
    "Servico desejado confirmado"
  ],
  "hipoteses": [
    "Unidade preferencial ainda nao confirmada"
  ],
  "lacunas": [
    "Falta preferencia de periodo para busca mais precisa"
  ]
}
```

## Checklist de qualidade antes de concluir

- Nenhuma disponibilidade foi inventada ou confirmada fora do backend.
- O payload sugerido contem apenas dados confirmados.
- Slot hold, idempotencia e lifecycle foram tratados como restricoes criticas.
- A coleta pediu somente o minimo necessario.
- Conflitos, ambiguidades e falhas geraram bloqueio ou handoff adequado.
- A saida esta pronta para consumo por agente ou recepcao assistida sem ambiguidade.
