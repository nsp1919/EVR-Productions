'use strict';

const {
  isQuoteAuthenticated,
  quoteAccessConfigurationError,
  rejectCrossOrigin,
  setPrivateHeaders,
  setQuoteSessionCookie,
  verifyQuoteAccessCode
} = require('../../server/auth');

function parseBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  try {
    return JSON.parse(request.body || '{}');
  } catch {
    return null;
  }
}

module.exports = async function handler(request, response) {
  setPrivateHeaders(response);
  if (rejectCrossOrigin(request, response)) return;

  const setupError = quoteAccessConfigurationError();
  if (request.method === 'GET') {
    return response.status(setupError ? 503 : 200).json({
      configured: !setupError,
      authenticated: !setupError && isQuoteAuthenticated(request),
      error: setupError
    });
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  if (setupError) return response.status(503).json({ error: setupError });

  const body = parseBody(request);
  if (!body || body.action !== 'verify' || typeof body.passcode !== 'string' ||
      !body.passcode.trim() || body.passcode.length > 128) {
    return response.status(400).json({ error: 'Enter the quote access passcode.' });
  }
  try {
    if (!await verifyQuoteAccessCode(body.passcode, request)) {
      return response.status(401).json({ error: 'That passcode is incorrect. Try again.' });
    }
  } catch (error) {
    if (error.statusCode === 429) return response.status(429).json({ error: error.message });
    console.error('Unable to verify the EVR quote access passcode:', error);
    return response.status(502).json({ error: 'The passcode could not be checked. Try again.' });
  }

  setQuoteSessionCookie(response);
  return response.status(200).json({ authenticated: true });
};
