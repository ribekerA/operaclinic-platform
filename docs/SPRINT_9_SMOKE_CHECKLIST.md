# Sprint 9 - Smoke Manual (Inbox + Real-time)

## Objetivo
Validar comportamento em tempo real da Inbox da recepcao com duas sessoes simultaneas.

## Pre-condicoes
- API e Web rodando localmente.
- Dois usuarios de recepcao ativos no mesmo tenant.
- Pelo menos um handoff aberto na fila.

## Setup rapido
1. Abrir duas janelas de navegador (ou normal + anonima).
2. Logar Sessao A com usuario de recepcao A.
3. Logar Sessao B com usuario de recepcao B.
4. Em ambas, abrir pagina de Inbox: /clinic/inbox.

## Fluxo 1 - Assumir handoff com concorrencia
1. Na Sessao A, selecionar um handoff aberto e clicar em Assumir Atendimento.
2. Na Sessao B, confirmar atualizacao em tempo real:
- handoff deve aparecer como em atendimento (ou sumir da fila de pendentes).
- nao deve exigir refresh manual.
3. Resultado esperado:
- Apenas uma sessao fica como responsavel pelo handoff.

## Fluxo 2 - Troca de mensagens em tempo real
1. Na Sessao A (responsavel), enviar uma mensagem na thread.
2. Na Sessao B, confirmar atualizacao em tempo real:
- timeline atualizada com nova mensagem.
- status/preview da thread atualizado na lista.
3. Resultado esperado:
- evento refletido sem reload.

## Fluxo 3 - Encerrar handoff
1. Na Sessao A, clicar em Encerrar Handoff.
2. Na Sessao B, confirmar atualizacao em tempo real:
- handoff removido/atualizado na fila.
- thread deixa de aparecer como em handoff.
3. Resultado esperado:
- estado final consistente nas duas sessoes.

## Validacoes negativas
- Usuario de outro tenant nao visualiza handoffs desse tenant.
- Usuario nao-responsavel nao envia mensagem quando regra de ownership estiver ativa.

## Evidencias minimas
- Print 1: fila antes de assumir.
- Print 2: estado apos assumir (A e B, se possivel).
- Print 3: estado apos encerrar handoff.
- Texto curto com resultado esperado vs observado.

## Criterio de aprovacao
- Atualizacoes em tempo real funcionando em 100% dos fluxos acima sem refresh manual.
- Nenhum conflito de ownership indevido entre as duas sessoes.
