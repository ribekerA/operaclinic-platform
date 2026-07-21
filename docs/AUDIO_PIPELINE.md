# Pipeline de Áudio WhatsApp (transcrição PT-BR → agente)

**Task:** AUDIO-01 — `tasks/task-audio-whatsapp-agent.md`
**Módulos:** `apps/api/src/modules/messaging`, `apps/api/src/modules/agent`, `apps/api/src/common/plan-entitlements`
**Status de produção:** pipeline completo e guardado, mas rodando com **provider de transcrição mock** — ver [Providers de transcrição](#providers-de-transcrição).

---

## 1. Visão geral do fluxo

```
WhatsApp (Meta) → webhook → MessageEvent(AUDIO, transcript=null, status=PENDING)
                              │
                              ├─ thread/preview atualizados em tempo real (gateway)
                              │
                              └─ fire-and-forget: AudioTranscriptionService.processInboundAudio()
                                     │
                                     ├─ guards (ver seção 3) — qualquer falha → rejectAudio() → handoff MEDIUM
                                     │
                                     ├─ download da mídia (Meta Media API)
                                     ├─ transcribe() no provider configurado
                                     ├─ guard de duração real + guard de confiança
                                     │
                                     └─ finalizeSuccess()
                                            ├─ MessageEvent atualizado (transcript, confidence, durationSeconds…)
                                            ├─ MessageDebounceService.schedule({ inputModality: AUDIO })
                                            └─ debounce flush → routeInboundMessage → agente (mesmo pipeline do texto)
```

O áudio nunca pula o debounce: ele entra na mesma fila de agregação que o texto (`MessageDebounceService`), evitando execução dupla do agente quando um paciente manda texto e áudio (ou dois áudios) em sequência rápida. Se qualquer mensagem acumulada numa janela de debounce for de áudio, o lote inteiro é roteado como `inputModality: AUDIO`.

Arquivo de criação do `MessageEvent` inicial: [whatsapp-webhooks.service.ts](../apps/api/src/modules/messaging/whatsapp-webhooks.service.ts) (branch `event.media`, por volta da linha 372) — cria com `contentText: null` e `metadata.transcriptionStatus: "PENDING"` antes de disparar `processInboundAudio` sem `await`.

---

## 2. Componentes principais

| Arquivo | Responsabilidade |
|---|---|
| [`whatsapp-webhooks.service.ts`](../apps/api/src/modules/messaging/whatsapp-webhooks.service.ts) | Recebe o webhook Meta, detecta `type: audio`, cria o `MessageEvent(AUDIO)` inicial, dispara a transcrição em fire-and-forget |
| [`audio-transcription.service.ts`](../apps/api/src/modules/messaging/audio-transcription.service.ts) | Orquestra toda a pipeline: guards de custo/abuso → download → transcrição → guards de qualidade → sucesso ou rejeição |
| [`transcription/transcription-provider.factory.ts`](../apps/api/src/modules/messaging/transcription/transcription-provider.factory.ts) | Resolve o provider ativo via `TRANSCRIPTION_PROVIDER` |
| [`transcription/mock-transcription.provider.ts`](../apps/api/src/modules/messaging/transcription/mock-transcription.provider.ts) | Único provider implementado hoje (ver seção 5) |
| [`adapters/meta-whatsapp.adapter.ts`](../apps/api/src/modules/messaging/adapters/meta-whatsapp.adapter.ts) | `downloadMedia`/`getMediaMetadata` — único adapter que suporta mídia hoje |
| [`platform/tenant-settings.service.ts`](../apps/api/src/modules/platform/tenant-settings.service.ts) | `getAudioSettings(tenantId)` — resolve `audio.enabled`/`maxDurationSeconds`/`minConfidence` |
| [`common/plan-entitlements/plan-entitlements.service.ts`](../apps/api/src/common/plan-entitlements/plan-entitlements.service.ts) | `checkAiConversationQuota` (conversas/mês) e `checkAudioTranscriptionQuota` (segundos transcritos/mês) |
| [`messaging-webhook-abuse-protection.service.ts`](../apps/api/src/modules/messaging/messaging-webhook-abuse-protection.service.ts) | `checkAudioSenderRateLimit` — limite por número remetente |
| [`audio-transcription-sweep-cron.controller.ts`](../apps/api/src/modules/messaging/audio-transcription-sweep-cron.controller.ts) | Cron de segurança para eventos travados em `PENDING` |
| [`message-debounce.service.ts`](../apps/api/src/modules/messaging/message-debounce.service.ts) | Agrega texto/áudio numa janela antes de rotear ao agente; resolve `inputModality` do lote |

---

## 3. Guardrails (ordem de execução em `processInboundAudio`)

Cada guard, ao falhar, chama `rejectAudio()`: atualiza o `MessageEvent` (`transcriptionStatus: REJECTED_<code>`), abre `HandoffRequest` automático de prioridade **MEDIUM** (com transcript parcial anexado quando existir) e atualiza a thread/gateway — o paciente **nunca fica sem retorno**, mesmo que seja a recepção assumindo manualmente.

| # | Guard | Reason code | Roda antes/depois do download | Custo de provider incorrido? |
|---|---|---|---|---|
| 1 | `audio.enabled` do tenant | `DISABLED` | antes | Não |
| 2 | Rate limit por remetente (§6) | `RATE_LIMITED` | antes | Não |
| 3 | Quota de conversas IA/mês (`monthlyAiConversations`) | `QUOTA_EXCEEDED` | antes | Não |
| 4 | Quota de segundos de transcrição/mês (`monthlyTranscriptionSeconds`, §7) | `TRANSCRIPTION_QUOTA_EXCEEDED` | antes | Não |
| 5 | Provider de mensageria sem suporte a mídia (`adapter.downloadMedia` ausente) | `PROVIDER_UNSUPPORTED` | antes | Não |
| 6 | Proxy de tamanho de arquivo vs. `maxDurationSeconds` (§4) | `DURATION_EXCEEDED_ESTIMATED` | antes | Não |
| — | *(download + transcrição real acontecem aqui)* | — | — | **Sim** |
| 7 | Duração real transcrita > `maxDurationSeconds` | `DURATION_EXCEEDED` | depois | Sim |
| 8 | Confiança da transcrição < `minConfidence` | `LOW_CONFIDENCE` | depois | Sim |
| — | Qualquer exceção não tratada em qualquer ponto | `PROCESSING_ERROR` | qualquer | Depende (ver nota) |
| — | *(cron de segurança, não faz parte do caminho principal)* | `STUCK_TIMEOUT` | — | Indefinido |

Guards 1-6 rodam **antes** de baixar a mídia (checagem de custo no caminho principal, não como etapa isolada pós-processamento) — nenhum deles gasta banda ou dinheiro de provider. Os guards 7-8 só existem porque a duração/confiança reais só são conhecidas depois da transcrição.

**Nota sobre `PROCESSING_ERROR`:** se a exceção ocorrer *depois* da transcrição ter rodado (ex.: falha ao gravar no banco em `finalizeSuccess`), o custo foi incorrido mas não é contabilizado na quota de segundos (§7), porque o resultado da transcrição não está acessível no bloco `catch` genérico. É uma lacuna conhecida e deliberadamente não corrigida — o cenário é raro e corrigi-lo exigiria replumbing do try/catch para pouco ganho.

### 3.1 Proxy de tamanho pré-download

Como a duração real só é conhecida após a transcrição, o guard 6 estima a duração a partir do tamanho do arquivo (`getMediaMetadata`), assumindo um bitrate conservador de **4.000 bytes/s** com margem de segurança de **1,5×** (`ASSUMED_BYTES_PER_SECOND` / `SIZE_PROXY_SAFETY_MARGIN` em `audio-transcription.service.ts`). A heurística é deliberadamente leniente — subestima a duração real — para nunca rejeitar uma mensagem legítima antes da checagem real pós-transcrição; ela só existe para barrar arquivos claramente acima do limite antes de gastar banda com o download completo.

---

## 4. Configuração por tenant (`TenantSetting`)

| Chave | Default global (em código) | Descrição |
|---|---|---|
| `audio.enabled` | `true` | Liga/desliga a transcrição de áudio para o tenant |
| `audio.maxDurationSeconds` | `120` | Duração máxima aceita (usada tanto no proxy de tamanho quanto na checagem pós-transcrição) |
| `audio.minConfidence` | `0.6` | Confiança mínima da transcrição para aceitar automaticamente |

Os defaults são resolvidos em código (`TenantSettingsService.AUDIO_SETTING_DEFAULTS`), não seedados por clínica — um tenant sem override em `tenant_settings` recebe esses valores automaticamente. Para sobrescrever por tenant, gravar as chaves acima em `TenantSetting` (mesmo endpoint genérico de settings já usado para outras configurações).

Quando `audio.enabled=false`, o paciente recebe o comportamento de fallback (handoff automático com `DISABLED`) em vez de silêncio — não existe hoje uma mensagem de template automática de "áudio não suportado" enviada de volta ao paciente pelo canal; a recepção assume via handoff.

---

## 5. Providers de transcrição

Interface (`transcription-provider.interface.ts`):

```ts
interface TranscriptionProvider {
  transcribe(audio: Buffer, opts: { language: string; mimeType: string }):
    Promise<{ text: string; confidence: number; durationSeconds: number }>;
}
```

Seleção via `TRANSCRIPTION_PROVIDER` (env): `mock` | `whisper` | `deepgram`.

**Estado atual — importante:** apenas o provider `mock` está implementado (`MockTranscriptionProvider`, retorna um texto fixo em PT-BR com confiança 0.95 e duração 8s, para qualquer áudio). Selecionar `whisper` ou `deepgram` faz `TranscriptionProviderFactory.getProvider()` lançar um erro explícito no momento do uso — a factory não falha o boot da API (áudio é feature opcional gateada por tenant), mas qualquer tentativa real de transcrição com esses providers falha e cai no guard `PROCESSING_ERROR` → handoff.

Em produção (`render.yaml`), `TRANSCRIPTION_PROVIDER` não está setado, então o valor resolvido é `mock` em todos os ambientes hoje. **Antes de qualquer demo/piloto real com pacientes, é necessário implementar um provider real (Whisper ou Deepgram) e configurar a env var** — isso está fora do escopo do que foi implementado neste pipeline (etapas 1-10 do plano), que cobriu toda a orquestração/guardrails/observabilidade em torno da transcrição, não os adapters de provider externo.

---

## 6. Rate limiting anti-abuso

Reaproveita a tabela `webhook_rate_limits` (mesmo mecanismo de upsert atômico já usado pelas regras de webhook), mas com uma chave dedicada: `receive_whatsapp_audio:{tenantId}:{senderPhoneNumber}` — **limite: 10 áudios / 15 min por número remetente**.

A regra existente de webhook (`receive_whatsapp_webhook`) é keyed por fingerprint IP+User-Agent da requisição HTTP — como todo webhook do WhatsApp é relayado pela infraestrutura da Meta, esse fingerprint é essencialmente o mesmo para todos os remetentes de um tenant. Reaproveitá-la não isolaria um paciente específico enviando spam de áudio; throttlaria o tráfego do tenant inteiro. Por isso a nova regra é keyed por `tenantId + senderPhoneNumber`.

Diferença de execução: a regra HTTP (`assertWithinLimit`) lança `HttpException` porque roda dentro do ciclo request/response. `checkAudioSenderRateLimit` **retorna** `{ allowed, limit }` em vez de lançar, porque é chamada de dentro do pipeline fire-and-forget — quando ela roda, a resposta HTTP do webhook já foi enviada, não há mais um request context para anexar um 429.

Em erro de banco, ambas degradam graciosamente (permitem a mensagem passar e logam um warning) — nunca bloqueiam por indisponibilidade da própria infraestrutura de rate limit.

---

## 7. Limites de custo por plano

### 7.1 Estimativa de custo (referência do task spec)

Whisper ≈ US$ 0,006/min. Áudio médio de 30s ⇒ ~US$ 0,003/mensagem. 1.000 áudios/mês/clínica ≈ US$ 3 — irrelevante frente ao ticket médio, mas o hard limit por plano protege contra abuso (ex.: spam automatizado de áudios longos).

### 7.2 Duas quotas independentes, complementares

| Quota | Métrica | Onde vive | Reaproveitada de |
|---|---|---|---|
| `monthlyAiConversations` | Threads distintas com ≥1 `AgentExecution` no mês | `PlanLimits.monthlyAiConversations` | Guard genérico já existente para todo o agente (texto+áudio); replicado no início da pipeline de áudio para não gastar transcrição em vão quando a conversa já seria bloqueada de qualquer forma |
| `monthlyTranscriptionSeconds` | Soma de `durationSeconds` de todo `MessageEvent(AUDIO)` cuja transcrição realmente rodou, no mês | `PlanLimits.monthlyTranscriptionSeconds` (novo) | Nova — protege especificamente o custo do provider de transcrição |

Valores atuais por plano (`packages/shared/src/plan-features.ts`) — **placeholders, seguem a mesma proporção 4× já usada em `monthlyAiConversations`, não validados com números reais de negócio**:

| Plano | `monthlyAiConversations` | `monthlyTranscriptionSeconds` |
|---|---|---|
| `ESTETICA_START` | 200 | 3.000 (50 min) |
| `ESTETICA_FLOW` | 800 | 12.000 (200 min) |
| `ESTETICA_SCALE` | ilimitado (`null`) | ilimitado (`null`) |

Ambos os limites aceitam override por tenant via `TenantSetting` (prefixo `PLAN_LIMIT_OVERRIDE_SETTING_PREFIX`), mesmo mecanismo usado para `maxProfessionals`/`maxUnits`.

### 7.3 Como o guard de segundos funciona

A duração real de um áudio só é conhecida *depois* da transcrição, então o pré-check (guard 4, §3) é conservador: usa `maxDurationSeconds` do tenant como incremento de pior caso —

```
usedSecondsThisMonth + maxDurationSeconds > limit  →  rejeita antes de baixar a mídia
```

`usedSecondsThisMonth` é calculado ao vivo (sem tabela de contador separada, mesmo padrão de `monthlyAiConversations`) somando `metadata->>'durationSeconds'` de todo `MessageEvent(AUDIO)` do tenant desde o início do mês corrente (UTC). Isso inclui não só transcrições aceitas (`COMPLETED`), mas também as rejeitadas *depois* de transcritas (`DURATION_EXCEEDED`, `LOW_CONFIDENCE`) — porque o provider já foi cobrado nesses casos. Rejeições pré-transcrição nunca gravam `durationSeconds` e portanto nunca entram na soma.

---

## 8. Cron de segurança (sweep)

`POST /internal/cron/audio-transcription-sweep`, protegido por `CronGuard` (header `X-Cron-Token: <CRON_SECRET>`, fail-secure se `CRON_SECRET` não estiver configurado).

Cobre o caso em que o pipeline fire-and-forget nunca chega a um estado terminal (ex.: restart do processo no meio da transcrição, deixando o `MessageEvent` preso em `transcriptionStatus: PENDING` indefinidamente). Sob operação normal, não deveria encontrar nada.

Parâmetros (body, todos opcionais): `dryRun` (default `false`), `staleThresholdMinutes` (default `10`, considera "preso" um evento `PENDING` com mais de N minutos), `lookbackHours` (default `24` — limita a janela de busca para manter a query um range scan bounded no índice existente de `occurredAt`, já que não há índice em `transcriptionStatus`/`metadata`), `limit` (default `200`).

**Não está agendado em produção hoje** — o endpoint existe e é testável manualmente (`curl` com o token), mas não há `cron:` no `render.yaml` (nenhum outro cron do projeto, como `appointment-follow-ups`, está agendado ali também). Precisa ser conectado a um mecanismo externo (Render Cron Job, GitHub Actions, etc.) antes do piloto.

---

## 9. Observabilidade

**Implementado:** `AgentExecution.inputModality` (`TEXT | AUDIO`) é gravado em toda execução do agente por palavra-chave (`agent-orchestrator.service.ts`), propagado desde `MessageDebounceService` → `AgentBridgeInboundPayload` → `executeCaptacao`/`executeAgendamento`.

**Não implementado (lacunas conhecidas, fora do escopo das etapas 1-10):**
- Nenhum dashboard do command center lê `inputModality` ainda — o critério de aceite "% de conversas por modalidade" (item 5 do task spec) não tem UI/agregação construída, só a coluna crua no banco.
- O agente LLM via Anthropic (`anthropic-scheduling-agent.service.ts`) nunca recebe `inputModality` nem persiste `AgentExecution` — gap pré-existente, não introduzido por este pipeline, mas relevante caso esse agente seja ativado no futuro (hoje desligado via `ANTHROPIC_AGENT_ENABLED=false`).
- Não há barra de uso de `monthlyTranscriptionSeconds` no `PlanEntitlementsSummary`/frontend (`GET clinic/plan-entitlements` só reporta `usage.aiConversations` hoje) — o guard de backend funciona independentemente disso, mas o tenant não vê visualmente o consumo.

---

## 10. Fora de escopo (fase 2, conforme task spec)

- Resposta em áudio (TTS)
- Áudio de Instagram
- Diarização / múltiplos falantes
- Áudio da profissional para prontuário (task separada)
- Providers reais de transcrição (Whisper/Deepgram) — interface e seleção prontas, adapters não implementados
