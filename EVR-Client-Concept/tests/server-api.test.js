'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const authHandler = require('../api/auth');
const mediaHandler = require('../api/media');
const r2VideoUploadHandler = require('../api/r2-video-upload');
const { validateContent } = require('../server/content-store');
const { configurationError, isAuthenticated } = require('../server/auth');

const originalEnvironment = {
  password: process.env.EVR_ADMIN_PASSWORD,
  secret: process.env.EVR_SESSION_SECRET,
  blobToken: process.env.BLOB_READ_WRITE_TOKEN,
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  r2BucketName: process.env.R2_BUCKET_NAME,
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
  nodeEnv: process.env.NODE_ENV
};
process.env.EVR_ADMIN_PASSWORD = 'test-only-password';
process.env.EVR_SESSION_SECRET = 'test-only-session-signing-secret-with-enough-entropy';
process.env.BLOB_READ_WRITE_TOKEN = 'test-only-blob-token';
process.env.NODE_ENV = 'production';

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { this.ended = true; return this; }
  };
}

async function getAdminCookie() {
  const response = createResponse();
  await authHandler({
    method: 'POST',
    headers: { host: 'evr.example', origin: 'https://evr.example' },
    body: { action: 'login', password: process.env.EVR_ADMIN_PASSWORD }
  }, response);
  return response.headers['Set-Cookie'].split(';')[0];
}

test('admin login issues an HttpOnly signed session and rejects an incorrect password', async () => {
  const invalidResponse = createResponse();
  await authHandler({
    method: 'POST',
    headers: { host: 'evr.example', origin: 'https://evr.example' },
    body: { action: 'login', password: 'wrong-password' }
  }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 401);

  const response = createResponse();
  await authHandler({
    method: 'POST',
    headers: { host: 'evr.example', origin: 'https://evr.example' },
    body: { action: 'login', password: process.env.EVR_ADMIN_PASSWORD }
  }, response);
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['Set-Cookie'], /HttpOnly; SameSite=Strict; Max-Age=/);
  assert.match(response.headers['Set-Cookie'], /; Secure/);
  const cookie = response.headers['Set-Cookie'].split(';')[0];
  assert.equal(isAuthenticated({ headers: { cookie } }), true);
  assert.equal(isAuthenticated({ headers: { cookie: `${cookie}tampered` } }), false);
});

test('admin API rejects cross-origin login attempts', async () => {
  const response = createResponse();
  await authHandler({
    method: 'POST',
    headers: { host: 'evr.example', origin: 'https://attacker.example' },
    body: { action: 'login', password: process.env.EVR_ADMIN_PASSWORD }
  }, response);
  assert.equal(response.statusCode, 403);
});

test('admin configuration enforces an eight-character password minimum', () => {
  const password = process.env.EVR_ADMIN_PASSWORD;
  process.env.EVR_ADMIN_PASSWORD = '1234567';
  assert.match(configurationError(), /at least 8 characters/);
  process.env.EVR_ADMIN_PASSWORD = '12345678';
  assert.equal(configurationError(), null);
  process.env.EVR_ADMIN_PASSWORD = password;
  assert.equal(configurationError(), null);
});

test('media upload authorization rejects cross-origin requests', async () => {
  const response = createResponse();
  await mediaHandler({
    method: 'POST',
    headers: { host: 'evr.example', origin: 'https://attacker.example' },
    body: {}
  }, response);
  assert.equal(response.statusCode, 403);
});

test('state-changing admin APIs require a same-origin Origin header', async () => {
  const response = createResponse();
  await authHandler({
    method: 'POST',
    headers: { host: 'evr.example' },
    body: { action: 'login', password: process.env.EVR_ADMIN_PASSWORD }
  }, response);
  assert.equal(response.statusCode, 403);
});

test('shared content validation rejects unsupported edit values', () => {
  assert.deepEqual(validateContent({ version: 1, entries: {
    heading: { type: 'text', value: '<em>Welcome</em>' },
    background: { type: 'background', value: '#123456' }
  } }), { version: 1, entries: {
    heading: { type: 'text', value: '<em>Welcome</em>' },
    background: { type: 'background', value: '#123456' }
  } });
  assert.throws(() => validateContent({ version: 1, entries: {
    image: { type: 'image', value: 'javascript:alert(1)' }
  } }), /unsupported value/);
});

test('R2 video uploads require admin auth and reject invalid multipart actions', async () => {
  process.env.CLOUDFLARE_ACCOUNT_ID = '1234567890abcdef1234567890abcdef';
  process.env.R2_ACCESS_KEY_ID = 'test-r2-access-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-only-r2-secret';
  process.env.R2_BUCKET_NAME = 'evr-media';
  process.env.R2_PUBLIC_BASE_URL = 'https://media.example.com';
  const unauthorized = createResponse();
  await r2VideoUploadHandler({
    method: 'POST',
    headers: { host: 'evr.example', origin: 'https://evr.example' },
    body: {}
  }, unauthorized);
  assert.equal(unauthorized.statusCode, 401);

  const cookie = await getAdminCookie();
  const authorizedRequest = body => ({
    method: 'POST',
    headers: { host: 'evr.example', origin: 'https://evr.example', cookie },
    body
  });
  const invalidFile = createResponse();
  await r2VideoUploadHandler(authorizedRequest({
    action: 'create',
    fileName: 'not-a-video.exe',
    contentType: 'video/mp4'
  }), invalidFile);
  assert.equal(invalidFile.statusCode, 400);

  const invalidPart = createResponse();
  await r2VideoUploadHandler(authorizedRequest({
    action: 'sign-part',
    key: 'other-folder/arbitrary.mp4',
    uploadId: 'test-upload',
    partNumber: 1
  }), invalidPart);
  assert.equal(invalidPart.statusCode, 400);

  const invalidCompletion = createResponse();
  await r2VideoUploadHandler(authorizedRequest({
    action: 'complete',
    key: 'evr-videos/12345678-1234-4234-8234-123456789abc.mp4',
    uploadId: 'test-upload',
    parts: [{ partNumber: 2, eTag: '0123456789abcdef0123456789abcdef' }]
  }), invalidCompletion);
  assert.equal(invalidCompletion.statusCode, 400);

  const missingConfiguration = createResponse();
  delete process.env.R2_ACCESS_KEY_ID;
  await r2VideoUploadHandler(authorizedRequest({ action: 'create' }), missingConfiguration);
  assert.equal(missingConfiguration.statusCode, 503);
  assert.match(missingConfiguration.body.error, /R2_ACCESS_KEY_ID/);
  process.env.R2_ACCESS_KEY_ID = 'test-r2-access-key';

  const methodNotAllowed = createResponse();
  await r2VideoUploadHandler({
    method: 'GET',
    headers: { host: 'evr.example', origin: 'https://evr.example', cookie }
  }, methodNotAllowed);
  assert.equal(methodNotAllowed.statusCode, 405);

  const crossOrigin = createResponse();
  await r2VideoUploadHandler({
    ...authorizedRequest({ action: 'create' }),
    headers: { host: 'evr.example', origin: 'https://attacker.example', cookie }
  }, crossOrigin);
  assert.equal(crossOrigin.statusCode, 403);
  assert.doesNotMatch(JSON.stringify(missingConfiguration.body), /test-only-r2-secret/);
});

test('R2 public media URLs are built without altering the object key', () => {
  const { publicObjectUrl } = require('../api/r2-video-upload');
  assert.equal(
    publicObjectUrl('https://media.example.com/', 'evr-videos/example clip.mp4'),
    'https://media.example.com/evr-videos/example%20clip.mp4'
  );
});

test.after(() => {
  if (originalEnvironment.cloudflareAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
  else process.env.CLOUDFLARE_ACCOUNT_ID = originalEnvironment.cloudflareAccountId;
  if (originalEnvironment.r2AccessKeyId === undefined) delete process.env.R2_ACCESS_KEY_ID;
  else process.env.R2_ACCESS_KEY_ID = originalEnvironment.r2AccessKeyId;
  if (originalEnvironment.r2SecretAccessKey === undefined) delete process.env.R2_SECRET_ACCESS_KEY;
  else process.env.R2_SECRET_ACCESS_KEY = originalEnvironment.r2SecretAccessKey;
  if (originalEnvironment.r2BucketName === undefined) delete process.env.R2_BUCKET_NAME;
  else process.env.R2_BUCKET_NAME = originalEnvironment.r2BucketName;
  if (originalEnvironment.r2PublicBaseUrl === undefined) delete process.env.R2_PUBLIC_BASE_URL;
  else process.env.R2_PUBLIC_BASE_URL = originalEnvironment.r2PublicBaseUrl;
  if (originalEnvironment.password === undefined) delete process.env.EVR_ADMIN_PASSWORD;
  else process.env.EVR_ADMIN_PASSWORD = originalEnvironment.password;
  if (originalEnvironment.secret === undefined) delete process.env.EVR_SESSION_SECRET;
  else process.env.EVR_SESSION_SECRET = originalEnvironment.secret;
  if (originalEnvironment.blobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = originalEnvironment.blobToken;
  if (originalEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment.nodeEnv;
});
