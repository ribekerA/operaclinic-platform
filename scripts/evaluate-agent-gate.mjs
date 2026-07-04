#!/usr/bin/env node
import { parseArgs } from 'node:util';
import fs from 'node:fs/promises';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'input-csv':              { type: 'string' },
    'failure-rate-threshold': { type: 'string', default: '0.05' },
    'p95-threshold-ms':       { type: 'string', default: '1500' },
    'min-snapshots':          { type: 'string', default: '3' },
    'output-markdown':        { type: 'string', default: 'agent-gate-report.md' },
  },
  allowPositionals: false,
});

if (!values['input-csv']) {
  console.error('Error: --input-csv is required');
  process.exit(1);
}

const inputCsv             = values['input-csv'];
const failureRateThreshold = parseFloat(values['failure-rate-threshold']);
const p95ThresholdMs       = parseFloat(values['p95-threshold-ms']);
const minSnapshots         = parseInt(values['min-snapshots'], 10);
const outputMarkdown       = values['output-markdown'];

function toNum(v, def = 0) {
  const n = parseFloat(v);
  return isNaN(n) ? def : n;
}

function csvToObjects(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        vals.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    vals.push(cur);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

let rawText;
try {
  rawText = await fs.readFile(inputCsv, 'utf8');
} catch {
  console.error(`Input CSV not found: ${inputCsv}`);
  process.exit(1);
}

const rows = csvToObjects(rawText);
if (!rows.length) {
  console.error(`Input CSV is empty: ${inputCsv}`);
  process.exit(1);
}

const totalSnapshots = rows.length;
const errorSnapshots = rows.filter(r => r.serviceStatus === 'error').length;
const validRows      = rows.filter(r => r.serviceStatus !== 'error');

const failureRates = validRows.map(r => toNum(r.failureRate));
const p95Values    = validRows.map(r => toNum(r.p95LatencyMs));

const maxFailureRate = failureRates.length ? Math.max(...failureRates) : 0;
const avgFailureRate = failureRates.length ? failureRates.reduce((a, b) => a + b, 0) / failureRates.length : 0;
const maxP95         = p95Values.length    ? Math.max(...p95Values)    : 0;
const avgP95         = p95Values.length    ? p95Values.reduce((a, b) => a + b, 0) / p95Values.length : 0;

const failureRateBreaches = validRows.filter(r => toNum(r.failureRate)   > failureRateThreshold).length;
const p95Breaches         = validRows.filter(r => toNum(r.p95LatencyMs) > p95ThresholdMs).length;
const degradedChecks      = validRows.filter(r =>
  r.agentStatus === 'degraded' ||
  r.degradedByFailureRate === 'True' ||
  r.degradedByP95 === 'True'
).length;

const hasEnoughSnapshots  = totalSnapshots >= minSnapshots;
const hasRequestErrors    = errorSnapshots > 0;
const hasThresholdBreaches = failureRateBreaches > 0 || p95Breaches > 0;
const hasDegradationSignals = degradedChecks > 0;

let decision      = 'ADVANCE_TO_25';
let decisionReason = 'No threshold breaches or degradation signals detected.';
const generatedAt = new Date().toISOString();

if (!hasEnoughSnapshots) {
  decision      = 'HOLD_AT_5';
  decisionReason = 'Insufficient snapshots for a reliable 24h decision.';
} else if (hasRequestErrors && errorSnapshots >= Math.ceil(totalSnapshots / 3)) {
  decision      = 'ROLLBACK_TO_0';
  decisionReason = 'High proportion of readiness request errors during observation window.';
} else if (hasThresholdBreaches || hasDegradationSignals) {
  decision      = 'HOLD_AT_5';
  decisionReason = 'Threshold breaches or degraded agent signals detected.';
}

const report = [
  '# Agent Gate Evaluation Report',
  '',
  `GeneratedAt: ${generatedAt}`,
  `InputCsv: ${inputCsv}`,
  '',
  '## Decision',
  '',
  `- Decision: ${decision}`,
  `- Reason: ${decisionReason}`,
  '',
  '## Metrics Summary',
  '',
  `- Total snapshots: ${totalSnapshots}`,
  `- Error snapshots: ${errorSnapshots}`,
  `- Valid snapshots: ${validRows.length}`,
  `- Max failure rate: ${maxFailureRate.toFixed(6)}`,
  `- Avg failure rate: ${avgFailureRate.toFixed(6)}`,
  `- Max p95 latency ms: ${maxP95.toFixed(2)}`,
  `- Avg p95 latency ms: ${avgP95.toFixed(2)}`,
  `- Failure rate breaches: ${failureRateBreaches} (threshold: ${failureRateThreshold})`,
  `- P95 breaches: ${p95Breaches} (threshold: ${p95ThresholdMs})`,
  `- Degraded signals: ${degradedChecks}`,
  '',
  '## Gate Checklist Mapping',
  '',
  `- Failure rate within threshold: ${String(failureRateBreaches === 0)}`,
  `- P95 within threshold: ${String(p95Breaches === 0)}`,
  `- No degraded readiness signals: ${String(!hasDegradationSignals)}`,
  `- Sufficient snapshots: ${String(hasEnoughSnapshots)}`,
  `- No request error concentration: ${String(!(hasRequestErrors && errorSnapshots >= Math.ceil(totalSnapshots / 3)))}`,
  '',
  '## Notes',
  '',
  '- Cross-tenant incidents must still be validated operationally outside this CSV analysis.',
  '- Scheduling/reception functional regressions must still be validated with incident review and frontline checks.',
].join('\n');

await fs.writeFile(outputMarkdown, report, 'utf8');
console.log(`Gate evaluation complete. Output report: ${outputMarkdown}`);
console.log(`Decision: ${decision}`);
