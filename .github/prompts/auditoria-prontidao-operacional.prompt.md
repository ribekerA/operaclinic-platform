---
description: "Auditar prontidao operacional de fluxo, modulo, feature ou release em SaaS multi-tenant de clinicas esteticas com foco em tenant isolation, RBAC, scheduling, handoff, observabilidade, concorrencia e rollout real."
name: "Auditoria Prontidao Operacional"
argument-hint: "Informe o fluxo, modulo, feature ou release a ser auditado e inclua contexto tecnico e operacional disponivel."
agent: "agent"
model: "GPT-5 (copilot)"
---
Audite a prontidao operacional do item informado como se fosse uma checagem pre-release ou pre-expansao de automacao.

Escopo de avaliacao:
- isolamento multi-tenant
- backend authority
- scheduling authority
- RBAC e compliance
- handoff humano
- observabilidade
- concorrencia e idempotencia
- rollout, rollback e risco produtivo
- diferenca entre mocks e prontidao real

Instrucoes:
- Nao invente estado do sistema.
- Separar sempre fato, hipotese e lacuna.
- Se houver conflito entre documentacao, backlog e codigo, sinalize drift documental.
- Priorize operacao real e confiabilidade, nao resposta bonita.
- Destaque claramente qualquer bloqueador de producao.

Saida obrigatoria:
- situacao real
- objetivo ideal
- caminho recomendado
- proximos passos praticos
- criterio de sucesso
- bloqueadores de producao
- riscos principais
- evidencias faltantes
