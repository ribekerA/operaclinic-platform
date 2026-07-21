# CLAUDE.md — OperaClinic

SaaS multi-tenant para clínicas de estética. Fonte de verdade operacional: `docs/AI_RULES.md` (não-negociáveis), `docs/decisions.md`, `docs/ARCHITECTURE_DECISIONS_IN_CODE.md` (onde cada regra é aplicada no código). Leia antes de propor mudanças de arquitetura.

## Stack e convenções

- **Monorepo pnpm/turbo**: `apps/api` (NestJS + Prisma + Postgres), `apps/web` (Next.js 15 App Router), `apps/professional-mobile`, `packages/shared`.
- **Módulos** em `apps/api/src/modules/<nome>/`: `<nome>.module.ts`, `<nome>.controller.ts`, `<nome>.service.ts`, `<nome>-access.service.ts` (resolve tenant/RBAC), `dto/`, `interfaces/`. Provider/adapter externo (pagamento, mensageria) sempre atrás de interface + factory (mock default fora de produção) — nunca importar SDK externo direto num service de domínio.
- **Isolamento por domínio**: `commercial/` (billing) nunca importa services de `clinical`/`scheduling`/`patients` e vice-versa. `demo/` é isolado de `commercial/` real.

## Guardrails multi-tenant (obrigatório)

- **Nunca faça uma query Prisma sem `tenantId` no `where`.** Resolva o tenant via `<modulo>-access.service.ts::resolveActiveTenantId(actor)` (lança `ForbiddenException` se `actor.profile !== "clinic"` ou sem `activeTenantId`) — nunca aceite `tenantId` cru do client em endpoint autenticado.
- Endpoints públicos (`public-booking`, `demo/multi`) resolvem tenant por `slug` único, nunca por id direto do body.
- `IntegrationConnection` é `@@unique([channel, externalAccountId])` — não criar linha para pontes ad-hoc (ex.: notificação demo usa o adapter direto, sem connection).

## Enums e migrations

- Enums de estado ficam em `schema.prisma` (`enum XStatus { ... }`), nunca como string livre em código.
- Migração: `pnpm --filter api run prisma:migrate:dev --name <snake_case_descritivo>`. Pasta gerada `YYYYMMDDHHMMSS_<nome>`. Campo novo em model existente = nullable/opcional, nunca quebra dado existente.
- Tipos espelhados em `packages/shared/src/messaging.ts` (ex. `MessageEventType`) não vêm do Prisma automaticamente — ao adicionar valor de enum no schema, atualizar o tipo espelhado também ou o typecheck do `web` quebra.
- Após alterar `schema.prisma`, rodar `prisma generate` antes de typecheck.

## AuditLog e observability

- Toda ação que muda estado relevante (pagamento, onboarding, dispatch de mensagem, criação de thread) chama `AuditService.record({ action, actor, tenantId, targetType, targetId, metadata }, tx?)` — usar `AUDIT_ACTIONS` (`common/audit/audit.constants.ts`), nunca string solta.
- Fluxos com latência/erro relevante chamam `OperationalObservabilityService.recordFlow({ channel, flow, outcome, durationMs, timestamp, tenantId })` (ver `follow-ups/appointment-follow-ups.service.ts` para o padrão try/catch com `recordFlow` no catch também).

## Dispatch com dedup (padrão follow-ups, replicar sempre que houver envio automático)

Referência: `apps/api/src/modules/follow-ups/appointment-follow-ups.service.ts`.
1. Construa uma `dispatchKey` determinística (`${kind}:${entityId}:${eventTimestampISO}`).
2. Antes de processar em lote, busque `dispatchKey`s já existentes e pule os que já têm registro.
3. Crie a linha de dispatch com `status: PROCESSING` **antes** do envio; capture `P2002` (constraint única em `dispatchKey`) e trate como `ALREADY_DISPATCHED` em vez de erro.
4. Após o envio, `update` para `SENT`/`FAILED` com `dispatchedAt`/`failedAt`/`errorMessage`.
5. Nunca deixe uma falha de envio (WhatsApp, etc.) quebrar o fluxo principal que a disparou — fire-and-forget com try/catch silencioso quando a notificação é side-effect (ver `demo-founder-notification.service.ts`).

## Resposta automática de agente (nunca sem validação)

Antes de qualquer resposta automática/ação de agente, `GuardrailsService.validateContext(ConversationContext)` deve passar (`tenantId`, `threadId`, `actorUserId`, `channel` válidos) e `validateSkillAllowed`/`validateResponseAllowed` devem aprovar. Sem isso, sempre escalar para humano — nunca enviar mensagem automática direto (`docs/AI_RULES.md`: "Never make automated decisions outside explicit backend functions").

## Secrets

- Apenas via variáveis de ambiente (`ConfigService.get`, validadas em `env.validation.ts`), nunca hardcoded. Novo secret: adicionar em `env.validation.ts` + `.env.example` (placeholder, nunca valor real).

## Comandos essenciais

```bash
pnpm dev                              # turbo run dev --parallel (api :3001, web :3010)
pnpm build                            # turbo run build
pnpm typecheck                        # turbo run typecheck (tsc --noEmit em cada workspace)
pnpm test                             # turbo run test (vitest em cada workspace)
pnpm --filter api test                # só o backend
pnpm --filter web test                # só o frontend
pnpm --filter api run prisma:generate
pnpm --filter api run prisma:migrate:dev --name <nome>
pnpm --filter api prisma studio
pnpm smoke:e2e                        # seed + smoke e2e api + web
```
