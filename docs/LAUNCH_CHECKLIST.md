# OperaClinic — Checklist de Lançamento

**Atualizado**: julho 2026  
**Status do código**: ✅ Pronto para deploy — infra, cron, dedup, no-show: tudo implementado  
**Bloqueadores restantes**: 100% operacionais (setup de contas + validações)

---

## FASE 1 — Railway (2-4h) 🔴 Faça isso primeiro

- [ ] 1.1 Criar conta em [railway.app](https://railway.app)
- [ ] 1.2 Criar projeto vazio no Railway
- [ ] 1.3 Adicionar PostgreSQL ao projeto
- [ ] 1.4 Criar serviço `api` (GitHub repo → `operaclinic-platform`)
- [ ] 1.5 Criar serviço `web` (mesmo repo)
- [ ] 1.6 Configurar todas as variáveis da API (ver [RAILWAY_SETUP.md](RAILWAY_SETUP.md) Passo 2)
- [ ] 1.7 Configurar variáveis do Web (ver [RAILWAY_SETUP.md](RAILWAY_SETUP.md) Passo 3)
- [ ] 1.8 Gerar `RAILWAY_TOKEN` e adicionar nos GitHub Secrets
- [ ] 1.9 Adicionar `CRON_SECRET` e `PRODUCTION_API_URL` nos GitHub Secrets
- [ ] 1.10 Push para `main` → verificar que CI passa e deploy ocorre
- [ ] 1.11 Confirmar `GET /api/v1/health` retorna 200

**Gate**: API respondendo em URL pública. Sem isso, nada mais adianta.

---

## FASE 2 — Stripe (2-3h) 🔴 Desbloqueado após Fase 1

- [ ] 2.1 Criar conta em [stripe.com](https://stripe.com) (se não tiver)
- [ ] 2.2 Pegar `sk_test_...` (Stripe Dashboard → API Keys)
- [ ] 2.3 Adicionar `STRIPE_SECRET_KEY` no Railway (serviço api)
- [ ] 2.4 Criar webhook no Stripe Dashboard:
  - URL: `https://<api>.railway.app/api/v1/commercial/webhook/payment`
  - Eventos: `payment_intent.succeeded`, `charge.refunded`
- [ ] 2.5 Copiar Signing Secret → `STRIPE_WEBHOOK_SECRET` no Railway
- [ ] 2.6 Executar onboarding completo (ver [RAILWAY_SETUP.md](RAILWAY_SETUP.md) Passo 7)
  - Cartão de teste: `4242 4242 4242 4242`
- [ ] 2.7 Confirmar que tenant foi criado (`status = ONBOARDING_COMPLETED`)

**Gate**: 1 onboarding com pagamento Stripe real (test mode) funcionando end-to-end.

---

## FASE 3 — Smoke + Validação manual (1-2h) 🟡 Após Fase 1

- [ ] 3.1 Rodar smoke E2E contra staging:
  ```bash
  $env:SMOKE_E2E_WEB_BASE_URL="https://<web>.railway.app"
  pnpm smoke:e2e
  ```
- [ ] 3.2 Testar manualmente os 17 passos do [LOCAL_TO_PRODUCTION_RUNBOOK.md](LOCAL_TO_PRODUCTION_RUNBOOK.md) Phase 4
- [ ] 3.3 Confirmar isolamento: abrir 2 sessões (platform admin + clínica A) em paralelo

**Gate**: todos os 8 smoke tests passando contra a URL de staging.

---

## FASE 4 — Cron Reminders (30 min) 🟡 Após Fase 1

- [ ] 4.1 Confirmar secrets `CRON_SECRET` e `PRODUCTION_API_URL` estão no GitHub
- [ ] 4.2 GitHub → Actions → **Cron — Appointment Reminders 24h** → **Run workflow**
  - Marcar `dry_run = true` na primeira vez
- [ ] 4.3 Verificar que a action passou com HTTP 200
- [ ] 4.4 Testar sem dry_run para uma clínica que tenha template ativo

**Gate**: 1 execução manual com dry_run=true retornando 200 e log de tenants.

---

## FASE 5 — UAT com clínica piloto (1 sessão presencial ou remota)

- [ ] 5.1 Agendar sessão de UAT com recepcionista da clínica piloto
- [ ] 5.2 Conduzir os 10 passos abaixo **sem intervir**:
  1. Login na recepção
  2. Ver agenda do dia
  3. Buscar disponibilidade (profissional + data)
  4. Criar agendamento manual (paciente novo)
  5. Confirmar agendamento
  6. Check-in de paciente
  7. Cancelar agendamento com motivo
  8. Ver inbox e responder mensagem manualmente
  9. Abrir handoff e fechar
  10. Ver KPIs do dia (no-show, confirmações)
- [ ] 5.3 Registrar resultado: passou sem ajuda? Se não, anotar onde travou

**Gate**: todos os 10 passos completos sem intervenção do founder.

---

## FASE 6 — WhatsApp (quando clínica tiver número Meta Business)

Seguir ordem 2 → 3 → 1 do [WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md](WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md).

- [ ] 6.1 Habilitar Meta no Railway:
  ```
  MESSAGING_WHATSAPP_META_ENABLED=true
  MESSAGING_WHATSAPP_META_ACCESS_TOKEN=<token>
  MESSAGING_WHATSAPP_META_APP_SECRET=<secret>
  ```
- [ ] 6.2 Criar conexão de integração para a clínica piloto
- [ ] 6.3 Configurar webhook no Meta Business Manager
- [ ] 6.4 Enviar mensagem de teste → confirmar thread no banco
- [ ] 6.5 Definir SLA + dono do plantão + protocolo de rollback
- [ ] 6.6 Iniciar com `AGENT_LAYER_ROLLOUT_PERCENTAGE=5`
- [ ] 6.7 Observar 24h → decidir GO / HOLD / NO-GO

**Gate**: inbound + outbound + handoff funcionando sem incidente bloqueador em 24h.

---

## FASE 7 — Onboarding SLA (evidência para investors/clientes)

- [ ] 7.1 Executar 1 onboarding completo com timestamps auditáveis:
  - T0: clínica assina contrato / inicia processo
  - T1: `commercial_onboardings.onboarding_completed_at` no banco
  - Diferença deve ser ≤ 7 dias
- [ ] 7.2 Exportar evidência: `SELECT created_at, onboarding_completed_at FROM commercial_onboardings`

**Gate**: ≥1 onboarding completo dentro de 7 dias com timestamps no banco.

---

## Decisão GO/NO-GO

Preencher antes de expor ao primeiro cliente real:

| Critério | Gate | Status |
|----------|------|--------|
| API pública e saudável | Fase 1 completa | ☐ |
| Stripe funcionando em staging | Fase 2 completa | ☐ |
| Smoke E2E 8/8 passando | Fase 3 completa | ☐ |
| Cron reminders ativo | Fase 4 completa | ☐ |
| UAT sem founder | Fase 5 completa | ☐ |
| WhatsApp validado (se em escopo) | Fase 6 completa | ☐ |
| Onboarding ≤7 dias comprovado | Fase 7 completa | ☐ |

**Critério mínimo para piloto**: Fases 1-5 completas.  
**Critério para escalar**: Fases 1-7 completas + Fase 6 sem incidente em 24h.

---

## Rollback rápido

```bash
# Desligar agents imediatamente
# Railway → api → Variables → AGENT_LAYER_ENABLED=false

# Reduzir rollout de agents
# AGENT_LAYER_ROLLOUT_PERCENTAGE=0

# Reverter deploy da API
railway rollback --service api

# Rollback do WhatsApp: só desativar MESSAGING_WHATSAPP_META_ENABLED
```
