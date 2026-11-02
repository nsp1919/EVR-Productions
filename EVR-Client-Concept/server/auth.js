'use strict';

const crypto = require('node:crypto');

const cookieName = 'evr_admin_session';
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;
const otpLifetimeSeconds = 60 * 10;
const requestWindowSeconds = 60 * 15;
const maxCodeRequests = 3;
const maxCodeAttempts = 5;

function localAdminBypassEnabled() {
  return process.env.EVR_LOCAL_ADMIN_BYPASS === '1' &&
    process.env.NODE_ENV !== 'production' &&
    process.env.VERCEL_ENV !== 'production' &&
    process.env.VERCEL_ENV !== 'preview';
}

function isLocalRequest(request) {
  try {
    const hostname = new URL(`http://${request.headers.host}`).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

const requestLimitScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
return count
`;
const failedAttemptScript = `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
local count = redis.call('INCR', KEYS[2])
if count == 1 then redis.call('EXPIRE', KEYS[2], tonumber(ARGV[1])) end
if count >= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1])
  return 0
end
return count
`;
const consumeCodeScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1], KEYS[2])
  return 1
end
return 0
`;

function configurationError() {
  if (localAdminBypassEnabled()) return contentConfigurationError();

  const required = [
    'EVR_ADMIN_EMAIL',
    'EVR_SESSION_SECRET',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'BLOB_READ_WRITE_TOKEN'
  ];
  const missing = required.filter(name => !process.env[name]?.trim());
  if (missing.length) {
    return `Configure these server environment variables: ${missing.join(', ')}.`;
  }
  if (process.env.EVR_SESSION_SECRET.length < 32) {
    return 'EVR_SESSION_SECRET must contain at least 32 characters.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.EVR_ADMIN_EMAIL.trim())) {
    return 'EVR_ADMIN_EMAIL must be a valid email address.';
  }
  try {
    if (new URL(process.env.UPSTASH_REDIS_REST_URL).protocol !== 'https:') {
      return 'UPSTASH_REDIS_REST_URL must use HTTPS.';
    }
  } catch {
    return 'UPSTASH_REDIS_REST_URL must be a valid HTTPS URL.';
  }
  return null;
}

function contentConfigurationError() {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim()
    ? null
    : 'Connect a Vercel Blob store or configure BLOB_READ_WRITE_TOKEN before loading shared content.';
}

function signature(expiresAt) {
  return crypto.createHmac('sha256', process.env.EVR_SESSION_SECRET)
    .update(String(expiresAt))
    .digest('base64url');
}

function isAuthenticated(request) {
  if (localAdminBypassEnabled() && isLocalRequest(request)) return true;

  const cookieHeader = request.headers.cookie || '';
  const sessionCookie = cookieHeader.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${cookieName}=`));
  if (!sessionCookie) return false;

  let token;
  try {
    token = decodeURIComponent(sessionCookie.slice(cookieName.length + 1));
  } catch {
    return false;
  }
  const separator = token.indexOf('.');
  if (separator < 1) return false;
  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const expected = Buffer.from(signature(expiresAt));
  const actual = Buffer.from(token.slice(separator + 1));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function setSessionCookie(response) {
  const expiresAt = Math.floor(Date.now() / 1000) + sessionLifetimeSeconds;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${cookieName}=${expiresAt}.${signature(expiresAt)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetimeSeconds}${secure}`);
}

function clearSessionCookie(response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

function setPrivateHeaders(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

function rejectCrossOrigin(request, response) {
  const origin = request.headers.origin;
  if (!origin) {
    if (['GET', 'HEAD', 'OPTIONS'].includes((request.method || 'GET').toUpperCase())) return false;
    response.status(403).json({ error: 'An Origin header is required for this request.' });
    return true;
  }
  let requestOrigin;
  try {
    requestOrigin = new URL(`${request.headers['x-forwarded-proto'] || 'https'}://${request.headers.host}`).origin;
  } catch {
    response.status(400).json({ error: 'Invalid request origin.' });
    return true;
  }
  if (origin !== requestOrigin) {
    response.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    return true;
  }
  return false;
}

function safeEqual(left, right) {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function normalizedEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function emailKey(email, purpose) {
  const digest = crypto.createHash('sha256').update(normalizedEmail(email)).digest('hex');
  return `evr:admin:otp:${purpose}:${digest}`;
}

function codeDigest(email, code) {
  return crypto.createHmac('sha256', process.env.EVR_SESSION_SECRET)
    .update(`${normalizedEmail(email)}:${code}`)
    .digest('hex');
}

async function redisCommand(...command) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Upstash Redis returned an invalid response.');
  }
  if (!response.ok || result.error) {
    throw new Error(`Upstash Redis request failed (${response.status}).`);
  }
  return result.result;
}

function rateLimitError() {
  const error = new Error('Too many sign-in code requests. Please try again later.');
  error.statusCode = 429;
  return error;
}

async function requestAdminCode(email) {
  const adminEmail = normalizedEmail(process.env.EVR_ADMIN_EMAIL);
  if (normalizedEmail(email) !== adminEmail) return false;

  const count = Number(await redisCommand(
    'EVAL',
    requestLimitScript,
    '1',
    emailKey(adminEmail, 'request-limit'),
    String(requestWindowSeconds)
  ));
  if (count > maxCodeRequests) throw rateLimitError();

  const code = String(crypto.randomInt(10000000, 100000000));
  const challengeKey = emailKey(adminEmail, 'code');
  await redisCommand('SET', challengeKey, codeDigest(adminEmail, code), 'EX', String(otpLifetimeSeconds));

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [adminEmail],
      subject: 'Your EVR admin sign-in code',
      text: `Your EVR admin sign-in code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
      html: `<p>Your EVR admin sign-in code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you did not request this code, you can ignore this email.</p>`
    })
  });
  if (!response.ok) {
    await redisCommand('DEL', challengeKey);
    console.error('Resend rejected an EVR admin sign-in email:', response.status);
    throw new Error('The sign-in email could not be sent. Check the email provider configuration and try again.');
  }
  return true;
}

async function verifyAdminCode(email, code) {
  const adminEmail = normalizedEmail(process.env.EVR_ADMIN_EMAIL);
  if (normalizedEmail(email) !== adminEmail || typeof code !== 'string' || !/^\d{8}$/.test(code)) {
    return false;
  }

  const challengeKey = emailKey(adminEmail, 'code');
  const attemptsKey = emailKey(adminEmail, 'attempts');
  const storedDigest = await redisCommand('GET', challengeKey);
  if (typeof storedDigest !== 'string') return false;

  const candidateDigest = codeDigest(adminEmail, code);
  if (!safeEqual(storedDigest, candidateDigest)) {
    await redisCommand(
      'EVAL',
      failedAttemptScript,
      '2',
      challengeKey,
      attemptsKey,
      String(otpLifetimeSeconds),
      String(maxCodeAttempts)
    );
    return false;
  }

  return Number(await redisCommand(
    'EVAL',
    consumeCodeScript,
    '2',
    challengeKey,
    attemptsKey,
    storedDigest
  )) === 1;
}

module.exports = {
  clearSessionCookie,
  configurationError,
  contentConfigurationError,
  isAuthenticated,
  localAdminBypassEnabled,
  requestAdminCode,
  rejectCrossOrigin,
  safeEqual,
  setPrivateHeaders,
  setSessionCookie,
  verifyAdminCode
};
