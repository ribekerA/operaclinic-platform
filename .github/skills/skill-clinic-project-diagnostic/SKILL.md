---
name: skill-clinic-project-diagnostic
description: 'Diagnostico operacional e tecnico continuo para SaaS multi-tenant de clinicas esteticas. Use para mapear modulos/fluxos/regras, detectar drift documental, separar fato-hipotese-lacuna, encontrar gargalos/riscos e definir oportunidades de IA com limites de autoridade.'
argument-hint: 'Informe foco, escopo e nivel de profundidade do diagnostico (ex.: scheduling e mensageria, visao executiva + tecnica).'
user-invocable: true
---

# Skill Clinic Project Diagnostic

## Objetivo

Executar diagnostico operacional e tecnico continuo de um projeto SaaS multi-tenant de clinicas esteticas com foco em operacao real, seguranca, governanca e prontidao produtiva.

## Quando usar

- Quando precisar entender estado real do projeto versus objetivo operacional.
- Quando houver sinais de inconsistencias entre codigo, backlog e documentacao.
- Quando for necessario priorizar estabilizacao antes de expandir automacao por agentes e skills.
- Quando houver duvida sobre maturidade de scheduling, mensageria, handoff, recepcao e comercial.

## Regras fixas

- Nao inventar informacao.
- Sinalizar ambiguidade explicitamente.
- Tratar scheduling como nucleo critico (disponibilidade, hold, lifecycle, conflito).
- Considerar mensageria, handoff, recepcao e comercial como fluxos prioritarios.
- Destacar sempre problemas de observabilidade, concorrencia, rollout real e seguranca realtime.
- Nunca tratar agente como autoridade de regra de negocio.

## Entradas minimas esperadas

- Estrutura do repositorio e modulos (apps, packages, integracoes).
- Documentacao funcional e tecnica (README, docs, planos e runbooks).
- Backlog, tarefas de sprint, checklists e evidencias de entrega.
- Artefatos de testes, configuracoes de runtime e sinais de operacao.

## Defaults de execucao

- Profundidade padrao: profunda (arquitetural), quando o prompt nao especificar.
- Cadencia recomendada para diagnostico continuo: por release relevante.
- Na falta de evidencia forte, permitir recomendacao condicionada apenas se rotulada como hipotese, com riscos e validacoes pendentes.

## Procedimento

1. Delimitar o escopo do diagnostico
- Defina objetivo, dominio principal e horizonte temporal (snapshot ou continuo).
- Estabeleca criterios de sucesso e limite de profundidade.

2. Levantar contexto e fontes confiaveis
- Ler documentacao, backlog e estrutura de modulos antes de concluir qualquer julgamento.
- Identificar quais fontes estao atualizadas, parciais ou potencialmente obsoletas.

3. Mapear visao funcional e operacional
- Mapear entidades de negocio, fluxos de ponta a ponta e regras de autoridade.
- Mapear fluxos prioritarios: recepcao, mensageria, scheduling, handoff e comercial.
- Identificar pontos de decisao humana versus automatizada.

4. Mapear arquitetura tecnica e integracoes
- Mapear boundaries entre backend, web, agentes e canais externos (ex.: WhatsApp).
- Verificar onde estao RBAC, isolamento de tenant, auditoria e trilhas de rastreabilidade.
- Verificar pontos criticos de concorrencia, idempotencia, retries e consistencia.

5. Detectar drift documental
- Comparar documentacao, backlog e implementacao observada.
- Marcar explicitamente cada divergencia com impacto operacional e risco.

6. Separar fato, hipotese e lacuna
- Fato: evidencia direta em codigo, docs consistentes ou testes confiaveis.
- Hipotese: inferencia plausivel sem confirmacao suficiente.
- Lacuna: informacao critica ausente para decisao segura.

7. Diagnosticar gargalos e riscos
- Classificar gargalos em: operacional, tecnico e governanca.
- Priorizar por severidade, frequencia e impacto em receita, atendimento e confiabilidade.
- Sempre explicitar riscos de observabilidade, seguranca realtime, concorrencia e rollout.

8. Avaliar aptidao para IA
- Marcar como apto apenas onde houver repeticao, previsibilidade, regra clara e contexto suficiente.
- Marcar como nao apto onde houver alta ambiguidade, risco regulatorio, decisao sensivel ou baixa observabilidade.
- Definir gatilhos de handoff humano para todos os pontos fora de escopo.

9. Definir pre-requisitos para expansao segura de agentes e skills
- Cobertura minima de logs, metricas e alertas.
- Guardrails de RBAC e tenant context validados.
- Politicas de handoff e escalonamento operacional formalizadas.
- Estrategia de rollout canario, rollback e monitoramento de regressao.

10. Produzir entrega obrigatoria
- Entregar no formato de saida definido nesta skill.
- Declarar claramente confianca por secao e pendencias criticas.
- Se houver recomendacao condicionada, incluir criterio objetivo de validacao para conversao de hipotese em fato.

## Formato de saida obrigatoria

1. Resumo executivo
- Estado atual, principais achados e impacto operacional.

2. Mapa funcional
- Modulos, entidades, regras de negocio e dependencias.

3. Mapa operacional
- Fluxos prioritarios (recepcao, mensageria, scheduling, handoff, comercial) com pontos de risco.

4. Arquitetura tecnica
- Componentes, fronteiras, integracoes, autoridade de regras e pontos de consistencia.

5. Gargalos
- Gargalos operacionais, tecnicos e de governanca com severidade e impacto.

6. Riscos
- Riscos de seguranca, observabilidade, concorrencia, rollout e estabilidade produtiva.

7. Oportunidades de automacao
- O que pode receber IA com seguranca, guardrails e limites.

8. Pre-requisitos para expansao segura de agentes e skills
- O que precisa estabilizar antes de ampliar automacao.

## Checklist de qualidade antes de concluir

- Todas as afirmacoes estao marcadas como fato, hipotese ou lacuna.
- O scheduling foi tratado como nucleo critico em todo o diagnostico.
- Drift documental foi detectado e descrito com impacto.
- Riscos de observabilidade, concorrencia, rollout real e seguranca realtime foram explicitados.
- Recomendacoes de IA respeitam limites de autoridade e handoff humano.
- Nao ha recomendacao que quebre isolamento multi-tenant ou RBAC.
