'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const invitationHandler = require('../api/invitations');
const { createInvitationId, getInvitationStorageId } = require('../server/invitation-links');

const uuid = '3bc1021b-82a7-4e3c-a482-6bd5dff2d728';

test('creates readable, unique wedding invitation IDs from couple names', () => {
  assert.equal(createInvitationId('Ananya & Aarav', uuid), `ananya-aarav-invitation-${uuid}`);
  assert.equal(createInvitationId('Arav & Adi', uuid), `arav-adi-invitation-${uuid}`);
  assert.equal(createInvitationId('Élodie + José', uuid), `elodie-jose-invitation-${uuid}`);
  assert.equal(createInvitationId('💍', uuid), `wedding-invitation-${uuid}`);
});

test('resolves both friendly invitation IDs and existing UUID links', () => {
  assert.equal(getInvitationStorageId(`ananya-aarav-invitation-${uuid}`), uuid);
  assert.equal(getInvitationStorageId(`ananya-aarav-${uuid}`), uuid);
  assert.equal(getInvitationStorageId(uuid), uuid);
  assert.equal(getInvitationStorageId('not-a-wedding'), null);
  assert.equal(getInvitationStorageId(null), null);
});

test('rejects malformed wedding links before looking up invitation storage', async () => {
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };

  await invitationHandler({
    method: 'GET',
    url: '/api/invitations?id=not-a-valid-invitation',
    headers: { host: 'evrproductions.in' }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, 'Invitation link is invalid.');
});
