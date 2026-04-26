# Pilot Readiness Plan

## Resumo executivo

O projeto ja saiu da fase de prototipo desestruturado e tem base tecnica suficiente para um piloto operacional controlado, mas ainda nao tem evidencia suficiente para um piloto real operado com independencia pela clinica.

O que mais evoluiu no repositorio foi:

- hardening do realtime com autenticacao real de socket e rooms escopadas por tenant
- observabilidade minima por fluxo com readiness, logs estruturados e metricas operacionais
- reforco da concorrencia de scheduling com transacoes serializable, advisory locks e retries
- instrumentacao tenant-scoped de KPIs operacionais para no-show, tempo de resposta e ocupacao
- reminder assincrono minimo 24h antes com opt-out por contato e ledger idempotente

O que ainda bloqueia provar a promessa de valor em piloto real:

- falta validacao ponta a ponta com WhatsApp real em operacao
- falta prova operacional final de scheduling sob timezone real e contencao real
- falta evidencia de que a recepcao consegue operar sem dependencia do founder
- falta evidencia de onboarding em ate 7 dias

Estado consolidado:

- pronto: base de recepcao, scheduling core, handoff humano, observabilidade minima, KPIs essenciais
- parcial: validacao operacional real, follow-up assincrono, onboarding com SLA comprovado, cobertura E2E consolidada
- ausente: evidencia de campo suficiente para assinar Go

## Ativos ja solidos

- Multi-tenant, RBAC e backend authority estao fechados no nucleo do produto.
- Recepcao ja tem dashboard, agenda do dia, busca de disponibilidade, criacao manual, confirmacao, check-in, cancelamento e no-show.
- Scheduling ja possui holds, appointments, historico de status, idempotencia e protecao concorrente no write side.
- Messaging ja possui adapters, webhook inbound, threads, eventos, handoff humano e protecoes de isolamento por tenant.
- Realtime foi endurecido com autenticacao de socket e rooms tenant-scoped.
- Existe observabilidade minima por fluxo com health/readiness, logs estruturados e metricas operacionais por janela.
- Ja existem dados rastreaveis para medir no-show, tempo medio de primeira resposta e ocupacao da agenda por tenant.
- O follow-up assincrono minimo existe de forma conservadora: reminder 24h antes, trigger autenticado, opt-out por contato e ledger idempotente.
- A base de onboarding comercial e provisionamento tecnico do tenant esta implementada e testada.
- A suite backend principal esta verde com boa cobertura dos pontos mais sensiveis.

## Gaps criticos

- WhatsApp real ainda nao foi validado ponta a ponta com provedor em ambiente operacional. O codigo existe; a evidencia de campo nao.
- Scheduling ainda nao pode ser tratado como plenamente comprovado em pilotagem real porque timezone do tenant e contencao real continuam marcados como pendencias de fechamento operacional.
- A recepcao ainda nao foi provada em UAT operacional com time nao-founder executando os fluxos principais de ponta a ponta.
- Onboarding em ate 7 dias ainda nao tem evidencia material no repositorio. Existe o fluxo e a medicao, mas nao a prova do SLA.
- O KPI de interacoes resolvidas sem intervencao humana continua indisponivel por falta de evento explicito de resolucao automatica.
- O reminder assincrono minimo reduz risco, mas ainda nao existe orquestracao madura de cron/queue nem cadencias adicionais de follow-up.
- A cobertura consolidada de fluxos criticos end-to-end ainda segue parcial.

## Backlog de prontidao

1. Validar WhatsApp real com um tenant piloto controlado.
   Saida esperada: inbound, outbound, handoff open/assign/close e reconexao funcionando sem incidente bloqueador.

2. Executar validacao operacional de scheduling em timezone real e com contencao.
   Saida esperada: create, reschedule, cancel, confirm, check-in e no-show sem double-booking, drift de status ou erro de timezone.

3. Rodar UAT de recepcao com operador nao-founder.
   Saida esperada: agenda do dia, criacao manual, remarcacao, cancelamento, confirmacao, check-in, no-show e inbox/handoff executados sem intervencao de quem construiu o produto.

4. Provar onboarding em ate 7 dias.
   Saida esperada: pelo menos um onboarding real ou simulado com processo operacional completo e timestamps auditaveis do inicio ao tenant ativo.

5. Ligar leitura executiva dos KPIs por tenant no ritmo do piloto.
   Saida esperada: revisao periodica de no-show, tempo de primeira resposta e ocupacao sem consulta ad hoc a banco.

6. Ativar reminder 24h antes com orquestracao externa simples e auditavel.
   Saida esperada: cron externo autenticado, leitura do ledger de dispatch e protocolo humano de fallback.

Nao fazer agora:

- nao expandir o dominio para pacotes, sessoes, consentimentos, antes/depois e pos-procedimento
- nao construir fila/worker complexa antes de validar o reminder minimo em operacao
- nao ampliar automacao agressiva de mensagens ou follow-ups multietapa
- nao priorizar app do profissional como bloqueador do piloto de recepcao
- nao abrir rollout amplo de agents antes de evidencias reais de handoff e observabilidade em campo
- nao investir agora em agenda por sala/equipamento ou dashboards avancados de nicho

## Criterios de piloto

| Criterio | Status | Leitura operacional |
| --- | --- | --- |
| Onboarding em ate 7 dias | AMARELO | fluxo existe e e medido, mas o SLA nao esta provado |
| Recepcao opera fluxos principais sem founder | AMARELO | base funcional existe, mas ainda falta UAT operacional real |
| Scheduling confiavel nos fluxos reais | VERMELHO | base tecnica forte, mas ainda sem prova final em timezone/carga reais |
| Mensageria com handoff estavel | VERMELHO | handoff e webhook estao implementados, mas falta validacao real com provedor |
| Observabilidade minima por fluxo | VERDE | readiness, logs estruturados e metricas ja existem |
| Dados suficientes para medir no-show, resposta e ocupacao | VERDE | KPI snapshot tenant-scoped ja existe e e rastreavel |

Leitura contra a promessa de valor:

- reduzir perda operacional em agenda e recepcao: parcial; a base existe, mas ainda falta prova de operacao independente e scheduling validado em campo
- diminuir no-show: parcial; ha KPI e reminder minimo, mas ainda nao ha evidencia de impacto real
- acelerar resposta: parcial; ha inbox, handoff e medicao de primeira resposta, mas ainda falta prova com provedor real
- tornar a operacao mais previsivel: parcial; observabilidade e readiness existem, mas a previsibilidade ainda nao esta demonstrada em piloto real

## Decisao Go / Go com ressalvas / No-Go

Decisao atual: NO-GO para piloto real operado pela clinica sem dependencia do founder.

Justificativa objetiva:

- os dois pilares mais sensiveis para um piloto real ainda estao incompletos no criterio de evidencia: scheduling em fluxos reais e mensageria com provedor real
- a operacao de recepcao parece tecnicamente proxima, mas ainda nao esta provada com time nao-founder
- onboarding tem trilha auditavel, mas ainda nao ha prova de SLA de ate 7 dias

Condicao minima para sair de No-Go:

- validar WhatsApp real ponta a ponta
- validar scheduling em operacao controlada real
- executar UAT operacional de recepcao
- fechar evidencia de onboarding dentro do prazo alvo

Condicao para Go com ressalvas:

- os quatro itens acima atendidos
- reminder 24h antes ativado de forma conservadora
- revisao diaria dos KPIs do piloto com fallback humano explicito

Condicao para Go pleno:

- uma janela inicial de piloto transcorrida sem incidente bloqueador
- evidencia de queda de atrito operacional ou, no minimo, medicao estavel dos KPIs basicos
- operacao tocada pelo time da clinica sem dependencia estrutural do founder
