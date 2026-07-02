#!/usr/bin/env node
import { parseArgs } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'base-url':         { type: 'string' },
    'bearer-token':     { type: 'string', default: '' },
    'interval-minutes': { type: 'string', default: '15' },
    'duration-hours':   { type: 'string', default: '24' },
    'output-csv':       { type: 'string', default: 'agent-readiness-snapshots.csv' },
  },
  allowPositionals: false,
});

if (!values['base-url']) {
  console.error('Error: --base-url is required');
  process.exit(1);
}

const baseUrl         = values['base-url'].replace(/\/$/, '');
const bearerToken     = values['bearer-token'];
const intervalMinutes = parseInt(values['interval-minutes'], 10);
const durationHours   = parseFloat(values['duration-hours']);
const outputCsv       = values['output-csv'];

function toNum(v, def = 0) {
  const n = parseFloat(v);
  return isNaN(n) ? def : n;
}

function objectsToCsv(objects) {
  if (!objects.length) return '';
  const headers = Object.keys(objects[0]);
  const rows = objects.map(obj =>
    headers.map(h => {
      const v = String(obj[h] ?? '');
      return v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

async function getSnapshot(url, token) {
  const readinessUrl = `${url}/api/v1/health/readiness`;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(readinessUrl, { headers, signal: ac.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const iterations = Math.max(1, Math.ceil((durationHours * 60) / intervalMinutes));
const outputDir  = path.dirname(outputCsv);

if (outputDir && outputDir !== '.') {
  await fs.mkdir(outputDir, { recursive: true });
}

console.log(`Starting readiness collection for ${durationHours} hour(s) at ${intervalMinutes}-minute interval(s).`);
console.log(`Target: ${baseUrl}/api/v1/health/readiness`);

const rows = [];

for (let i = 1; i <= iterations; i++) {
  const timestamp = new Date().toISOString();
  try {
    const response   = await getSnapshot(baseUrl, bearerToken);
    const agentCheck = response.checks?.agent ?? {};
    const metrics    = agentCheck.metrics ?? {};

    const row = {
      timestamp,
      serviceStatus:          String(response.status ?? ''),
      agentStatus:            String(agentCheck.status ?? ''),
      enabled:                String(agentCheck.enabled ?? ''),
      rolloutPercentage:      toNum(agentCheck.rolloutPercentage),
      totalExecutions:        toNum(metrics.totalExecutions),
      successCount:           toNum(metrics.successCount),
      failureCount:           toNum(metrics.failureCount),
      failureRate:            toNum(metrics.failureRate),
      p95LatencyMs:           toNum(metrics.p95LatencyMs),
      avgLatencyMs:           toNum(metrics.avgLatencyMs),
      degradedByFailureRate:  String(agentCheck.alerts?.failureRateBreached ?? ''),
      degradedByP95:          String(agentCheck.alerts?.p95Breached ?? ''),
      notes: 'ok',
    };
    rows.push(row);
    console.log(`[${i}/${iterations}] ${timestamp} -> status=${row.serviceStatus} agent=${row.agentStatus} failureRate=${row.failureRate} p95=${row.p95LatencyMs}`);
  } catch (err) {
    rows.push({
      timestamp,
      serviceStatus: 'error', agentStatus: 'unknown', enabled: 'unknown',
      rolloutPercentage: 0, totalExecutions: 0, successCount: 0,
      failureCount: 0, failureRate: 0, p95LatencyMs: 0, avgLatencyMs: 0,
      degradedByFailureRate: 'unknown', degradedByP95: 'unknown',
      notes: err.message,
    });
    console.log(`[${i}/${iterations}] ${timestamp} -> request failed: ${err.message}`);
  }

  if (i < iterations) {
    await new Promise(r => setTimeout(r, intervalMinutes * 60 * 1000));
  }
}

await fs.writeFile(outputCsv, objectsToCsv(rows), 'utf8');
console.log(`Collection finished. Output file: ${outputCsv}`);
