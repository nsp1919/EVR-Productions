'use strict';

const { readContent, validateContent, writeContent } = require('../server/content-store');
const { getR2Configuration } = require('../server/r2-storage');
const {
  configurationError,
  isAuthenticated,
  rejectCrossOrigin,
  setPrivateHeaders
} = require('../server/auth');

module.exports = async function handler(request, response) {
  setPrivateHeaders(response);
  if (rejectCrossOrigin(request, response)) return;

  if (request.method === 'GET') {
    const setupError = getR2Configuration().error;
    if (setupError) return response.status(503).json({ error: setupError });
    try {
      return response.status(200).json(await readContent());
    } catch (error) {
      console.error('Unable to read EVR site content:', error);
      return response.status(500).json({ error: 'Could not load the shared website content.' });
    }
  }
  if (request.method !== 'PUT') {
    response.setHeader('Allow', 'GET, PUT');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  const setupError = configurationError() || getR2Configuration().error;
  if (setupError) return response.status(503).json({ error: setupError });
  if (!isAuthenticated(request)) return response.status(401).json({ error: 'Sign in to save website content.' });

  try {
    const body = request.body && typeof request.body === 'object' ? request.body : JSON.parse(request.body || '{}');
    const content = validateContent(body);
    return response.status(200).json(await writeContent(content));
  } catch (error) {
    if (error instanceof SyntaxError) return response.status(400).json({ error: 'The content request was not valid JSON.' });
    if (error.message.includes('supported') || error.message.includes('invalid') || error.message.includes('unsupported') || error.message.includes('too large')) {
      return response.status(400).json({ error: error.message });
    }
    console.error('Unable to save EVR site content:', error);
    return response.status(500).json({ error: 'Could not save the shared website content.' });
  }
};
