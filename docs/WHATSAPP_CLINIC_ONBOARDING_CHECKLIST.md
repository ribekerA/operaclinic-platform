# Checklist de Onboarding WhatsApp por Clinica

Data: 2026-04-05  
Uso: execucao da Fase 2 (setup tecnico), prerequisito para fases seguintes.

## Cabecalho

- Clinica:
- TenantId:
- Responsavel tecnico:
- Responsavel operacional:
- Ambiente:
- Data/hora de inicio:

---

## A. Pre-check de ambiente (global)

- [ ] `MESSAGING_WHATSAPP_META_ENABLED=true`
- [ ] `MESSAGING_WHATSAPP_META_ACCESS_TOKEN` configurado
- [ ] `MESSAGING_WHATSAPP_META_APP_SECRET` configurado
- [ ] endpoint webhook acessivel externamente
- [ ] readiness sem erro critico de mensageria

Evidencia:
- comando/URL:
- resultado:

---

## B. Cadastro da conexao (por clinica)

Endpoint:
- `POST /api/v1/integrations`

Payload enviado (anexar):

```json
{
  "provider": "WHATSAPP_META",
  "displayName": "",
  "phoneNumber": "",
  "externalAccountId": "",
  "config": {}
}
```

- [ ] conexao criada com status ativo
- [ ] verify token retornado
- [ ] verify token configurado no Meta
- [ ] externalAccountId confirmado

Evidencia:
- id conexao:
- verify token (mascarado):
- retorno API:

---

## C. Teste inbound/outbound tecnico

Inbound (Meta -> API):
- [ ] webhook de teste recebido
- [ ] webhook event persistido
- [ ] thread criada/atualizada
- [ ] message event persistido

Outbound (API -> WhatsApp):
- [ ] mensagem de teste enviada
- [ ] status de envio registrado
- [ ] sem erro de assinatura/credencial

Evidencia:
- threadId:
- eventId:
- timestamp:
- logs correlacionados:

---

## D. Guardrails operacionais minimos

- [ ] handoff manual funcionando
- [ ] fila de handoff visivel para recepcao
- [ ] sem incidente cross-tenant no teste
- [ ] sem erro recorrente de webhook no periodo de validacao tecnica

Evidencia:
- handoffId:
- observacoes:

---

## E. Resultado da Fase 2

Decisao:
- [ ] APROVADO para Fase 3
- [ ] REPROVADO (corrigir e retestar)

Motivo (se reprovado):

Riscos remanescentes:

Acoes corretivas:

Assinaturas:
- Tech Lead:
- Operacao:
- Data/hora:

---

## Regra de ouro

Se qualquer item de A, B ou C falhar, esta clinica nao pode entrar em validacao de campo real.
