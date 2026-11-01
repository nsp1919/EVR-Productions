'use strict';

const {
  clearSessionCookie,
  configurationError,
  isAuthenticated,
  rejectCrossOrigin,
  safeEqual,
  setPrivateHeaders,
  setSessionCookie
} = require('../server/auth');

module.exports = async function handler(request, response) {
  setPrivateHeaders(response);
  if (rejectCrossOrigin(request, response)) return;

  const setupError = configurationError();
  if (request.method === 'GET') {
    return response.status(setupError ? 503 : 200).json({
      configured: !setupError,
      authenticated: !setupError && isAuthenticated(request),
      error: setupError
    });
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  if (setupError) return response.status(503).json({ error: setupError });

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  if (body.action === 'logout') {
    clearSessionCookie(response);
    return response.status(200).json({ authenticated: false });
  }
  if (body.action !== 'login' || typeof body.password !== 'string' || !safeEqual(body.password, process.env.EVR_ADMIN_PASSWORD)) {
    return response.status(401).json({ error: 'The password was not accepted.' });
  }

  setSessionCookie(response);
  return response.status(200).json({ authenticated: true });
};
