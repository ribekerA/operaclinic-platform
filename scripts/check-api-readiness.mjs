#!/usr/bin/env node
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'base-url':       { type: 'string',  default: 'http://localhost:3001' },
    'timeout-sec':    { type: 'string',  default: '10' },
    'require-healthy': { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

const baseUrl      = values['base-url'].replace(/\/$/, '');
const timeoutMs    = parseInt(values['timeout-sec'], 10) * 1000;
const requireHealthy = values['require-healthy'];
const readinessUrl = `${baseUrl}/api/v1/health/readiness`;

function printCheckSummary(checks) {
  if (!checks || typeof checks !== 'object') return;
  const problems = [];
  for (const [name, check] of Object.entries(checks)) {
    if (!check || check.status === 'ok') continue;
    const issues = Array.isArray(check.issues) && check.issues.length > 0
      ? check.issues.join(' | ')
      : 'sem detalhes';
    problems.push(`- ${name}: ${check.status} :: ${issues}`);
  }
  if (problems.length > 0) {
    console.log('dependencyIssues:');
    problems.forEach(p => console.log(p));
  }
}

const ac = new AbortController();
const timer = setTimeout(() => ac.abort(), timeoutMs);

try {
  const res = await fetch(readinessUrl, { signal: ac.signal });
  clearTimeout(timer);
  const data = await res.json();
  const status      = data.status ?? 'unknown';
  const agentStatus = data.checks?.agent?.status ?? 'unknown';

  console.log('API readiness reachable.');
  console.log(`URL: ${readinessUrl}`);
  console.log(`serviceStatus: ${status}`);
  console.log(`agentStatus: ${agentStatus}`);
  printCheckSummary(data.checks);

  if (requireHealthy && status !== 'ok') {
    console.log('strictMode: failed because serviceStatus is not ok.');
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  clearTimeout(timer);
  console.log('API readiness unreachable.');
  console.log(`URL: ${readinessUrl}`);
  console.log(`error: ${err.message}`);
  process.exit(1);
}
