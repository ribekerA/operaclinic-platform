#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'base-url':    { type: 'string', default: 'http://localhost:3001' },
    'timeout-sec': { type: 'string', default: '5' },
  },
  allowPositionals: false,
});

const baseUrl      = values['base-url'].replace(/\/$/, '');
const timeoutMs    = parseInt(values['timeout-sec'], 10) * 1000;
const readinessUrl = `${baseUrl}/api/v1/health/readiness`;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.dirname(scriptDir);

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

const ac    = new AbortController();
const timer = setTimeout(() => ac.abort(), timeoutMs);

try {
  const res  = await fetch(readinessUrl, { signal: ac.signal });
  clearTimeout(timer);
  const data        = await res.json();
  const status      = data.status ?? 'unknown';
  const agentStatus = data.checks?.agent?.status ?? 'unknown';

  console.log('API already reachable. Skipping duplicate start.');
  console.log(`URL: ${readinessUrl}`);
  console.log(`serviceStatus: ${status}`);
  console.log(`agentStatus: ${agentStatus}`);
  printCheckSummary(data.checks);
  process.exit(0);
} catch {
  clearTimeout(timer);
  console.log('API not reachable yet. Starting dev server...');
  console.log(`Target URL: ${readinessUrl}`);
}

const result = spawnSync('pnpm', ['--filter', '@operaclinic/api', 'start:dev'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
