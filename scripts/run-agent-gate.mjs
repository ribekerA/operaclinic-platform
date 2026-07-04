#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'base-url':               { type: 'string' },
    'bearer-token':           { type: 'string', default: '' },
    'interval-minutes':       { type: 'string', default: '15' },
    'duration-hours':         { type: 'string', default: '24' },
    'failure-rate-threshold': { type: 'string', default: '0.05' },
    'p95-threshold-ms':       { type: 'string', default: '1500' },
    'min-snapshots':          { type: 'string', default: '3' },
    'environment':            { type: 'string', default: 'staging' },
    'output-csv':             { type: 'string', default: 'agent-readiness-staging-5pct.csv' },
    'output-report':          { type: 'string', default: 'agent-gate-report-staging-5pct.md' },
    'validation-doc':         { type: 'string', default: 'docs/AI_OPERATIONAL_VALIDATION_2026-04-03.md' },
  },
  allowPositionals: false,
});

if (!values['base-url']) {
  console.error('Error: --base-url is required');
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.dirname(scriptDir);

function isLocal(env) {
  return /^(local|dev-local|lab-local)/.test(env);
}

function resolvePath(p) {
  return path.isAbsolute(p) ? p : path.resolve(repoRoot, p);
}

const environment = values['environment'];
let validationDoc = values['validation-doc'];

if (isLocal(environment) && validationDoc === 'docs/AI_OPERATIONAL_VALIDATION_2026-04-03.md') {
  validationDoc = 'tmp/AGENT_GATE_LOCAL_VALIDATION.md';
}

if (!isLocal(environment)) {
  const durationHours = parseFloat(values['duration-hours']);
  const minSnapshots  = parseInt(values['min-snapshots'], 10);
  if (durationHours < 1) {
    console.error('Non-local environments require --duration-hours >= 1');
    process.exit(1);
  }
  if (minSnapshots < 3) {
    console.error('Non-local environments require --min-snapshots >= 3');
    process.exit(1);
  }
  if (validationDoc.startsWith('tmp/')) {
    console.error('Non-local environments must publish to the official validation document, not tmp/*.');
    process.exit(1);
  }
}

const resolvedCsv           = resolvePath(values['output-csv']);
const resolvedReport        = resolvePath(values['output-report']);
const resolvedValidationDoc = resolvePath(validationDoc);

const collectScript  = path.join(scriptDir, 'collect-agent-readiness.mjs');
const evaluateScript = path.join(scriptDir, 'evaluate-agent-gate.mjs');
const publishScript  = path.join(scriptDir, 'publish-agent-gate-result.mjs');

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Script failed: ${path.basename(script)}`);
    process.exit(result.status ?? 1);
  }
}

console.log('[1/3] Collecting readiness snapshots...');
const collectArgs = [
  '--base-url',         values['base-url'],
  '--interval-minutes', values['interval-minutes'],
  '--duration-hours',   values['duration-hours'],
  '--output-csv',       resolvedCsv,
];
if (values['bearer-token']) collectArgs.push('--bearer-token', values['bearer-token']);
run(collectScript, collectArgs);

console.log('[2/3] Evaluating gate decision...');
run(evaluateScript, [
  '--input-csv',              resolvedCsv,
  '--failure-rate-threshold', values['failure-rate-threshold'],
  '--p95-threshold-ms',       values['p95-threshold-ms'],
  '--min-snapshots',          values['min-snapshots'],
  '--output-markdown',        resolvedReport,
]);

console.log('[3/3] Publishing gate result...');
run(publishScript, [
  '--report-markdown', resolvedReport,
  '--validation-doc',  resolvedValidationDoc,
  '--environment',     environment,
  '--evidence-csv',    resolvedCsv,
  '--evidence-report', resolvedReport,
]);

console.log('Agent gate pipeline finished successfully.');
console.log(`CSV: ${resolvedCsv}`);
console.log(`Report: ${resolvedReport}`);
console.log(`ValidationDoc: ${resolvedValidationDoc}`);
