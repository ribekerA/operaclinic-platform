# Command Center Architecture

## Objetivo

A torre de controle deixa de ser apenas um dashboard e passa a ser a camada unificada de decisao do super admin.

Ela precisa responder rapidamente:

- o sistema esta saudavel
- os tenants estao performando
- a receita esta sustentando o negocio
- a operacao esta previsivel
- os agentes estao ajudando ou atrapalhando
- o produto esta evoluindo ou travado

## Estrutura definitiva

### Nivel 1 — Perspectiva geral

Entrada padrao:

- `/platform` = `Command Center Overview`

### Nivel 2 — Dominios da torre

Dominios primarios:

1. Overview
2. Operations
3. Growth
4. SEO
5. Market Intelligence
6. Finance
7. Tenants
8. Agents & Skills
9. Reliability
10. Product Control

Camada sintetica:

- CEO Mode

### Nivel 3 — Evolucao continua

A torre precisa impedir inercia. Por isso, a arquitetura considera:

- backlog vivo
- metas semanais
- riscos e alertas
- recomendacao da proxima acao
- score de evolucao do produto
- score de execucao operacional

## Regra de entrada por dominio

- `ativo`: modulo com fonte confiavel e rastreavel
- `parcial`: navegacao e leitura existem, mas score ainda nao fecha
- `planejado`: dominio fixado na IA, ainda sem sinais suficientes

## Estado atual

### Ativo agora

- Overview
- Tenants

### Parcial agora

- Operations
- Finance
- Agents & Skills
- Reliability
- Product Control

### Planejado

- Growth
- SEO
- Market Intelligence
- CEO Mode

## O que a arquitetura fixa agora

- `/platform` continua como entrada do super admin e passa a ser explicitamente o overview da torre
- a sidebar do `platform` reflete os dominios definitivos
- modulos ainda sem dado real entram com empty state util e criterio de ativacao explicito
- paginas auxiliares legadas (`/platform/payments`, `/platform/plans`, `/platform/users`) continuam acessiveis, mas deixam de ser a navegacao principal

## O que nao deve ser feito agora

- nao inventar score sem dado sustentavel
- nao misturar growth, SEO ou intelligence com cards decorativos
- nao colapsar reliability com operations
- nao abrir CEO Mode com dados incompletos

## Fontes reais ja disponiveis

- `platform/dashboard`
- `health/readiness`
- `clinic/operational-kpis`
- onboarding comercial
- recepcao
- scheduling
- mensageria/handoff

## Ajustes obrigatorios da proxima camada

1. agregar KPIs de `clinic/operational-kpis` na torre por tenant
2. centralizar metricas do agent layer no control plane
3. persistir historico de risco operacional hoje mantido em memoria
4. conectar backlog, bugs e rollout para Product Control real
5. conectar funil e origem de lead para Growth real

## Criterio de sucesso

A torre esta correta quando o super admin consegue, em menos de 3 minutos:

- entender a saude geral do sistema
- identificar tenants em risco
- ver se agenda, no-show e resposta estao melhorando
- saber se a receita esta crescendo ou vazando
- entender se os agentes ajudam ou atrapalham
- enxergar a proxima acao sem abrir dez telas auxiliares
