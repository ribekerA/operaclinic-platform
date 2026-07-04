#!/usr/bin/env node
/**
 * Smoke test E2E de scheduling com timezone real.
 * Valida: login → switch-clinic → criar appointment com offset BRT →
 *         verificar UTC → idempotência → double-booking → confirmar → cancelar.
 */
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'api-base-url':         { type: 'string',  default: process.env.API_BASE_URL        ?? 'http://localhost:3001/api/v1' },
    'email':                { type: 'string',  default: process.env.SMOKE_EMAIL          ?? '' },
    'password':             { type: 'string',  default: process.env.SMOKE_PASSWORD       ?? '' },
    'tenant-id':            { type: 'string',  default: process.env.SMOKE_TENANT_ID      ?? '' },
    'professional-id':      { type: 'string',  default: process.env.SMOKE_PROFESSIONAL_ID ?? '' },
    'patient-id':           { type: 'string',  default: process.env.SMOKE_PATIENT_ID     ?? '' },
    'consultation-type-id': { type: 'string',  default: process.env.SMOKE_CONSULTATION_TYPE_ID ?? '' },
    'unit-id':              { type: 'string',  default: process.env.SMOKE_UNIT_ID        ?? '' },
    'tenant-timezone':      { type: 'string',  default: 'America/Sao_Paulo' },
    'starts-at-local':      { type: 'string',  default: '2099-01-15T10:00:00-03:00' },
    'dry-run':              { type: 'boolean', default: false },
    'timeout-sec':          { type: 'string',  default: '30' },
  },
  allowPositionals: false,
});

const apiBaseUrl         = values['api-base-url'].replace(/\/$/, '');
const email              = values['email'];
const password           = values['password'];
const tenantId           = values['tenant-id'];
const professionalId     = values['professional-id'];
const patientId          = values['patient-id'];
const consultationTypeId = values['consultation-type-id'];
const unitId             = values['unit-id'];
const startsAtLocal      = values['starts-at-local'];
const dryRun             = values['dry-run'];
const timeoutMs          = parseInt(values['timeout-sec'], 10) * 1000;

let passed = 0, failed = 0;
const results = [];

function log(level, message) {
  const ts = new Date().toTimeString().slice(0, 8);
  console.log(`[${ts}][${level}] ${message}`);
}

async function runCheck(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ Check: name, Status: 'PASS', Error: '' });
    log('PASS', name);
  } catch (err) {
    failed++;
    results.push({ Check: name, Status: 'FAIL', Error: err.message });
    log('FAIL', `${name} — ${err.message}`);
  }
}

async function invokeApi(method, urlPath, { headers = {}, body = null } = {}) {
  const url     = `${apiBaseUrl}${urlPath}`;
  const ac      = new AbortController();
  const timer   = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
    clearTimeout(timer);
    let data = null;
    try { data = await res.json(); } catch {}
    return { statusCode: res.status, data };
  } catch (err) {
    clearTimeout(timer);
    return { statusCode: 0, data: null, error: err.message };
  }
}

log('INFO', '=== Smoke Test: Scheduling Timezone E2E ===');
log('INFO', `ApiBaseUrl:     ${apiBaseUrl}`);
log('INFO', `TenantTimezone: ${values['tenant-timezone']}`);
log('INFO', `StartsAtLocal:  ${startsAtLocal}`);
log('INFO', `DryRun:         ${dryRun}`);

const missing = [];
if (!email)              missing.push('--email / SMOKE_EMAIL');
if (!password)           missing.push('--password / SMOKE_PASSWORD');
if (!tenantId)           missing.push('--tenant-id / SMOKE_TENANT_ID');
if (!professionalId)     missing.push('--professional-id / SMOKE_PROFESSIONAL_ID');
if (!patientId)          missing.push('--patient-id / SMOKE_PATIENT_ID');
if (!consultationTypeId) missing.push('--consultation-type-id / SMOKE_CONSULTATION_TYPE_ID');

if (missing.length > 0) {
  log('FAIL', `Missing required parameters: ${missing.join(', ')}`);
  process.exit(1);
}

const startsAtUtc = new Date(startsAtLocal);
log('INFO', `startsAt UTC expected: ${startsAtUtc.toISOString()}`);

// STEP 1 — health check
await runCheck('API está acessível (preflight)', async () => {
  const resp = await invokeApi('GET', '/auth/me');
  if (![401, 403].includes(resp.statusCode)) {
    throw new Error(`Esperado 401 em /auth/me sem token, got ${resp.statusCode}`);
  }
});

if (dryRun) {
  log('WARN', 'DRY RUN — parando após verificação de conectividade.');
  log('INFO', `=== Resultado: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

// STEP 2 — Login
let token = null;
await runCheck('Login com credenciais válidas retorna accessToken', async () => {
  const resp = await invokeApi('POST', '/auth/login', { body: { email, password } });
  if (![200, 201].includes(resp.statusCode)) throw new Error(`Login falhou com HTTP ${resp.statusCode}`);
  if (!resp.data?.accessToken) throw new Error('accessToken ausente na resposta de login');
  token = resp.data.accessToken;
});

if (!token) { log('FAIL', 'Sem token após login — abortando.'); process.exit(1); }

// STEP 3 — Switch clinic
let authHeaders = { Authorization: `Bearer ${token}` };
await runCheck('Switch clinic retorna token com activeTenantId correto', async () => {
  const resp = await invokeApi('POST', '/auth/switch-clinic', { headers: authHeaders, body: { tenantId } });
  if (![200, 201].includes(resp.statusCode)) throw new Error(`switch-clinic falhou com HTTP ${resp.statusCode}`);
  if (!resp.data?.accessToken) throw new Error('accessToken ausente após switch-clinic');
  token = resp.data.accessToken;
  authHeaders = { Authorization: `Bearer ${token}` };
});

// STEP 4 — Create appointment
const idempotencyKey = `smoke-tz-${Math.random().toString(36).slice(2, 14)}`;
let createdId = null;

await runCheck('Cria appointment com datetime em offset BRT (-03:00)', async () => {
  const body = { patientId, professionalId, consultationTypeId, startsAt: startsAtLocal, idempotencyKey };
  if (unitId) body.unitId = unitId;
  const resp = await invokeApi('POST', '/appointments', { headers: authHeaders, body });
  if (![200, 201].includes(resp.statusCode)) {
    throw new Error(`createAppointment falhou com HTTP ${resp.statusCode} — ${JSON.stringify(resp.data)}`);
  }
  createdId = resp.data?.id;
  log('INFO', `  appointmentId: ${createdId}`);
});

// STEP 5 — Timezone validation
await runCheck('startsAt retornado em UTC é o esperado da conversão de offset BRT', async () => {
  if (!createdId) throw new Error('appointment não foi criado, skip');
  const resp = await invokeApi('GET', `/appointments/${createdId}`, { headers: authHeaders });
  if (resp.statusCode !== 200) throw new Error(`getAppointment falhou com HTTP ${resp.statusCode}`);
  const returnedUtc = new Date(resp.data.startsAt);
  const diffMs = Math.abs(returnedUtc - startsAtUtc);
  if (diffMs > 1000) throw new Error(`Timezone drift! Esperado: ${startsAtUtc.toISOString()} Retornado: ${returnedUtc.toISOString()} Diff: ${diffMs}ms`);
  log('INFO', `  startsAt UTC: ${returnedUtc.toISOString()} — OK (diff=${diffMs}ms)`);
});

// STEP 6 — Idempotency
await runCheck('Idempotência — segunda criação com mesma key retorna o mesmo appointment', async () => {
  if (!createdId) throw new Error('appointment não foi criado, skip');
  const body = { patientId, professionalId, consultationTypeId, startsAt: startsAtLocal, idempotencyKey };
  if (unitId) body.unitId = unitId;
  const resp = await invokeApi('POST', '/appointments', { headers: authHeaders, body });
  if (![200, 201].includes(resp.statusCode)) throw new Error(`Segunda criação falhou HTTP ${resp.statusCode}`);
  if (resp.data?.id !== createdId) throw new Error(`Idempotência violada! IDs: ${resp.data?.id} vs ${createdId}`);
});

// STEP 7 — Double-booking → 409
await runCheck('Double-booking no mesmo slot retorna 409 Conflict', async () => {
  if (!createdId) throw new Error('appointment não foi criado, skip');
  const differentKey = `smoke-tz-conflict-${Math.random().toString(36).slice(2, 14)}`;
  const body = { patientId, professionalId, consultationTypeId, startsAt: startsAtLocal, idempotencyKey: differentKey };
  if (unitId) body.unitId = unitId;
  const resp = await invokeApi('POST', '/appointments', { headers: authHeaders, body });
  if (resp.statusCode !== 409) throw new Error(`Esperado 409 para double-booking, got HTTP ${resp.statusCode}`);
  log('INFO', '  409 Conflict recebido corretamente');
});

// STEP 8 — Confirm
await runCheck('Confirma appointment (status → CONFIRMED)', async () => {
  if (!createdId) throw new Error('appointment não foi criado, skip');
  const resp = await invokeApi('PATCH', `/appointments/${createdId}/confirm`, { headers: authHeaders });
  if (resp.statusCode !== 200) {
    if (resp.statusCode === 404) throw new Error('Endpoint PATCH /appointments/:id/confirm não encontrado');
    throw new Error(`confirm falhou com HTTP ${resp.statusCode}`);
  }
  if (resp.data?.status !== 'CONFIRMED') throw new Error(`Status esperado CONFIRMED, got ${resp.data?.status}`);
});

// STEP 9 — Cancel (cleanup)
await runCheck('Cancela appointment de smoke test (cleanup)', async () => {
  if (!createdId) throw new Error('appointment não foi criado, skip');
  const resp = await invokeApi('PATCH', `/appointments/${createdId}/cancel`, {
    headers: authHeaders,
    body: { reason: 'Smoke test cleanup' },
  });
  if (resp.statusCode !== 200) throw new Error(`cancel falhou com HTTP ${resp.statusCode}`);
  if (resp.data?.status !== 'CANCELED') throw new Error(`Status esperado CANCELED, got ${resp.data?.status}`);
  log('INFO', `  Appointment ${createdId} cancelado (cleanup)`);
});

console.log('');
log('INFO', '=== Resultado Final ===');
console.table(results);
log('INFO', `Passed: ${passed} | Failed: ${failed}`);

if (failed > 0) {
  log('FAIL', 'Smoke test FALHOU. Verifique logs acima.');
  process.exit(1);
}
log('PASS', 'Smoke test de scheduling timezone passou com sucesso.');
process.exit(0);
