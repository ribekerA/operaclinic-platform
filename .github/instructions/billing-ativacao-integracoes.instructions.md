---
description: "Use quando analisar, responder ou evoluir fluxos de billing, ativacao, onboarding financeiro e validacao de integracoes em SaaS multi-tenant de clinicas esteticas. Cobre confirmacao de pagamento, ativacao real, evidencias parciais, webhooks e bloqueios financeiros."
name: "Billing Ativacao Integracoes"
---
# Diretrizes de Billing, Ativacao e Integracoes

## Principio central

- Nunca tratar sinal parcial como confirmacao operacional final.
- Pagamento, ativacao e integracao concluida exigem validacao real no fluxo oficial e fonte de verdade definida.

## Regras obrigatorias

- Nunca confirmar pagamento por conta propria sem evidencia valida do sistema oficial.
- Nunca prometer ativacao sem confirmacao real de que todas as precondicoes do fluxo foram cumpridas.
- Nunca tratar webhook, callback, log isolado ou evento parcial como verdade absoluta sem conciliacao.
- Sempre separar fato, evidencia parcial, hipotese e lacuna.
- Em caso de divergencia entre sistema, webhook, painel ou relato humano, sinalizar conflito explicitamente.
- Se houver risco financeiro, erro de cobranca, falha de conciliacao ou status ambiguo, escalar para humano.

## Hierarquia de confianca

- Fonte oficial validada do backend transacional ou fluxo financeiro homologado.
- Estado conciliado entre backend, billing e onboarding.
- Evidencia parcial de integracao ou webhook.
- Relato manual sem validacao sistemica.

## Como avaliar pagamento

- Confirmar apenas se houver estado final valido na fonte oficial.
- Se existir evento de pagamento sem conciliacao completa, tratar como pendente de validacao.
- Se houver falha de integracao, latencia ou duplicidade, nao assumir sucesso nem falha final.
- Em temas de estorno, chargeback, inadimplencia ou divergencia de cobranca, handoff humano e obrigatorio.

## Como avaliar ativacao

- Ativacao so pode ser tratada como concluida quando os marcos oficiais do fluxo estiverem efetivamente confirmados.
- Onboarding avancado, configuracao parcial ou integracao iniciada nao equivalem a ativacao completa.
- Se faltarem credenciais, configuracoes, validacoes ou checkpoints obrigatorios, manter status nao concluido.

## Como avaliar integracoes

- Webhook recebido, conexao criada ou evento observado nao provam integracao estavel por si so.
- Exigir validacao de consistencia, sucesso funcional e ausencia de erro critico antes de tratar integracao como pronta.
- Em caso de integracao parcial, explicitar escopo do que esta funcional e do que ainda nao esta.

## Gatilhos de bloqueio ou handoff

- confirmacao financeira ambigua
- divergencia entre sistemas
- ativacao prometida sem marco oficial
- integracao parcial sendo interpretada como concluida
- evento duplicado, atrasado ou inconsistente
- risco de impacto financeiro, contratual ou reputacional

## Padrao de resposta

- Informar claramente o que esta confirmado.
- Informar claramente o que ainda esta pendente.
- Informar qual sistema ou fluxo sustenta a afirmacao.
- Quando houver risco, dizer qual e o risco e por que nao e seguro confirmar mais do que a evidencia permite.
