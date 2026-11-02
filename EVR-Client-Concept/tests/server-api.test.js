'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const authHandler = require('../api/auth');
const mediaHandler = require('../api/media');
const r2VideoUploadHandler = require('../api/r2-video-upload');
const { validateContent } = require('../server/content-store');
const { configurationError, isAuthenticated, setSessionCookie } = require('../server/auth');

const originalEnvironment = {
  adminEmail: process.env.EVR_ADMIN_EMAIL,
  secret: process.env.EVR_SESSION_SECRET,
  blobToken: process.env.BLOB_READ_WRITE_TOKEN,
  resendApiKey: process.env.RESEND_API_KEY,
  resendFromEmail: process.env.RESEND_FROM_EMAIL,
  redisUrl: process.env.UPSTASH_REDIS_REST_URL,
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  r2BucketName: process.env.R2_BUCKET_NAME,
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
  localAdminBypass: process.env.EVR_LOCAL_ADMIN_BYPASS,
  vercelEnv: process.env.VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV
};
process.env.EVR_ADMIN_EMAIL = 'admin@example.com';
process.env.EVR_SESSION_SECRET = 'test-only-session-signing-secret-with-enough-entropy';
process.env.BLOB_READ_WRITE_TOKEN = 'test-only-blob-token';
process.env.RESEND_API_KEY = 'test-only-resend-key';
process.env.RESEND_FROM_EMAIL = 'EVR Productions <admin@example.com>';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-only-upstash-token';
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
  setSessionCookie(response);
  return response.headers['Set-Cookie'].split(';')[0];
}

async function withMockedAuthServices(callback) {
  const originalFetch = global.fetch;
  const values = new Map();
  const emails = [];
  global.fetch = async (url, options = {}) => {
    if (url === process.env.UPSTASH_REDIS_REST_URL) {
      const [command, ...args] = JSON.parse(options.body);
      if (command === 'SET') {
        values.set(args[0], args[1]);
        return new Response(JSON.stringify({ result: 'OK' }));
      }
      if (command === 'GET') return new Response(JSON.stringify({ result: values.get(args[0]) || null }));
      if (command === 'DEL') return new Response(JSON.stringify({ result: values.delete(args[0]) ? 1 : 0 }));
      if (command === 'EVAL') {
        const [script, keyCountValue, ...rest] = args;
        const keyCount = Number(keyCountValue);
        const keys = rest.slice(0, keyCount);
        const argv = rest.slice(keyCount);
        if (script.includes("local count = redis.call('INCR', KEYS[1])")) {
          const count = Number(values.get(keys[0]) || 0) + 1;
          values.set(keys[0], String(count));
          return new Response(JSON.stringify({ result: count }));
        }
        if (script.includes("if redis.call('EXISTS', KEYS[1]) == 0")) {
          if (!values.has(keys[0])) return new Response(JSON.stringify({ result: -1 }));
          const count = Number(values.get(keys[1]) || 0) + 1;
          values.set(keys[1], String(count));
          if (count >= Number(argv[1])) {
            values.delete(keys[0]);
            return new Response(JSON.stringify({ result: 0 }));
          }
          return new Response(JSON.stringify({ result: count }));
        }
        if (script.includes("if redis.call('GET', KEYS[1]) == ARGV[1]")) {
          if (values.get(keys[0]) === argv[0]) {
            values.delete(keys[0]);
            values.delete(keys[1]);
            return new Response(JSON.stringify({ result: 1 }));
          }
          return new Response(JSON.stringify({ result: 0 }));
        }
      }
      throw new Error(`Unexpected mock Redis command: ${command}`);
    }
    if (url === 'https://api.resend.com/emails') {
      emails.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ id: 'test-email-id' }), { status: 200 });
    }
    throw new Error(`Unexpected mock service URL: ${url}`);
  };
  try {
    return await callback({ values, emails });
  } finally {
    global.fetch = originalFetch;
  }
}

test('local admin bypass works only for loopback development requests', async () => {
  const original = {
    localAdminBypass: process.env.EVR_LOCAL_ADMIN_BYPASS,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV
  };
  process.env.EVR_LOCAL_ADMIN_BYPASS = '1';
  process.env.NODE_ENV = 'development';
  process.env.VERCEL_ENV = 'development';

  try {
    assert.equal(configurationError(), null);
    assert.equal(isAuthenticated({ headers: { host: 'localhost:3001' } }), true);
    assert.equal(isAuthenticated({ headers: { host: '127.0.0.1:3000' } }), true);
    assert.equal(isAuthenticated({ headers: { host: 'evr.example' } }), false);

    const response = createResponse();
    await authHandler({ method: 'GET', headers: { host: 'localhost:3001' } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.authenticated, true);

    process.env.VERCEL_ENV = 'preview';
    assert.equal(isAuthenticated({ headers: { host: 'localhost:3001' } }), false);
    process.env.VERCEL_ENV = 'development';
    process.env.NODE_ENV = 'production';
    assert.equal(isAuthenticated({ headers: { host: 'localhost:3001' } }), false);
  } finally {
    if (original.localAdminBypass === undefined) delete process.env.EVR_LOCAL_ADMIN_BYPASS;
    else process.env.EVR_LOCAL_ADMIN_BYPASS = original.localAdminBypass;
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.nodeEnv;
    if (original.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original.vercelEnv;
  }
});

test('admin email OTP issues an HttpOnly session and consumes the code once', async () => {
  await withMockedAuthServices(async ({ emails }) => {
    const requestResponse = createResponse();
    await authHandler({
      method: 'POST',
      headers: { host: 'evr.example', origin: 'https://evr.example' },
      body: { action: 'request-code', email: 'admin@example.com' }
    }, requestResponse);
    assert.equal(requestResponse.statusCode, 200);
    assert.match(requestResponse.body.message, /10 minutes/);
    assert.equal(emails.length, 1);
    assert.deepEqual(emails[0].to, ['admin@example.com']);
    const code = emails[0].text.match(/\b\d{8}\b/)[0];

    const invalidResponse = createResponse();
    await authHandler({
      method: 'POST',
      headers: { host: 'evr.example', origin: 'https://evr.example' },
      body: { action: 'verify-code', email: 'admin@example.com', code: '00000000' }
    }, invalidResponse);
    assert.equal(invalidResponse.statusCode, 401);

    const response = createResponse();
    await authHandler({
      method: 'POST',
      headers: { host: 'evr.example', origin: 'https://evr.example' },
      body: { action: 'verify-code', email: 'admin@example.com', code }
    }, response);
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['Set-Cookie'], /HttpOnly; SameSite=Strict; Max-Age=/);
    assert.match(response.headers['Set-Cookie'], /; Secure/);
    const cookie = response.headers['Set-Cookie'].split(';')[0];
    assert.equal(isAuthenticated({ headers: { cookie } }), true);
    assert.equal(isAuthenticated({ headers: { cookie: `${cookie}tampered` } }), false);

    const replayResponse = createResponse();
    await authHandler({
      method: 'POST',
      headers: { host: 'evr.example', origin: 'https://evr.example' },
      body: { action: 'verify-code', email: 'admin@example.com', code }
    }, replayResponse);
    assert.equal(replayResponse.statusCode, 401);
  });
});

test('admin email OTP is not sent to unauthorized addresses and requests are rate limited', async () => {
  await withMockedAuthServices(async ({ emails }) => {
    const unauthorized = createResponse();
    await authHandler({
      method: 'POST',
      headers: { host: 'evr.example', origin: 'https://evr.example' },
      body: { action: 'request-code', email: 'other@example.com' }
    }, unauthorized);
    assert.equal(unauthorized.statusCode, 200);
    assert.equal(emails.length, 0);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = createResponse();
      await authHandler({
        method: 'POST',
        headers: { host: 'evr.example', origin: 'https://evr.example' },
        body: { action: 'request-code', email: 'admin@example.com' }
      }, response);
      assert.equal(response.statusCode, 200);
    }
    const limited = createResponse();
    await authHandler({
      method: 'POST',
      headers: { host: 'evr.example', origin: 'https://evr.example' },
      body: { action: 'request-code', email: 'admin@example.com' }
    }, limited);
    assert.equal(limited.statusCode, 429);
    assert.equal(emails.length, 3);
  });
});

test('admin API rejects cross-origin sign-in code requests', async () => {
  const response = createResponse();
  await authHandler({
    method: 'POST',
    headers: { host: 'evr.example', origin: 'https://attacker.example' },
    body: { action: 'request-code', email: 'admin@example.com' }
  }, response);
  assert.equal(response.statusCode, 403);
});

test('admin configuration identifies the exact missing environment settings', () => {
  const email = process.env.EVR_ADMIN_EMAIL;
  delete process.env.EVR_ADMIN_EMAIL;
  assert.match(configurationError(), /EVR_ADMIN_EMAIL/);
  process.env.EVR_ADMIN_EMAIL = email;
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

test('media token generation does not configure a completion callback', async () => {
  const blobClientPath = require.resolve('@vercel/blob/client');
  const mediaHandlerPath = require.resolve('../api/media');
  const originalBlobClient = require.cache[blobClientPath];
  const originalMediaHandler = require.cache[mediaHandlerPath];
  let uploadOptions;
  const stub = new (require('node:module'))(blobClientPath);
  stub.filename = blobClientPath;
  stub.loaded = true;
  stub.exports = {
    handleUpload: async options => {
      uploadOptions = options;
      return { type: 'blob.generate-client-token', clientToken: 'test-token' };
    }
  };
  require.cache[blobClientPath] = stub;
  delete require.cache[mediaHandlerPath];

  try {
    const handler = require('../api/media');
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: { host: 'evr.example', origin: 'https://evr.example' },
      body: {}
    }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(Object.hasOwn(uploadOptions, 'onUploadCompleted'), false);
  } finally {
    delete require.cache[mediaHandlerPath];
    if (originalMediaHandler) require.cache[mediaHandlerPath] = originalMediaHandler;
    if (originalBlobClient) require.cache[blobClientPath] = originalBlobClient;
    else delete require.cache[blobClientPath];
  }
});

test('state-changing admin APIs require a same-origin Origin header', async () => {
  const response = createResponse();
  await authHandler({
    method: 'POST',
    headers: { host: 'evr.example' },
    body: { action: 'request-code', email: 'admin@example.com' }
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
  if (originalEnvironment.adminEmail === undefined) delete process.env.EVR_ADMIN_EMAIL;
  else process.env.EVR_ADMIN_EMAIL = originalEnvironment.adminEmail;
  if (originalEnvironment.secret === undefined) delete process.env.EVR_SESSION_SECRET;
  else process.env.EVR_SESSION_SECRET = originalEnvironment.secret;
  if (originalEnvironment.blobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = originalEnvironment.blobToken;
  if (originalEnvironment.resendApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalEnvironment.resendApiKey;
  if (originalEnvironment.resendFromEmail === undefined) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = originalEnvironment.resendFromEmail;
  if (originalEnvironment.redisUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = originalEnvironment.redisUrl;
  if (originalEnvironment.redisToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = originalEnvironment.redisToken;
  if (originalEnvironment.localAdminBypass === undefined) delete process.env.EVR_LOCAL_ADMIN_BYPASS;
  else process.env.EVR_LOCAL_ADMIN_BYPASS = originalEnvironment.localAdminBypass;
  if (originalEnvironment.vercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalEnvironment.vercelEnv;
  if (originalEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment.nodeEnv;
});
