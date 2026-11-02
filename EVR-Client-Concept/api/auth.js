'use strict';

const {
  clearSessionCookie,
  configurationError,
  isAuthenticated,
  requestAdminCode,
  rejectCrossOrigin,
  setPrivateHeaders,
  setSessionCookie,
  verifyAdminCode
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
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  if (body.action === 'logout') {
    clearSessionCookie(response);
    return response.status(200).json({ authenticated: false });
  }
  if (setupError) return response.status(503).json({ error: setupError });

  if (body.action === 'request-code') {
    try {
      await requestAdminCode(body.email);
      return response.status(200).json({
        message: 'If this address is authorized, a sign-in code has been sent. Codes expire in 10 minutes.'
      });
    } catch (error) {
      if (error.statusCode === 429) return response.status(429).json({ error: error.message });
      console.error('Unable to request an EVR admin sign-in code:', error);
      return response.status(502).json({ error: error.message || 'The sign-in email could not be sent.' });
    }
  }
  if (body.action !== 'verify-code' || typeof body.email !== 'string' ||
      typeof body.code !== 'string' || !/^\d{8}$/.test(body.code)) {
    return response.status(400).json({ error: 'Enter the eight-digit sign-in code.' });
  }
  try {
    if (!await verifyAdminCode(body.email, body.code)) {
      return response.status(401).json({ error: 'That code is invalid or expired. Request a new sign-in code and try again.' });
    }
  } catch (error) {
    console.error('Unable to verify an EVR admin sign-in code:', error);
    return response.status(502).json({ error: 'The sign-in code could not be verified. Try again.' });
  }

  setSessionCookie(response);
  return response.status(200).json({ authenticated: true });
};
