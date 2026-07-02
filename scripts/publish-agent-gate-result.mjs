#!/usr/bin/env node
import { parseArgs } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'report-markdown':  { type: 'string' },
    'validation-doc':   { type: 'string' },
    'environment':      { type: 'string', default: 'staging' },
    'evidence-csv':     { type: 'string', default: 'agent-readiness-staging-5pct.csv' },
    'evidence-report':  { type: 'string', default: 'agent-gate-report-staging-5pct.md' },
  },
  allowPositionals: false,
});

if (!values['report-markdown'] || !values['validation-doc']) {
  console.error('Error: --report-markdown and --validation-doc are required');
  process.exit(1);
}

const reportMarkdown    = values['report-markdown'];
const environment       = values['environment'];
const evidenceCsv       = values['evidence-csv'];
const evidenceReport    = values['evidence-report'];

const scriptDir         = path.dirname(fileURLToPath(import.meta.url));
const repoRoot          = path.dirname(scriptDir);
const officialDocName   = 'AI_OPERATIONAL_VALIDATION_2026-04-03.md';
const localValidationDoc = path.join(repoRoot, 'tmp', 'AGENT_GATE_LOCAL_VALIDATION.md');

function isLocal(env) {
  return /^(local|dev-local|lab-local)/.test(env);
}

let resolvedValidationDoc = values['validation-doc'];

if (isLocal(environment) && path.basename(resolvedValidationDoc) === officialDocName) {
  console.log('Local environment detected. Redirecting publication to local validation log.');
  resolvedValidationDoc = localValidationDoc;
}

if (!isLocal(environment) && (resolvedValidationDoc.includes('/tmp/') || resolvedValidationDoc.includes('\\tmp\\'))) {
  console.error('Non-local environments must publish to the official validation document, not tmp/*.');
  process.exit(1);
}

let reportContent;
try {
  reportContent = await fs.readFile(reportMarkdown, 'utf8');
} catch {
  console.error(`Report file not found: ${reportMarkdown}`);
  process.exit(1);
}

let validationContent;
try {
  validationContent = await fs.readFile(resolvedValidationDoc, 'utf8');
} catch {
  console.error(`Validation document not found: ${resolvedValidationDoc}`);
  process.exit(1);
}

const decisionMatch   = reportContent.match(/- Decision:\s*(.+)/);
const reasonMatch     = reportContent.match(/- Reason:\s*(.+)/);
const maxFailureMatch = reportContent.match(/- Max failure rate:\s*(.+)/);
const maxP95Match     = reportContent.match(/- Max p95 latency ms:\s*(.+)/);

if (!decisionMatch) {
  console.error(`Could not parse decision from report: ${reportMarkdown}`);
  process.exit(1);
}

const decision   = decisionMatch[1].trim();
const reason     = reasonMatch?.[1]?.trim()     ?? 'n/a';
const maxFailure = maxFailureMatch?.[1]?.trim() ?? 'n/a';
const maxP95     = maxP95Match?.[1]?.trim()     ?? 'n/a';
const now        = new Date().toISOString().replace('T', ' ').slice(0, 19);

const heading = `## Gate Update - ${environment}`;
const entry = [
  '',
  heading,
  '',
  `- atualizado_em: ${now}`,
  `- ambiente: ${environment}`,
  `- decisao_automatizada: ${decision}`,
  `- justificativa_curta: ${reason}`,
  `- max_failure_rate_observado: ${maxFailure}`,
  `- max_p95_ms_observado: ${maxP95}`,
  `- evidencia_csv: ${evidenceCsv}`,
  `- evidencia_relatorio: ${evidenceReport}`,
  '',
  'Classificacao de confianca:',
  '- fato: decisao extraida automaticamente do relatorio',
  '- lacuna: validacao de incidentes cross-tenant e regressao funcional depende da operacao real',
].join('\n');

const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(`\\n?${escapedHeading}\\n[\\s\\S]*?(?=\\n## Gate Update - |$)`);

const updatedContent = pattern.test(validationContent)
  ? validationContent.replace(pattern, entry)
  : validationContent + entry;

await fs.writeFile(resolvedValidationDoc, updatedContent, 'utf8');
console.log('Gate result published to validation document.');
console.log(`Decision: ${decision}`);
console.log(`Validation doc: ${resolvedValidationDoc}`);
