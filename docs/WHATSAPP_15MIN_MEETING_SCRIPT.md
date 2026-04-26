# Script de Reuniao 15 Min - Go/No-Go WhatsApp (2 -> 3 -> 1)

Data: 2026-04-05  
Duracao: 15 minutos  
Objetivo: sair da reuniao com decisao objetiva e proximo passo fechado.

Referencias:
- [WHATSAPP_BLUEPRINT_D0_D1_D7.md](WHATSAPP_BLUEPRINT_D0_D1_D7.md)
- [WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md](WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md)
- [WHATSAPP_CLINIC_ONBOARDING_CHECKLIST.md](WHATSAPP_CLINIC_ONBOARDING_CHECKLIST.md)
- [AGENT_LAYER_STAGING_5_PERCENT_CHECKLIST.md](AGENT_LAYER_STAGING_5_PERCENT_CHECKLIST.md)

---

## Agenda (15 min)

1. Contexto e objetivo (2 min)
2. Status por fase D0/D1/D7 (5 min)
3. Riscos e bloqueios (4 min)
4. Decisao final + donos + prazo (4 min)

---

## Participantes minimos

- Tech Lead (decisao tecnica)
- Operacoes/Recepcao (decisao operacional)
- Produto (priorizacao e impacto)
- Responsavel da integracao WhatsApp (execucao)

---

## Roteiro de fala (pronto para uso)

### 0:00-2:00 - Abertura (facilitador)

Mensagem sugerida:
"Objetivo da reuniao: decidir se seguimos para o proximo marco da estrategia 2 -> 3 -> 1 sem aumentar risco operacional. A decisao hoje precisa sair com dono, prazo e criterio de sucesso."

Pergunta de alinhamento:
- "Todos concordam que validacao real em campo continua como ultima etapa?"

Resposta esperada:
- sim.

---

### 2:00-7:00 - Status por fase (Tech Lead)

Mensagem sugerida:
"Vou passar status objetivo por fase:
- D0 (setup tecnico por clinica)
- D1 (governanca operacional)
- D7 (validacao em campo 24h)
"

Checklist rapido:
- D0: conexao criada? verify token validado? inbound/outbound testado? readiness sem erro critico?
- D1: SLA definido? gatilho handoff definido? gate objetivo definido? rollback testado?
- D7: T0/T+12h/T+24h preenchidos? decisao go/no-go registrada?

Regra:
- se D0 incompleto, nao discute D7.
- se D1 incompleto, nao entra em campo.

---

### 7:00-11:00 - Riscos e bloqueios (Operacoes + Integracao)

Mensagem sugerida:
"Vamos fechar os 3 maiores riscos hoje e acao de mitigacao de cada um."

Template:
- Risco 1:
  - impacto:
  - mitigacao:
  - dono:
  - prazo:
- Risco 2:
  - impacto:
  - mitigacao:
  - dono:
  - prazo:
- Risco 3:
  - impacto:
  - mitigacao:
  - dono:
  - prazo:

Perguntas obrigatorias:
- "Existe risco de cross-tenant nao enderecado?"
- "Tem falha de webhook sem plano de recuperacao?"
- "Tem dependencia humana sem responsavel de plantao?"

---

### 11:00-15:00 - Decisao final (Produto + Tech Lead)

Mensagem sugerida:
"Com base no status e riscos, precisamos decidir agora: avanca, mantem ou bloqueia."

Opcoes de decisao:
- GO para proxima fase
- HOLD (manter fase atual com plano corretivo)
- NO-GO (bloquear e rollback)

Registro obrigatorio da decisao:
- decisao:
- justificativa curta:
- dono da execucao:
- prazo:
- evidencia esperada:

---

## Regras objetivas de decisao

### GO

Pode avancar somente se:
- D0 completo
- D1 completo
- sem bloqueio critico aberto
- dono e prazo definidos para monitoramento

### HOLD

Manter fase atual se:
- existe lacuna nao critica
- mitigacao ja definida
- prazo curto para correcao

### NO-GO

Bloquear imediatamente se:
- risco de isolamento de tenant
- webhook instavel sem recuperacao
- ausencia de rollback funcional

---

## Saida obrigatoria da reuniao

Ao final, a ata deve conter:

1. Estado por fase
- D0: aprovado/reprovado
- D1: aprovado/reprovado
- D7: autorizado/nao autorizado

2. Decisao final
- GO/HOLD/NO-GO

3. Plano de execucao
- 3 acoes com dono e data

4. Proxima reuniao
- data/hora
- criterio para encerrar ciclo

---

## Modelo de ata (copiar e preencher)

Data:
Participantes:

Status:
- D0:
- D1:
- D7:

Riscos:
1.
2.
3.

Decisao:
- GO/HOLD/NO-GO
- justificativa:

Acoes:
1) acao / dono / prazo
2) acao / dono / prazo
3) acao / dono / prazo

Proxima reuniao:
- data:
- objetivo:

---

## Mensagem final do facilitador

"Fechamos decisao e plano. Ninguem executa mudanca fora desta trilha 2 -> 3 -> 1. Se surgir bloqueio critico, aciona rollback e reabre gate."
