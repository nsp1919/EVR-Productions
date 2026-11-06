'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const invitationHandler = require('../api/invitations');
const invitationAccessHandler = require('../api/invitation-access');
const adminPasscodeHandler = require('../api/invitation-admin-passcode');
const {
  readInvitationPasscode,
  setInvitationPasscode,
  verifyInvitationPasscode
} = require('../server/invitation-passcode');
const {
  isAuthenticated,
  isInvitationEditorAuthenticated,
  isQuoteAuthenticated,
  setInvitationEditorCookie,
  setSessionCookie
} = require('../server/auth');

const environmentKeys = [
  'CLOUDFLARE_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL',
  'EVR_SESSION_SECRET',
  'EVR_ADMIN_EMAIL',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'NODE_ENV'
];
const invitation = {
  coupleNames: 'Ananya & Aarav',
  date: '2027-02-14T10:30:00',
  welcomeMessage: 'Join us for our wedding.',
  venueName: 'The Garden Pavilion',
  venueAddress: 'Hyderabad',
  heroImage: 'https://images.example.test/wedding.jpg',
  gallery: [],
  events: []
};
const originalEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
process.env.CLOUDFLARE_ACCOUNT_ID = 'a'.repeat(32);
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.R2_BUCKET_NAME = 'evr-test';
process.env.R2_PUBLIC_BASE_URL = 'https://media.example.test';
process.env.EVR_SESSION_SECRET = 'test-only-session-signing-secret-with-enough-entropy';
process.env.EVR_ADMIN_EMAIL = 'admin@example.com';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.RESEND_FROM_EMAIL = 'EVR Productions <admin@example.com>';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-redis-token';
process.env.NODE_ENV = 'production';

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end(value) { this.body = value; return this; }
  };
}

test('stores only a salted hash and verifies exactly four digit passcodes', async () => {
  const originalSend = S3Client.prototype.send;
  const objects = new Map();
  S3Client.prototype.send = async function send(command) {
    if (command instanceof GetObjectCommand) {
      const body = objects.get(command.input.Key);
      if (!body) {
        const error = new Error('Object not found');
        error.name = 'NoSuchKey';
        throw error;
      }
      return { Body: { transformToString: async () => body } };
    }
    if (command instanceof PutObjectCommand) {
      objects.set(command.input.Key, command.input.Body);
      return {};
    }
    throw new Error('Unexpected storage command.');
  };

  try {
    await assert.rejects(setInvitationPasscode('123'), /exactly four digits/);
    await setInvitationPasscode('0837');
    const saved = Array.from(objects.values())[0];
    assert.doesNotMatch(saved, /0837/);
    assert.equal(await verifyInvitationPasscode('0837'), true);
    assert.equal(await verifyInvitationPasscode('1837'), false);
    await setInvitationPasscode('2604');
    assert.equal(await verifyInvitationPasscode('0837'), false);
    assert.equal(await verifyInvitationPasscode('2604'), true);
  } finally {
    S3Client.prototype.send = originalSend;
  }
});

test('protects invitation saves and passcode settings with separate sessions', async () => {
  const invitationResponse = createResponse();
  await invitationHandler({
    method: 'POST',
    headers: { host: 'evr.example', origin: 'https://evr.example' },
    body: {}
  }, invitationResponse);
  assert.equal(invitationResponse.statusCode, 401);

  const settingsResponse = createResponse();
  await adminPasscodeHandler({
    method: 'GET',
    headers: { host: 'evr.example' }
  }, settingsResponse);
  assert.equal(settingsResponse.statusCode, 401);
});

test('stores invitation JSON in R2 and loads it through its public unique link', async () => {
  const originalSend = S3Client.prototype.send;
  const originalFetch = global.fetch;
  const objects = new Map();
  const commands = [];
  S3Client.prototype.send = async function send(command) {
    commands.push(command);
    if (command instanceof GetObjectCommand) {
      const body = objects.get(command.input.Key);
      if (!body) {
        const error = new Error('Object not found');
        error.name = 'NoSuchKey';
        throw error;
      }
      return { Body: { transformToString: async () => body } };
    }
    if (command instanceof PutObjectCommand) {
      objects.set(command.input.Key, command.input.Body);
      return {};
    }
    throw new Error('Unexpected storage command.');
  };
  global.fetch = async url => {
    assert.equal(new URL(url).pathname, '/invitation/index.html');
    return new Response('<!doctype html><!-- INVITATION_META_START --><title>Sample</title><!-- INVITATION_META_END --><script>/* WEDDING_CONFIG_START */\nconst DEFAULT_WEDDING = {};\n/* WEDDING_CONFIG_END */</script>');
  };

  try {
    await setInvitationPasscode('1020');
    const savedPasscode = await readInvitationPasscode();
    const editorSession = createResponse();
    setInvitationEditorCookie(editorSession, savedPasscode.hash);
    const cookie = editorSession.headers['Set-Cookie'].split(';')[0];

    const saveResponse = createResponse();
    await invitationHandler({
      method: 'POST',
      headers: { host: 'evr.example', origin: 'https://evr.example', cookie },
      body: { ...invitation, heroImage: 'data:image/jpeg;base64,/9j/2Q==' }
    }, saveResponse);
    assert.equal(saveResponse.statusCode, 201);
    assert.match(saveResponse.body.id, /^ananya-aarav-invitation-[\da-f-]{36}$/);
    const objectKey = `invitations/${saveResponse.body.id.slice(-36)}.json`;
    const savedInvitation = JSON.parse(objects.get(objectKey));
    assert.equal(savedInvitation.coupleNames, invitation.coupleNames);
    assert.equal(savedInvitation.heroImage, `${process.env.R2_PUBLIC_BASE_URL}/evr-images/${commands.find(command => command instanceof PutObjectCommand && command.input.Key.startsWith('evr-images/')).input.Key.split('/').at(-1)}`);
    const uploadedHero = commands.find(command => command instanceof PutObjectCommand && command.input.Key.startsWith('evr-images/'));
    assert.equal(uploadedHero.input.ContentType, 'image/jpeg');
    const write = commands.find(command => command instanceof PutObjectCommand && command.input.Key === objectKey);
    assert.equal(write.input.Bucket, process.env.R2_BUCKET_NAME);
    assert.equal(write.input.ContentType, 'application/json; charset=utf-8');

    const url = new URL(`https://evr.example/invitation/${saveResponse.body.id}`);
    const loadResponse = createResponse();
    await invitationHandler({
      method: 'GET',
      url: `${url.pathname}?id=${encodeURIComponent(saveResponse.body.id)}`,
      headers: { host: 'www.evrproductions.in' }
    }, loadResponse);
    assert.equal(loadResponse.statusCode, 200);
    assert.equal(loadResponse.headers['Content-Type'], 'text/html; charset=utf-8');
    assert.match(loadResponse.body, /const WEDDING = \{"coupleNames":"Ananya & Aarav"/);
    assert.match(loadResponse.body, /<title>Ananya &amp; Aarav Invitation \| EVR Productions<\/title>/);
    assert.match(loadResponse.body, /<meta property="og:title" content="Ananya &amp; Aarav Invitation \| EVR Productions">/);
    assert.match(loadResponse.body, /<meta property="og:description" content="Join Ananya &amp; Aarav as they celebrate their wedding\./);
    assert.match(loadResponse.body, /<meta property="og:url" content="https:\/\/www\.evrproductions\.in\/invitation\/ananya-aarav-invitation-/);
    assert.match(loadResponse.body, /<meta property="og:image" content="https:\/\/media\.example\.test\/evr-images\/[\da-f-]+\.jpg">/);
    assert.match(loadResponse.body, /<meta name="twitter:card" content="summary_large_image">/);
  } finally {
    S3Client.prototype.send = originalSend;
    global.fetch = originalFetch;
  }
});

test('admin can change the passcode and it unlocks the editor with a short-lived session', async () => {
  const originalSend = S3Client.prototype.send;
  const originalFetch = global.fetch;
  const objects = new Map();
  S3Client.prototype.send = async function send(command) {
    if (command instanceof GetObjectCommand) {
      const body = objects.get(command.input.Key);
      if (!body) {
        const error = new Error('Object not found');
        error.name = 'NoSuchKey';
        throw error;
      }
      return { Body: { transformToString: async () => body } };
    }
    if (command instanceof PutObjectCommand) {
      objects.set(command.input.Key, command.input.Body);
      return {};
    }
    throw new Error('Unexpected storage command.');
  };
  global.fetch = async (url, options) => {
    assert.equal(url, process.env.UPSTASH_REDIS_REST_URL);
    assert.equal(JSON.parse(options.body)[0], 'EVAL');
    return new Response(JSON.stringify({ result: 1 }));
  };

  try {
    await setInvitationPasscode('1020');
    const previousPasscode = await readInvitationPasscode();
    const previousEditorSession = createResponse();
    setInvitationEditorCookie(previousEditorSession, previousPasscode.hash);
    const previousEditorCookie = previousEditorSession.headers['Set-Cookie'].split(';')[0];
    const adminSession = createResponse();
    setSessionCookie(adminSession);
    const adminCookie = adminSession.headers['Set-Cookie'].split(';')[0];
    assert.equal(isAuthenticated({ headers: { cookie: adminCookie } }), true);

    const invalidUpdate = createResponse();
    await adminPasscodeHandler({
      method: 'PUT',
      headers: { host: 'evr.example', origin: 'https://evr.example', cookie: adminCookie },
      body: { passcode: '837' }
    }, invalidUpdate);
    assert.equal(invalidUpdate.statusCode, 400);

    const updateResponse = createResponse();
    await adminPasscodeHandler({
      method: 'PUT',
      headers: { host: 'evr.example', origin: 'https://evr.example', cookie: adminCookie },
      body: { passcode: '0837' }
    }, updateResponse);
    assert.equal(updateResponse.statusCode, 200);
    assert.equal(await verifyInvitationPasscode('0837'), true);
    assert.equal(await verifyInvitationPasscode('1020'), false);
    const currentPasscode = await readInvitationPasscode();
    assert.equal(isInvitationEditorAuthenticated({ headers: { cookie: previousEditorCookie } }, currentPasscode.hash), false);

    const incorrectLogin = createResponse();
    await invitationAccessHandler({
      method: 'POST',
      headers: { host: 'evr.example', origin: 'https://evr.example', 'x-forwarded-for': '203.0.113.31' },
      body: { passcode: '1020' }
    }, incorrectLogin);
    assert.equal(incorrectLogin.statusCode, 401);

    const loginResponse = createResponse();
    await invitationAccessHandler({
      method: 'POST',
      headers: { host: 'evr.example', origin: 'https://evr.example', 'x-forwarded-for': '203.0.113.31' },
      body: { passcode: '0837' }
    }, loginResponse);
    assert.equal(loginResponse.statusCode, 200);
    const editorCookie = loginResponse.headers['Set-Cookie'].split(';')[0];
    assert.equal(isInvitationEditorAuthenticated({ headers: { cookie: editorCookie } }, currentPasscode.hash), true);

    const statusResponse = createResponse();
    await invitationAccessHandler({
      method: 'GET',
      headers: { host: 'evr.example', cookie: editorCookie }
    }, statusResponse);
    assert.deepEqual(statusResponse.body, { configured: true, authenticated: true });
  } finally {
    S3Client.prototype.send = originalSend;
    global.fetch = originalFetch;
  }
});

test('sets an HTTP-only invitation editor session distinct from other admin sessions', () => {
  const response = createResponse();
  const passcodeHash = 'a'.repeat(128);
  setInvitationEditorCookie(response, passcodeHash);
  assert.match(response.headers['Set-Cookie'], /^evr_invitation_editor_session=/);
  assert.match(response.headers['Set-Cookie'], /HttpOnly; SameSite=Strict; Max-Age=43200; Secure/);
  const cookie = response.headers['Set-Cookie'].split(';')[0];
  assert.equal(isInvitationEditorAuthenticated({ headers: { cookie } }, passcodeHash), true);
  assert.equal(isQuoteAuthenticated({ headers: { cookie } }), false);
});

test.after(() => {
  for (const key of environmentKeys) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
});
