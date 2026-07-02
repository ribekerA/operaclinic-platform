# WhatsApp Setup Guide

Dois provedores disponíveis: **Evolution API** (QR code, sem aprovação Meta) e **Meta Cloud API** (API oficial, com WABA aprovada).

---

## Opção A — Evolution API (recomendado para dev/demo)

### Pré-requisitos

- Docker e Docker Compose instalados
- ngrok (ou Cloudflare Tunnel) para expor o webhook localmente

### 1. Subir Evolution API via Docker Compose

```yaml
# docker-compose.evolution.yml
version: "3.8"

services:
  evolution-api:
    image: atendai/evolution-api:v2-latest
    container_name: evolution-api
    ports:
      - "8080:8080"
    environment:
      SERVER_URL: http://localhost:8080
      AUTHENTICATION_TYPE: apikey
      AUTHENTICATION_API_KEY: minha-chave-aqui
      # Desabilita autenticação JWT por instância (usa apenas a global apikey)
      AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES: "true"
      DATABASE_ENABLED: "false"
      REDIS_ENABLED: "false"
      WEBHOOK_GLOBAL_URL: ""
      WEBHOOK_GLOBAL_ENABLED: "false"
    restart: unless-stopped
```

```bash
docker compose -f docker-compose.evolution.yml up -d
```

A Evolution API estará em `http://localhost:8080`.

### 2. Criar instância (conectar via QR code)

```bash
# Criar instância chamada "vitalis-demo"
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: minha-chave-aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "vitalis-demo",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

Acesse `http://localhost:8080/instance/qrcode/vitalis-demo?image=true` para ver o QR code e escanear com seu WhatsApp.

### 3. Expor o webhook com ngrok

```bash
ngrok http 3001
# Anote o HTTPS URL, ex: https://abcd1234.ngrok-free.app
```

### 4. Configurar webhook na instância

```bash
NGROK_URL=https://abcd1234.ngrok-free.app

curl -X POST http://localhost:8080/webhook/set/vitalis-demo \
  -H "apikey: minha-chave-aqui" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${NGROK_URL}/api/v1/webhooks/whatsapp\",
    \"webhook_by_events\": false,
    \"webhook_base64\": false,
    \"events\": [\"MESSAGES_UPSERT\", \"MESSAGES_UPDATE\"]
  }"
```

### 5. Registrar conexão no banco de dados

Com o servidor da API local rodando, crie a IntegrationConnection:

```sql
-- Execute via psql ou Prisma Studio
INSERT INTO "IntegrationConnection" (
  id, "tenantId", channel, provider, "displayName",
  "externalAccountId", status, "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(),
  '<SEU_TENANT_ID>',
  'WHATSAPP',
  'WHATSAPP_EVOLUTION',
  'WhatsApp Vitalis (Evolution)',
  'vitalis-demo',   -- deve bater com o instanceName da Evolution API
  'ACTIVE',
  now(), now()
);
```

### 6. Variáveis de ambiente

No `.env` da API:

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_BASE_URL=http://localhost:8080
EVOLUTION_API_KEY=minha-chave-aqui
```

### 7. Aplicar migração de banco

```bash
cd apps/api
npx prisma migrate dev --name add_evolution_provider
# ou em staging/prod:
npx prisma migrate deploy
```

---

## Opção B — Meta Cloud API (produção)

### Pré-requisitos

- Conta de negócios verificada no Facebook Business Manager
- Aplicativo criado em [developers.facebook.com](https://developers.facebook.com)
- Número de telefone registrado na WABA

### 1. Criar App Meta

1. Acesse [developers.facebook.com/apps](https://developers.facebook.com/apps) → Criar App → Negócios
2. Adicione o produto **WhatsApp**
3. Em **Configurações da API do WhatsApp**, copie o `Access Token` temporário e o `Phone Number ID`

### 2. Configurar webhook no Meta

No painel do App → WhatsApp → Configuração → Webhook:

- **URL do callback:** `https://seu-dominio.com/api/v1/webhooks/whatsapp`
- **Token de verificação:** qualquer string (ex: `operaclinic-webhook-token`)
- **Campos para assinar:** `messages`

O Meta fará uma requisição GET para verificar; o servidor responde com o `hub.challenge`.

### 3. Variáveis de ambiente

```env
WHATSAPP_PROVIDER=meta
MESSAGING_WHATSAPP_META_ENABLED=true
MESSAGING_WHATSAPP_META_ACCESS_TOKEN=<seu-access-token>
MESSAGING_WHATSAPP_META_APP_SECRET=<seu-app-secret>
# Opcional — sobrescreve o padrão
MESSAGING_WHATSAPP_META_API_BASE_URL=https://graph.facebook.com
MESSAGING_WHATSAPP_META_API_VERSION=v21.0
```

### 4. Registrar conexão no banco

```sql
INSERT INTO "IntegrationConnection" (
  id, "tenantId", channel, provider, "displayName",
  "externalAccountId", status, config, "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(),
  '<SEU_TENANT_ID>',
  'WHATSAPP',
  'WHATSAPP_META',
  'WhatsApp Meta',
  '<PHONE_NUMBER_ID>',
  'ACTIVE',
  '{"phoneNumberId": "<PHONE_NUMBER_ID>"}',
  now(), now()
);
```

---

## Testando localmente (Mock)

Para desenvolvimento sem nenhum provedor real:

```env
WHATSAPP_PROVIDER=mock
```

Envie um webhook simulado:

```bash
# Criar thread/mensagem via mock
curl -X POST http://localhost:3001/api/v1/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "connectionId": "<ID_DA_CONNECTION_MOCK>",
    "providerEventId": "evt-test-001",
    "providerMessageId": "msg-test-001",
    "eventType": "message.received",
    "senderPhoneNumber": "+5511999998888",
    "senderDisplayName": "Maria Silva",
    "messageText": "Olá, quero agendar uma consulta",
    "occurredAt": "2026-07-02T12:00:00Z"
  }'
```

---

## Debounce de digitação

Quando o paciente envia múltiplas mensagens em menos de 5 segundos (ex: "quero", "agendar", "uma avaliação estética"), o sistema as agrupa automaticamente antes de acionar o agente.

Cada mensagem individual é registrada no banco em tempo real. Apenas o disparo do agente é atrasado até a janela de 5s fechar sem nova mensagem.

---

## Fluxo de arquitetura

```
WhatsApp (Evolution/Meta)
      │  POST /api/v1/webhooks/whatsapp
      ▼
WhatsappWebhooksController
      │
      ▼
WhatsappWebhooksService
  ├── ProviderFactory.getAdapter(provider)
  ├── adapter.verifyInboundWebhook (HMAC, opcional)
  ├── adapter.parseInboundWebhook → NormalizedInboundMessageEvent[]
  ├── dedup por providerEventId (DB unique constraint)
  ├── upsert MessageThread + create MessageEvent (transação)
  └── MessageDebounceService.schedule(...)
            │  5s sem nova mensagem
            ▼
      AgentMessageBridgeService.routeInboundMessage(...)
            │
            ▼
      AgendamentoAgentService / CaptacaoAgentService
```
