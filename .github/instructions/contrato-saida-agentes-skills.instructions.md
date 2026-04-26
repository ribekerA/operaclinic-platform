---
description: "Use quando criar, revisar ou integrar agents, skills, prompts ou fluxos assistidos neste SaaS de clinicas esteticas. Define contrato minimo de saida para proxima acao, justificativa, escalonamento, fatos, hipoteses e lacunas."
name: "Contrato Saida Agentes Skills"
---
# Contrato de Saida para Agents e Skills

## Objetivo

Padronizar a saida de agents e skills para reduzir drift entre triagem, scheduling assistido, handoff, onboarding comercial e auditoria operacional.

## Regras obrigatorias

- Toda saida deve ser operacional, objetiva e auditavel.
- Toda saida deve evitar afirmacoes sem evidencia suficiente.
- Sempre separar fatos confirmados, hipoteses e lacunas quando houver risco de interpretacao indevida.
- Sempre indicar claramente se ha escalonamento, bloqueio ou continuidade segura.
- Nunca ocultar incerteza.

## Campos minimos recomendados

- proxima_acao_recomendada ou equivalente
- justificativa_auditavel_curta ou motivo
- handoff_necessario, escalonamento ou equivalente
- fatos_confirmados ou fatos_observados
- hipoteses
- lacunas

## Regras de modelagem da saida

- Campos devem ter nomes estaveis e semanticamente claros.
- Quando a saida for JSON, usar valores enumerados previsiveis para prioridade, urgencia, confianca, bloqueio e prontidao.
- Quando um campo nao se aplicar, preferir null ou lista vazia em vez de texto ambiguo.
- Quando houver bloqueio, explicitar a condicao que impede avanço seguro.
- Quando nao houver handoff imediato, mas existir risco de futura escalacao, registrar essa condicao no motivo.

## Linguagem esperada

- Responder em portugues do Brasil.
- Ser tecnico e operacional.
- Informar risco de forma explicita quando existir.
- Dizer exatamente o que falta para decidir com seguranca.

## Objetivo de integracao

- Permitir que um agent consuma a saida de uma skill sem reinterpretacao excessiva.
- Facilitar auditoria, handoff humano e continuidade de atendimento.
- Reduzir perda de contexto entre recepcao, comercial, scheduling e governanca.
