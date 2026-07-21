# Task: Agente entende áudio de WhatsApp (voice-to-intent)

## Header
- Task ID: AUDIO-01
- Sprint: pré-piloto
- Title: Pipeline de áudio inbound WhatsApp → transcrição PT-BR → intent router existente
- Owner: —
- Status: Todo
- Priority: P0 (killer feature de demo)

## Context
- Business context: paciente brasileiro manda áudio, não texto. Nenhum concorrente nacional (Belle, Trinks, Clínica nas Nuvens, IterClinic) processa áudio conversacionalmente — a Belle só transcreve áudio para prontuário. Esta feature é o diferencial de demonstração nº 1 para fechar clínicas fundadoras.
- Related decisions (`docs/decisions.md`): manter arquitetura de agente com guardrails; nenhuma resposta automática sem ValidationContext.
- Related modules: `messaging` (whatsapp-webhooks.service, message-debounce.service, adapters), `agent` (IntentRouter, CaptacaoAgentService), `common/observability`.

## Objective
Quando um paciente enviar mensagem de voz no WhatsApp, o sistema baixa a mídia, transcreve em PT-BR, injeta o texto transcrito no mesmo pipeline de classificação de intenção já existente e responde normalmente — com fallback seguro para handoff humano quando a transcrição falhar ou tiver baixa confiança.

## Scope
- In scope:
  - Recepção de webhook Meta com `type: "audio"` (e `voice: true`)
  - Download da mídia via Media API da Meta (GET media URL com token da IntegrationConnection do tenant)
  - Transcrição via provider plugável (interface `TranscriptionProvider`; implementação inicial: OpenAI Whisper API ou Deepgram nova-2 PT-BR — decidir por custo/latência; ambos atrás da mesma interface)
  - Persistência: novo `MessageEventType.AUDIO` com payload contendo `mediaId`, `durationSeconds`, `transcript`, `transcriptConfidence`, `transcriptionProvider`, `transcriptionLatencyMs`
  - Injeção do transcript no fluxo existente: mesmo caminho que mensagem de texto após o debounce (message-debounce.service) → IntentRouter → agente
  - Guardrails: (a) áudio > 120s → não transcreve, responde template educado pedindo resumo em texto OU abre handoff MEDIUM (configurável por tenant via TenantSetting `audio.maxDurationSeconds`); (b) confiança < limiar (TenantSetting `audio.minConfidence`, default 0.6) → handoff MEDIUM com transcript parcial anexado; (c) falha de download/transcrição → handoff MEDIUM, nunca silêncio
  - Observabilidade: registrar em AgentExecution o campo de origem `inputModality: TEXT | AUDIO`; métricas no command center: % mensagens em áudio, latência média de transcrição, taxa de fallback
  - Custo por tenant: contador de segundos transcritos/mês em TenantFeature ou tabela de usage, com hard limit por plano (proteção de custo)
  - Rate limit: reutilizar messaging-webhook-abuse-protection para mídia (máx N áudios/minuto por thread)
- Out of scope (fase 2):
  - Resposta em áudio (TTS)
  - Áudio de Instagram
  - Diarização / múltiplos falantes
  - Áudio da profissional para prontuário (task separada, P2)

## Design técnico

### 1. Webhook (whatsapp-webhooks.service.ts)
Hoje o service extrai texto e faz truncatePreview. Adicionar branch:
```
if (message.type === "audio") {
  enqueue AudioTranscriptionJob {
    tenantId, threadId, messageEventId (criado com type AUDIO, transcript null),
    mediaId: message.audio.id, connectionId
  }
  // NÃO roteia para o agente ainda — roteia após transcrição
}
```
Criar o MessageEvent imediatamente (direction INBOUND, type AUDIO, transcript pendente) para a recepção ver "🎤 áudio recebido (transcrevendo…)" em tempo real no painel via gateway existente.

### 2. Worker de transcrição (novo: messaging/transcription/)
- `transcription.processor.ts` — consome o job (usar o mecanismo async já existente no projeto para follow-ups/cron; se não houver fila, cron de varredura a cada 5s sobre MessageEvents AUDIO com transcript null + status PENDING é aceitável para o piloto)
- Passo 1: GET `https://graph.facebook.com/v21.0/{mediaId}` com token do tenant → URL temporária → download do binário (formato: ogg/opus)
- Passo 2: `TranscriptionProvider.transcribe(buffer, { language: "pt" })` → `{ text, confidence, durationSeconds }`
- Passo 3: atualizar MessageEvent com transcript + metadados; emitir para o gateway (recepção vê o texto do áudio no painel — valor para o humano mesmo quando o agente escala)
- Passo 4: chamar o mesmo entrypoint que o texto usa pós-debounce (extrair método público, ex. `routeInboundToAgent(threadId, text, { inputModality: "AUDIO" })`) — reutilizar 100% do pipeline de intenção/guardrails existente

### 3. Interface plugável
```ts
interface TranscriptionProvider {
  transcribe(audio: Buffer, opts: { language: string; mimeType: string }):
    Promise<{ text: string; confidence: number; durationSeconds: number }>;
}
```
Implementações: `WhisperTranscriptionProvider`, `DeepgramTranscriptionProvider`. Seleção via env `TRANSCRIPTION_PROVIDER`. Secrets via env, nunca no banco.

### 4. Migração Prisma
- Enum `MessageEventType`: adicionar `AUDIO` (verificar enum atual antes)
- MessageEvent: campos opcionais `transcript` (Text), `transcriptConfidence` (Float), `mediaDurationSeconds` (Int), `mediaProviderId` (VarChar) — ou payload JSON se MessageEvent já usa payload JSON (verificar schema e seguir o padrão existente)
- TenantSetting seeds: `audio.enabled` (default true), `audio.maxDurationSeconds` (120), `audio.minConfidence` (0.6)

## Deliverables
- Documentation: `docs/AUDIO_PIPELINE.md` (fluxo, fallbacks, custos por provider, limites por plano)
- Code: itens acima
- Tests: unit + integration abaixo

## Acceptance criteria
1. Áudio de até 120s enviado por paciente resulta em resposta correta do agente no WhatsApp em < 15s p95 (transcrição + intent + resposta)
2. Áudio com transcrição de confiança < limiar abre HandoffRequest MEDIUM com transcript parcial visível no painel da recepção
3. Falha de download ou do provider NUNCA deixa o paciente sem resposta: fallback envia mensagem padrão + handoff
4. Recepção vê o transcript do áudio na thread do painel, com indicador de que era áudio
5. AgentExecution registra inputModality e o command center exibe % de conversas por modalidade
6. Tenant com `audio.enabled=false` recebe comportamento antigo (mensagem de que áudio não é suportado ou handoff, conforme setting)
7. Limite mensal de segundos por plano bloqueia transcrição excedente com handoff, sem erro 500
8. Nenhuma regressão nos testes de messaging e agent existentes

## Test plan
- Unit tests: parser do webhook para type audio; guardrail de duração; guardrail de confiança; seleção de provider; contabilização de usage
- Integration tests: webhook fake com payload audio → MessageEvent AUDIO criado → mock do provider retorna transcript → agente responde (mock do adapter outbound); cenário de falha do provider → handoff criado
- Contract tests: shape do payload Meta v21 para audio messages (fixture real anonimizada)
- Mocks required: Meta Media API (download), TranscriptionProvider
- Estimated external API cost impact: Whisper ≈ US$0.006/min; áudio médio 30s ⇒ ~US$0.003/mensagem. 1.000 áudios/mês/clínica ≈ US$3. Irrelevante vs. tíquete — mas o hard limit por plano protege contra abuso.

## Demo script (para venda)
Gravar áudio real: "Oi, queria saber quanto tá a limpeza de pele e se vocês têm horário no sábado de manhã". Mostrar: transcript aparecendo no painel + resposta do agente com preço (FAQ) + oferta de horários de sábado. Esse é o momento que fecha a fundadora.
