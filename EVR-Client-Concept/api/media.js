'use strict';

const { handleUpload } = require('@vercel/blob/client');
const {
  configurationError,
  isAuthenticated,
  rejectCrossOrigin,
  setPrivateHeaders
} = require('../server/auth');

module.exports = async function handler(request, response) {
  setPrivateHeaders(response);
  if (rejectCrossOrigin(request, response)) return;
  const setupError = configurationError();
  if (setupError) return response.status(503).json({ error: setupError });
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const result = await handleUpload({
      body: request.body,
      request,
      onBeforeGenerateToken: async pathname => {
        if (!isAuthenticated(request)) throw new Error('Sign in before uploading media.');
        if (!pathname.startsWith('evr-media/')) throw new Error('Invalid media destination.');
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          maximumSizeInBytes: 250 * 1024 * 1024,
          addRandomSuffix: true
        };
      }
    });
    return response.status(200).json(result);
  } catch (error) {
    if (error.message.includes('Sign in')) return response.status(401).json({ error: error.message });
    if (error.message.includes('Invalid media')) return response.status(400).json({ error: error.message });
    console.error('Unable to authorize EVR media upload:', error);
    return response.status(500).json({ error: 'Could not authorize the media upload.' });
  }
};
