'use strict';

const crypto = require('node:crypto');

const cookieName = 'evr_admin_session';
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

function configurationError() {
  if (!process.env.EVR_ADMIN_PASSWORD || process.env.EVR_ADMIN_PASSWORD.length < 8 ||
      !process.env.EVR_SESSION_SECRET || process.env.EVR_SESSION_SECRET.length < 32) {
    return 'Set an EVR_ADMIN_PASSWORD of at least 8 characters and a random EVR_SESSION_SECRET of at least 32 characters.';
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return 'Connect a Vercel Blob store to this project before using the content editor.';
  }
  return null;
}

function signature(expiresAt) {
  return crypto.createHmac('sha256', process.env.EVR_SESSION_SECRET)
    .update(String(expiresAt))
    .digest('base64url');
}

function isAuthenticated(request) {
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

module.exports = {
  clearSessionCookie,
  configurationError,
  isAuthenticated,
  rejectCrossOrigin,
  safeEqual,
  setPrivateHeaders,
  setSessionCookie
};
