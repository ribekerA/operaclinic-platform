#!/usr/bin/env node
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'base-url':             { type: 'string', default: 'http://localhost:3002' },
    'email':                { type: 'string', default: 'recepcao@estetica-demo.local' },
    'password':             { type: 'string', default: 'Demo@123' },
    'days-ahead':           { type: 'string', default: '0' },
    'minimum-lead-minutes': { type: 'string', default: '20' },
  },
  allowPositionals: false,
});

const baseUrl            = values['base-url'].replace(/\/$/, '');
const email              = values['email'];
const password           = values['password'];
const daysAhead          = parseInt(values['days-ahead'], 10);
const minimumLeadMinutes = parseInt(values['minimum-lead-minutes'], 10);

async function apiRequest(method, urlPath, { headers = {}, body = null } = {}) {
  const res = await fetch(`${baseUrl}/api/v1${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const login = await apiRequest('POST', '/auth/login', { body: { email, password, profile: 'clinic' } });
const headers = { Authorization: `Bearer ${login.accessToken}` };

const [professionals, consultationTypes, units, patients] = await Promise.all([
  apiRequest('GET', '/professionals', { headers }),
  apiRequest('GET', '/consultation-types', { headers }),
  apiRequest('GET', '/units', { headers }),
  apiRequest('GET', '/reception/patients?search=Paciente%20Smoke%20E2E&limit=5', { headers }),
]);

const professional     = professionals.find(p  => p.professionalRegister === 'ESTETICA-SMOKE-E2E');
const consultationType = consultationTypes.find(ct => ct.name === 'Avaliacao Estetica Smoke E2E');
const unit             = units.find(u  => u.name === 'Unidade Estetica Smoke E2E');
const patient          = patients.find(p  => p.fullName === 'Paciente Smoke E2E');

console.log('Resolved resources:');
console.log(JSON.stringify({
  professionalId:     professional?.id,
  consultationTypeId: consultationType?.id,
  unitId:             unit?.id,
  patientId:          patient?.id,
}, null, 2));

const targetDate = new Date();
targetDate.setDate(targetDate.getDate() + daysAhead);
const dateKey = targetDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const availability = await apiRequest(
  'GET',
  `/reception/availability?professionalId=${professional.id}&consultationTypeId=${consultationType.id}&unitId=${unit.id}&date=${dateKey}`,
  { headers },
);

const minimumStartsAt = new Date(Date.now() + minimumLeadMinutes * 60 * 1000);
const slot = availability.find(s => new Date(s.startsAt) >= minimumStartsAt);

if (!slot) {
  throw new Error(`No diagnostic slot found for ${dateKey} after ${minimumStartsAt.toISOString()}`);
}

console.log('Selected slot:');
console.log(JSON.stringify(slot, null, 2));

const appointment = await apiRequest('POST', '/reception/appointments', {
  headers,
  body: {
    patientId:          patient.id,
    professionalId:     professional.id,
    consultationTypeId: consultationType.id,
    unitId:             unit.id,
    startsAt:           slot.startsAt,
    room:               'Sala Estetica Smoke',
    notes:              'Atendimento estetico Smoke E2E',
    idempotencyKey:     `diag-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  },
});

console.log('Appointment created:');
console.log(JSON.stringify(appointment, null, 2));
