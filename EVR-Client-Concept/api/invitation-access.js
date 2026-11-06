'use strict';

const {
  checkInvitationPasscodeRateLimit,
  configurationError,
  isInvitationEditorAuthenticated,
  rejectCrossOrigin,
  setInvitationEditorCookie,
  setPrivateHeaders
} = require('../server/auth');
const { getR2Configuration } = require('../server/r2-storage');
const { readInvitationPasscode, verifyInvitationPasscode } = require('../server/invitation-passcode');

module.exports = async function handler(request, response) {
  setPrivateHeaders(response);
  if (rejectCrossOrigin(request, response)) return;
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const setupError = configurationError() || getR2Configuration().error;
  if (setupError) return response.status(503).json({ configured: false, error: setupError });

  try {
    const savedPasscode = await readInvitationPasscode();
    const configured = Boolean(savedPasscode);
    if (!configured) {
      return response.status(request.method === 'GET' ? 200 : 503).json({
        configured: false,
        authenticated: false,
        error: 'The EVR admin must set an invitation editor passcode in Admin Settings first.'
      });
    }
    if (request.method === 'GET') {
      return response.status(200).json({
        configured: true,
        authenticated: isInvitationEditorAuthenticated(request, savedPasscode.hash)
      });
    }

    const body = request.body && typeof request.body === 'object' ? request.body : {};
    if (typeof body.passcode !== 'string' || !/^\d{4}$/.test(body.passcode)) {
      return response.status(400).json({ error: 'Enter the four-digit invitation editor passcode.' });
    }
    await checkInvitationPasscodeRateLimit(request);
    if (!await verifyInvitationPasscode(body.passcode, savedPasscode)) {
      return response.status(401).json({ error: 'That passcode is incorrect. Try again.' });
    }
    setInvitationEditorCookie(response, savedPasscode.hash);
    return response.status(200).json({ authenticated: true });
  } catch (error) {
    if (error.statusCode === 429) return response.status(429).json({ error: error.message });
    console.error('Unable to check invitation editor access:', error);
    return response.status(503).json({ error: 'Could not verify invitation editor access. Try again.' });
  }
};
