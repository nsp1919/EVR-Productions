'use strict';

const { configurationError, isAuthenticated, rejectCrossOrigin, setPrivateHeaders } = require('../server/auth');
const { getR2Configuration } = require('../server/r2-storage');
const { readInvitationPasscode, setInvitationPasscode } = require('../server/invitation-passcode');

module.exports = async function handler(request, response) {
  setPrivateHeaders(response);
  if (rejectCrossOrigin(request, response)) return;
  if (!isAuthenticated(request)) return response.status(401).json({ error: 'Sign in to manage the invitation editor passcode.' });
  if (!['GET', 'PUT'].includes(request.method)) {
    response.setHeader('Allow', 'GET, PUT');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const setupError = configurationError() || getR2Configuration().error;
  if (setupError) return response.status(503).json({ error: setupError });

  if (request.method === 'GET') {
    try {
      return response.status(200).json({ configured: Boolean(await readInvitationPasscode()) });
    } catch (error) {
      console.error('Unable to check the invitation editor passcode:', error);
      return response.status(503).json({ error: 'Could not load the invitation editor passcode settings.' });
    }
  }

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  if (typeof body.passcode !== 'string' || !/^\d{4}$/.test(body.passcode)) {
    return response.status(400).json({ error: 'Choose a passcode containing exactly four digits.' });
  }
  try {
    await setInvitationPasscode(body.passcode);
    return response.status(200).json({ configured: true });
  } catch (error) {
    console.error('Unable to save the invitation editor passcode:', error);
    return response.status(503).json({ error: 'Could not save the invitation editor passcode.' });
  }
};
