# Setup Render + Vercel — OperaClinic

**Stack**: Render (API + PostgreSQL) + Vercel (Web Next.js)  
**Custo**: Gratuito para piloto | ~$14-21/mês para produção com always-on  
**Tempo**: ~45 minutos

---

## Visão geral

| Componente | Plataforma | Tier | Observação |
|-----------|-----------|------|-----------|
| PostgreSQL | Render | Free (90 dias) | Depois $7/mês |
| API (NestJS) | Render | Free (sleeps 15min) | Depois $7/mês |
| Web (Next.js) | Vercel | Free forever | Nativo Next.js, sem sleep |

---

## PASSO 1 — Render: criar API + banco via Blueprint

### 1.1 — Criar conta em render.com

Acesse [render.com](https://render.com) → Sign up (pode usar GitHub).

### 1.2 — Conectar via Blueprint (automático)

1. Dashboard Render → **New** → **Blueprint**
2. Conectar repositório: `ribekerA/operaclinic-platform`
3. Branch: `main`
4. Render detecta `render.yaml` automaticamente
5. Clique **Apply** → cria os serviços:
   - `operaclinic-api` (Web Service)
   - `operaclinic-db` (PostgreSQL)

### 1.3 — Preencher variáveis marcadas como `sync: false`

Após criar, vá em **operaclinic-api** → **Environment** → preencher:

```
JWT_ACCESS_SECRET      = <gere com: openssl rand -base64 48>
JWT_REFRESH_SECRET     = <gere com: openssl rand -base64 48>
CRON_SECRET            = <gere com: openssl rand -base64 48>
SEED_SUPER_ADMIN_EMAIL = admin@operaclinic.com.br
SEED_SUPER_ADMIN_PASSWORD = <senha forte, ex: openssl rand -base64 24>
STRIPE_SECRET_KEY      = sk_test_51...  (do stripe config --list)
STRIPE_WEBHOOK_SECRET  = whsec_... (gerado no Passo 3)
WEB_URL                = https://operaclinic-web.vercel.app  (preencher após Passo 2)
```

> `DATABASE_URL` é preenchido automaticamente pelo Render via `fromDatabase`.

### 1.4 — Atualizar startCommand para rodar migrations

Em **operaclinic-api** → **Settings** → **Start Command**:

```
node node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma && node dist/src/main.js
```

### 1.5 — Primeiro deploy + seed

Após o primeiro deploy verde:

```bash
# Via Render Shell (dashboard → operaclinic-api → Shell)
node node_modules/.bin/prisma db seed
```

### 1.6 — Anotar URL da API

Em **operaclinic-api** → **Settings** → copiar a URL pública.  
Exemplo: `https://operaclinic-api.onrender.com`

---

## PASSO 2 — Vercel: deploy do Web

### 2.1 — Instalar Vercel CLI

```bash
npm install -g vercel
vercel login  # abre browser
```

### 2.2 — Configurar projeto Vercel

```bash
cd c:\Users\byimp\OneDrive\Documentos\GitHub\operaclinic-platform\apps\web
vercel link  # conecta ao projeto ou cria novo
```

Responder:
- Set up and deploy: `Y`
- Which scope: sua conta
- Link to existing project: `N` (criar novo)
- Project name: `operaclinic-web`
- Directory: `./` (já está em apps/web)

### 2.3 — Configurar variável de ambiente no Vercel

```bash
vercel env add NEXT_PUBLIC_API_BASE_URL production
# Valor: https://operaclinic-api.onrender.com/api/v1
```

### 2.4 — Primeiro deploy

```bash
vercel deploy --prod
```

Anote a URL gerada: `https://operaclinic-web.vercel.app` (ou similar).

### 2.5 — Atualizar WEB_URL no Render

Volte ao Render → **operaclinic-api** → **Environment**:
```
WEB_URL = https://operaclinic-web.vercel.app
```

---

## PASSO 3 — Stripe webhook

### 3.1 — Criar webhook endpoint

```bash
stripe webhook-endpoints create \
  --url="https://operaclinic-api.onrender.com/api/v1/commercial/webhook/payment" \
  --enabled-events="payment_intent.succeeded" \
  --enabled-events="charge.refunded"
```

### 3.2 — Pegar o signing secret

```bash
stripe webhook-endpoints list
# Copiar o "secret" do endpoint criado (começa com whsec_)
```

Adicionar no Render: `STRIPE_WEBHOOK_SECRET = whsec_...`

---

## PASSO 4 — GitHub Secrets para CI/CD

### 4.1 — Token Render API (para deploy via GitHub Actions)

Render Dashboard → **Account** → **API Keys** → **Create API Key**.

```bash
# Pegar deploy hook da API
# Render → operaclinic-api → Settings → Deploy Hook → copiar URL
```

```bash
gh secret set RENDER_API_DEPLOY_HOOK --repo ribekerA/operaclinic-platform
# Cole a URL do deploy hook quando solicitado

gh secret set PRODUCTION_API_URL --repo ribekerA/operaclinic-platform
# Cole: https://operaclinic-api.onrender.com

gh secret set CRON_SECRET --repo ribekerA/operaclinic-platform
# Cole o mesmo valor definido no Render para CRON_SECRET
```

### 4.2 — Token Vercel (para deploy via GitHub Actions)

```bash
# Criar token em vercel.com/account/tokens
gh secret set VERCEL_TOKEN --repo ribekerA/operaclinic-platform
# Cole o token

# Pegar org e project IDs
cat apps/web/.vercel/project.json
# { "orgId": "...", "projectId": "..." }

gh secret set VERCEL_ORG_ID --repo ribekerA/operaclinic-platform
gh secret set VERCEL_PROJECT_ID --repo ribekerA/operaclinic-platform
```

---

## PASSO 5 — Validar

```bash
# Health da API
curl https://operaclinic-api.onrender.com/api/v1/health

# Smoke E2E contra staging
$env:SMOKE_E2E_WEB_BASE_URL="https://operaclinic-web.vercel.app"
pnpm smoke:e2e
```

---

## Limitações do tier gratuito

| Item | Limitação | Quando pagar |
|------|-----------|--------------|
| API (Render free) | Dorme após 15min de inatividade; 1ª request pós-sleep demora ~30s | Quando tiver clínica usando daily |
| PostgreSQL (Render free) | Expira em 90 dias | Após 90 dias → $7/mês |
| Web (Vercel free) | 100GB bandwidth/mês | Só se tiver muito tráfego |

**Para piloto de 1-2 clínicas**: tier gratuito é suficiente.  
**Para produção estável**: ~$14/mês (API Render Starter $7 + DB Render $7). Web no Vercel continua free.

---

## Sequência resumida (ordem de execução)

```
1. render.com → New → Blueprint → ribekerA/operaclinic-platform
2. Preencher variáveis sync:false no Render
3. Aguardar primeiro deploy verde
4. Render Shell → prisma db seed
5. npm install -g vercel && vercel login
6. cd apps/web && vercel link && vercel env add ... && vercel deploy --prod
7. Atualizar WEB_URL no Render com URL do Vercel
8. stripe webhook-endpoints create ...
9. gh secret set ... (4 secrets)
10. curl health → smoke:e2e
```
