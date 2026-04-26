# Testes Críticos de Tenant Safety - Agent Layer v1

**Status**: ✅ Todos os testes críticos em GREEN  
**Data**: 17 de março de 2026  
**Risco Mitigado**: Tenant mismatch + Cross-tenant leaks

---

## 🎯 Por Que Estes Testes?

Agent Layer v1 executa skills em nome de usuários com contexto de tenant. Dois riscos máximos:

1. **Tenant Mismatch (Risk: CRÍTICO)**
   - Um agente tenta executar skill com usuário de outro tenant
   - Exemplo: Agent chamando `find_or_merge_patient` com userId de tenant-2 mas tenantId=tenant-1
   - Impacto: Acesso a dados confidenciais de outro tenant

2. **Cross-Tenant Thread Leak (Risk: CRÍTICO)**
   - Um usuário de tenant-2 consegue ler/modificar thread de tenant-1
   - Exemplo: Handoff aberto em tenant-1, mas usuário de tenant-2 consegue fechar
   - Impacto: Exposição de histórico de mensagens de pacientes

---

## ✅ Teste 1: Tenant Mismatch Prevention

**Arquivo**: `test/skill-registry/skill-actor-resolver.service.test.ts`

**Nome**: `CRITICAL: prevents tenant mismatch - rejects when user belongs to different tenant`

**O que valida**:
- SkillActorResolverService rejeita quando usuário não pertence ao tenant do contexto
- Query Prisma valida `userRoles.some.tenantId == context.tenantId`
- Sem esta validação, skill executaria com dados de outro tenant

**Cenário**:
```typescript
// Usuário pertence apenas a tenant-2
// Mas skill context pede tenant-1
// → ForbiddenException
```

**Proteção**:
- Bloqueia qualquer skill que tente usar ator de tenant errado
- Força que actor.tenantIds inclua o tenant do contexto
- Foundation para toda segurança de isolamento de tenant

---

## ✅ Testes 2-4: Cross-Tenant Thread Isolation

**Arquivo**: `test/messaging/message-threads-tenant-isolation.test.ts`

**Suite**: `MessageThreadsService - Tenant Isolation (CRITICAL)`

### Test 2: Prevents Cross-Tenant Access
**Nome**: `CRITICAL: prevents cross-tenant thread access - hides thread from other tenant`

**O que valida**:
- Usuário de tenant-2 NÃO consegue ler thread de tenant-1
- MessageThreadsService filtra por `tenantId` na query Prisma
- Thread não encontrada (NotFoundException) ao forçar tenant errado

**Cenário**:
```typescript
// Thread-123 pertence a tenant-1
// Usuário de tenant-2 tenta acessar
// Prisma.findFirst where: { id: thread-123, tenantId: tenant-2 }
// → null → NotFoundException
```

**Proteção**:
- Threads são sempre consultadas com filtro de tenant
- Garante que `getThreadById` não retorna threads de outros tenants

### Test 3: Allows Access Within Same Tenant
**Nome**: `CRITICAL: allows thread access only within same tenant`

**O que valida**:
- Usuário de tenant-1 CONSEGUE ler thread de tenant-1
- Confirma que isolamento não quebra acesso legítimo
- Prisma é chamado com tenantId correto

**Cenário**:
```typescript
// Thread-123 pertence a tenant-1
// Usuário de tenant-1 tenta acessar
// Prisma.findFirst where: { id: thread-123, tenantId: tenant-1 }
// → thread encontrada ✅
```

**Proteção**:
- Garante que isolamento de tenant não quebra funcionalidade normal
- Baseline para regressão

### Test 4: List Threads Respects Boundary
**Nome**: `CRITICAL: list threads respects tenant boundary`

**O que valida**:
- `listThreads` filtra threads por tenant do ator
- Usuário só vê threads do seu tenant
- Prisma.findMany chamado com filtro de tenant

**Cenário**:
```typescript
// Usuário de tenant-1 lista threads
// Prisma.findMany where: { tenantId: tenant-1 }
// → retorna apenas threads de tenant-1
```

**Proteção**:
- Inbox da reception mostra apenas threads do tenant
- Previne que reception de um cliente veja threads de outro

---

## 🔗 Como Estes Testes Protegem Agent Layer v1

```
User Request
    ↓
AgentController (@Roles RBAC)
    ↓
AgentOrchestratorService (correlation tracking)
    ↓
AgentRuntimeService (executes skill)
    ↓
SkillActorResolverService ← [TEST 1: Tenant Mismatch]
    ↓ (resolve actor + validate tenant)
SkillRegistryService (dispatch to handler)
    ↓
SkillHandler (e.g., openHandoff)
    ↓
MessageThreadsService ← [TESTS 2-4: Cross-Tenant]
    ↓ (query with tenantId filter)
PrismaService
    ↓
Database
```

**Fluxo Seguro**:
1. TEST 1 garante que ator pertence ao tenant
2. TESTS 2-4 garantem que dados operados são do tenant correto
3. Combinação = nenhuma execução de skill pode acessar dados de outro tenant

---

## 📊 Cobertura de Teste

| Camada | Teste | Status | Risco |
|--------|-------|--------|-------|
| Resolver | Tenant Mismatch | ✅ GREEN | MITIGADO |
| Messaging | Cross-Tenant Access | ✅ GREEN | MITIGADO |
| Messaging | Non-Existent Thread | ✅ GREEN | N/A |
| Messaging | List Boundary | ✅ GREEN | MITIGADO |

**Total Testes**: 15 skill-registry + messaging  
**Total Críticos**: 4 (1 + 3)  
**Status**: ✅ TODOS VERDES

---

## 🛡️ O Que Estes Testes NÃO Cobrem

(Out of scope para v1):

- [ ] Criptografia de dados em repouso
- [ ] Validação de assinatura de webhook WhatsApp
- [ ] Rate limiting por tenant
- [ ] Audit log completeness
- [ ] Data residency compliance

---

## 🚀 Como Rodar os Testes

```bash
# Todos os testes críticos
pnpm test test/skill-registry test/messaging

# Especificamente tenant mismatch
pnpm test test/skill-registry/skill-actor-resolver.service.test.ts

# Especificamente cross-tenant
pnpm test test/messaging/message-threads-tenant-isolation.test.ts

# Ver coverage (futuro)
pnpm test -- --coverage
```

---

## 📝 Checklist de Regressão

Antes de deployar Agent Layer v1:

- [x] Todos os 4 testes críticos em GREEN
- [x] Todos os 15 testes de skill-registry + messaging em GREEN
- [x] Build sem erros TypeScript
- [x] Documentação dos testes críticos
- [ ] Manual test: try to access thread cross-tenant (deve falhar)
- [ ] Manual test: agent executes skill for correct tenant (deve passar)

---

**Responsável**: Agent Layer v1  
**Próximo Review**: Após deploy de Reception Inbox v1  
**Escalação**: Se algum teste fica RED, bloquear merge até investigar
