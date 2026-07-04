#!/usr/bin/env node
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'api-base-url':     { type: 'string',  default: process.env.API_BASE_URL ?? 'http://localhost:3001/api/v1' },
    'dry-run':          { type: 'boolean', default: false },
    'window-minutes':   { type: 'string',  default: '30' },
    'limit-per-tenant': { type: 'string',  default: '100' },
    'template-code':    { type: 'string',  default: 'APPOINTMENT_REMINDER_24H' },
    'timeout-sec':      { type: 'string',  default: '120' },
  },
  allowPositionals: false,
});

function log(level, message) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
  console.log(`[${ts}][${level}] ${message}`);
}

const cronSecret = process.env.CRON_SECRET;
if (!cronSecret) {
  log('ERROR', 'CRON_SECRET environment variable is not set. Aborting.');
  process.exit(1);
}
if (cronSecret.length < 16) {
  log('ERROR', 'CRON_SECRET is too short (< 16 chars). Use a strong secret.');
  process.exit(1);
}

const apiBaseUrl = values['api-base-url'].replace(/\/$/, '');
const endpoint   = `${apiBaseUrl}/internal/cron/appointment-reminders`;
const timeoutMs  = parseInt(values['timeout-sec'], 10) * 1000;
const dryRun     = values['dry-run'];

log('INFO', 'Starting appointment reminders cron');
log('INFO', `Endpoint:       ${endpoint}`);
log('INFO', `DryRun:         ${dryRun}`);
log('INFO', `WindowMinutes:  ${values['window-minutes']}`);
log('INFO', `LimitPerTenant: ${values['limit-per-tenant']}`);
log('INFO', `TemplateCode:   ${values['template-code']}`);

const body = JSON.stringify({
  dryRun,
  windowMinutes:  parseInt(values['window-minutes'], 10),
  limitPerTenant: parseInt(values['limit-per-tenant'], 10),
  templateCode:   values['template-code'],
});

const ac    = new AbortController();
const timer = setTimeout(() => ac.abort(), timeoutMs);
const t0    = Date.now();

let response;
try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cron-Token': cronSecret },
    body,
    signal: ac.signal,
  });
  clearTimeout(timer);

  if (!res.ok) {
    log('ERROR', `HTTP ${res.status} calling ${endpoint}`);
    process.exit(1);
  }
  response = await res.json();
} catch (err) {
  clearTimeout(timer);
  log('ERROR', `Unexpected error: ${err.message}`);
  process.exit(1);
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
log('INFO', `Cron completed in ${elapsed}s`);
log('INFO', `ranAt:            ${response.ranAt}`);
log('INFO', `totalTenants:     ${response.totalTenants}`);
log('INFO', `processedTenants: ${response.processedTenants}`);
log('INFO', `skippedTenants:   ${response.skippedTenants}`);

if (response.dryRun) {
  log('WARN', 'DRY RUN — no messages were actually sent.');
}

let anyFailure = false;
for (const item of (response.results ?? [])) {
  if (item.status === 'skipped' && String(item.skipReason).startsWith('Error:')) {
    log('WARN', `Tenant ${item.tenantId} SKIPPED: ${item.skipReason}`);
    anyFailure = true;
  } else if ((item.summary?.failedAppointments ?? 0) > 0) {
    log('WARN', `Tenant ${item.tenantId} — sent=${item.summary.sentAppointments} failed=${item.summary.failedAppointments}`);
  } else {
    log('INFO', `Tenant ${item.tenantId} — sent=${item.summary?.sentAppointments ?? 0}`);
  }
}

if (anyFailure) {
  log('ERROR', 'One or more tenants failed with errors. Check logs above.');
  process.exit(1);
}

log('INFO', 'Appointment reminders cron finished successfully.');
process.exit(0);
