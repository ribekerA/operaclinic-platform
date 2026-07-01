# Railway Setup Guide — OperaClinic

**Objetivo**: Deploy completo do OperaClinic em staging/produção via Railway em ~2 horas.

O CI/CD já está configurado: push para `main` → GitHub Actions → Railway deploy automático.
Você só precisa criar o projeto no Railway e configurar os secrets.

---

## Pré-requisitos

- Conta em [railway.app](https://railway.app)
- Repositório no GitHub com acesso de admin
- Conta Stripe (para billing)
- Node.js 20+ e Railway CLI instalados localmente

```bash
npm install -g @railway/cli
railway login
```

---

## Passo 1 — Criar projeto no Railway

1. Acesse [railway.app/new](https://railway.app/new)
2. Clique em **Empty Project**
3. Anote o **Project ID** (usado para linkar serviços)

### Criar PostgreSQL

1. No projeto → **New Service** → **Database** → **PostgreSQL**
2. Após criar, clique no serviço PostgreSQL → **Variables**
3. Copie o valor de `DATABASE_URL` (formato `postgresql://...`)

### Criar serviço API

1. **New Service** → **GitHub Repo** → selecione `operaclinic-platform`
2. Railway detecta `railway.api.toml` automaticamente
3. Renomeie o serviço para `api`

### Criar serviço Web

1. **New Service** → **GitHub Repo** → selecione `operaclinic-platform` novamente
2. Railway detecta `railway.web.toml` automaticamente
3. Renomeie o serviço para `web`

---

## Passo 2 — Configurar variáveis da API

No serviço `api` → **Variables** → adicionar uma a uma:

```
NODE_ENV=production
APP_NAME=OperaClinic API
API_PORT=3001
API_PREFIX=api/v1

DATABASE_URL=<cole o valor do PostgreSQL Railway>

JWT_ACCESS_SECRET=<gere com: openssl rand -base64 48>
JWT_REFRESH_SECRET=<gere com: openssl rand -base64 48>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

WEB_URL=https://<dominio-do-web-service>.railway.app

COMMERCIAL_ONBOARDING_TTL_HOURS=48
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_<sua-chave-stripe>
STRIPE_WEBHOOK_SECRET=whsec_<gerado-no-stripe-dashboard>

MESSAGING_WHATSAPP_META_ENABLED=false
MESSAGING_WHATSAPP_META_API_BASE_URL=https://graph.facebook.com
MESSAGING_WHATSAPP_META_API_VERSION=v21.0
MESSAGING_WHATSAPP_META_ACCESS_TOKEN=
MESSAGING_WHATSAPP_META_APP_SECRET=

SEED_SUPER_ADMIN_EMAIL=admin@suaclinica.com
SEED_SUPER_ADMIN_PASSWORD=<senha-forte-para-primeiro-acesso>
SEED_BASE_PLAN_CODE=BASE_MVP
SEED_BASE_PLAN_NAME=Base MVP
SEED_BASE_PLAN_DESCRIPTION=Plano base para onboarding inicial.
SEED_BASE_PLAN_PRICE_CENTS=0

CRON_SECRET=<gere com: openssl rand -base64 48>

AGENT_LAYER_ENABLED=true
AGENT_LAYER_ROLLOUT_PERCENTAGE=5
AGENT_METRICS_WINDOW_MINUTES=15
AGENT_SKILL_FAILURE_RATE_ALERT_THRESHOLD=0.05
AGENT_SKILL_P95_ALERT_MS=1500

THROTTLE_TTL_MS=60000
THROTTLE_LIMIT=60
```

> **Nunca use os valores do `.env.example`** — gere secrets novos para produção.

---

## Passo 3 — Configurar variáveis do Web

No serviço `web` → **Variables**:

```
NODE_ENV=production
NEXT_PUBLIC_API_BASE_URL=https://<dominio-do-api-service>.railway.app/api/v1
```

> O domínio da API é gerado automaticamente pelo Railway após o primeiro deploy.

---

## Passo 4 — Obter RAILWAY_TOKEN para GitHub Actions

```bash
# Gera um token de acesso para o projeto
railway whoami
railway link  # selecione o projeto criado
```

Ou via dashboard: **Account Settings** → **Tokens** → **New Token**.

Adicione no GitHub repo → **Settings** → **Secrets and variables** → **Actions**:

| Secret | Valor |
|--------|-------|
| `RAILWAY_TOKEN` | token gerado acima |
| `CRON_SECRET` | mesmo valor do env da API |
| `PRODUCTION_API_URL` | `https://<api-domain>.railway.app` |

---

## Passo 5 — Primeiro deploy + migrations

Após configurar tudo, faça push para `main`:

```bash
git add .
git commit -m "chore: add railway setup and cron workflow"
git push origin main
```

O GitHub Actions vai:
1. Rodar CI (typecheck + tests)
2. Fazer deploy da API no Railway
3. Fazer deploy do Web no Railway

Após o deploy, rodar migrations e seed **uma única vez**:

```bash
# Conectar ao projeto Railway localmente
railway link

# Rodar migrations no banco de produção
railway run --service api -- node node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma

# Rodar seed (apenas na primeira vez)
railway run --service api -- node node_modules/.bin/prisma db seed
```

Ou via Railway dashboard: **api** → **Settings** → **Deploy** → **Run Command** (temporário).

---

## Passo 6 — Validar readiness

```bash
# Testar health da API
curl https://<api-domain>.railway.app/api/v1/health

# Resposta esperada: { "status": "ok" }
```

```bash
# Rodar smoke tests apontando para staging
$env:SMOKE_E2E_WEB_BASE_URL="https://<web-domain>.railway.app"
pnpm smoke:e2e
```

---

## Passo 7 — Configurar Stripe Webhook em staging

1. Acesse [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. **Add endpoint**
3. URL: `https://<api-domain>.railway.app/api/v1/commercial/webhook/payment`
4. Eventos: `payment_intent.succeeded`, `charge.refunded`
5. Copie o **Signing secret** → adicione como `STRIPE_WEBHOOK_SECRET` no Railway

### Testar checkout completo

```bash
# 1. Listar planos
curl https://<api-domain>.railway.app/api/v1/commercial/plans

# 2. Iniciar onboarding (anote o onboardingToken)
curl -X POST https://<api-domain>.railway.app/api/v1/commercial/onboarding/start \
  -H "Content-Type: application/json" \
  -d '{"planId": "<plan-id-do-passo-1>"}'

# 3. Completar cadastro da clínica
curl -X POST https://<api-domain>.railway.app/api/v1/commercial/onboarding/<token>/complete \
  -H "Content-Type: application/json" \
  -d '{
    "clinicDisplayName": "Clínica Teste",
    "clinicContactEmail": "teste@clinica.com",
    "clinicContactPhone": "11999999999",
    "timezone": "America/Sao_Paulo",
    "adminFullName": "Admin Teste",
    "adminEmail": "admin@clinica.com"
  }'

# 4. Criar checkout → abrir URL no browser → pagar com 4242 4242 4242 4242
curl -X POST https://<api-domain>.railway.app/api/v1/commercial/onboarding/<token>/create-checkout

# 5. Verificar que tenant foi criado após webhook
curl https://<api-domain>.railway.app/api/v1/commercial/onboarding/<token>
# Esperado: status = ONBOARDING_COMPLETED
```

---

## Passo 8 — Ativar WhatsApp (quando tiver clínica piloto)

Seguir ordem **2 → 3 → 1** do [WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md](./WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md).

Primeiro, habilitar no Railway:
```
MESSAGING_WHATSAPP_META_ENABLED=true
MESSAGING_WHATSAPP_META_ACCESS_TOKEN=<token-meta>
MESSAGING_WHATSAPP_META_APP_SECRET=<app-secret-meta>
```

---

## Passo 9 — Ativar cron de reminders

O workflow `.github/workflows/cron-reminders.yml` já está configurado.

Requer que os secrets do GitHub estejam preenchidos:
- `CRON_SECRET` — mesmo valor do env da API
- `PRODUCTION_API_URL` — URL da API no Railway

O cron roda automaticamente às **08:00 BRT** todos os dias.

Para testar manualmente: GitHub → Actions → **Cron — Appointment Reminders 24h** → **Run workflow** → marcar `dry_run=true`.

---

## Checklist final antes do piloto

```
[ ] API health retorna ok
[ ] Web carrega login
[ ] Smoke E2E passa contra staging
[ ] Stripe: 1 onboarding completo com pagamento real (test mode)
[ ] Cron reminders: 1 execução manual com dry_run=true passando
[ ] Tenant isolado: login de clínica A não vê dados de clínica B
[ ] UAT: recepcionista opera os 10 passos sem ajuda do founder
```

---

## Comandos úteis

```bash
# Ver logs da API em tempo real
railway logs --service api

# Acessar shell no container da API
railway shell --service api

# Executar um comando avulso na API
railway run --service api -- <comando>

# Checar status dos serviços
railway status
```
