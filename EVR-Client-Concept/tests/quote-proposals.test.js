'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { validateQuote, validQuoteId } = require('../server/quote-proposals');
const quoteHandler = require('../api/quote-maker/quotes');

function createResponse() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

const quote = {
  version: 1,
  reviewed: true,
  client: 'A Client',
  groom: 'Alex',
  bride: 'Sam',
  date: '2026-12-10',
  events: [{
    name: 'Wedding',
    sortDate: '2026-12-10',
    session: '',
    reqs: [],
    days: [{ day: 1, date: '2026-12-10', session: 'Ceremony', reqs: ['Photography'] }]
  }],
  deliverables: [{ name: 'Wedding Album', price: 25000 }],
  total: 25000,
  totalOverridden: false,
  terms: 'Quotation terms',
  websiteSections: ['home', 'work', 'private-admin', 'process']
};

test('validates and stores only client-safe quotation details', () => {
  const saved = validateQuote(quote, Date.UTC(2026, 0, 1));
  assert.equal(saved.version, 1);
  assert.equal(saved.client, 'A Client');
  assert.deepEqual(saved.websiteSections, ['home', 'work', 'process']);
  assert.deepEqual(saved.deliverables, ['Wedding Album']);
  assert.equal(saved.total, 25000);
  assert.equal(Date.parse(saved.expiresAt) - Date.parse(saved.createdAt), 30 * 24 * 60 * 60 * 1000);
});

test('rejects unreviewed, incomplete, and invalid quotations', () => {
  assert.throws(() => validateQuote({ ...quote, reviewed: false }), /incomplete or invalid/);
  assert.throws(() => validateQuote({ ...quote, version: 2 }), /incomplete or invalid/);
  assert.throws(() => validateQuote({ ...quote, total: -1 }), /total is invalid/);
  assert.throws(() => validateQuote({ ...quote, events: [], deliverables: [] }), /Select at least one/);
  assert.throws(() => validateQuote({ ...quote, client: 'x'.repeat(101) }), /invalid text/);
});

test('accepts only unguessable hexadecimal quotation IDs', () => {
  assert.equal(validQuoteId('a'.repeat(48)), true);
  assert.equal(validQuoteId('A'.repeat(48)), false);
  assert.equal(validQuoteId('a'.repeat(47)), false);
});

test('public quote API rejects invalid identifiers and unauthenticated creation', async () => {
  const missingQuote = createResponse();
  await quoteHandler({
    method: 'GET',
    headers: { host: 'evr.example' },
    url: '/api/quote-maker/quotes?id=invalid'
  }, missingQuote);
  assert.equal(missingQuote.statusCode, 404);

  const createQuoteResponse = createResponse();
  await quoteHandler({
    method: 'POST',
    headers: { host: 'evr.example', origin: 'https://evr.example' },
    body: { action: 'create', quote }
  }, createQuoteResponse);
  assert.equal(createQuoteResponse.statusCode, 401);
});

test('public quote API validates acceptance and change-request submissions', async () => {
  const invalidAcceptance = createResponse();
  await quoteHandler({
    method: 'POST',
    headers: { host: 'evr.example', origin: 'https://evr.example' },
    body: { action: 'accept', id: 'a'.repeat(48), name: 'A Client', accepted: false }
  }, invalidAcceptance);
  assert.equal(invalidAcceptance.statusCode, 400);

  const invalidRequest = createResponse();
  await quoteHandler({
    method: 'POST',
    headers: { host: 'evr.example', origin: 'https://evr.example' },
    body: { action: 'request-changes', id: 'a'.repeat(48), name: 'A Client', message: ' ' }
  }, invalidRequest);
  assert.equal(invalidRequest.statusCode, 400);
});
