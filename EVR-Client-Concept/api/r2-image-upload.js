'use strict';

const crypto = require('node:crypto');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { getR2Configuration, publicObjectUrl } = require('../server/r2-storage');
const {
  configurationError,
  isAuthenticated,
  rejectCrossOrigin,
  setPrivateHeaders
} = require('../server/auth');

const maxImageBytes = 30 * 1024 * 1024;

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
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  if (!isAuthenticated(request)) return response.status(401).json({ error: 'Sign in before uploading an image.' });

  const body = parseBody(request);
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      body.contentType !== 'image/webp' || !Number.isSafeInteger(body.size) ||
      body.size < 1 || body.size > maxImageBytes) {
    return response.status(400).json({ error: 'Choose a processed WebP image up to 30 MB.' });
  }

  const setupError = configurationError();
  if (setupError) return response.status(503).json({ error: setupError });
  const config = getR2Configuration();
  if (config.error) return response.status(503).json({ error: config.error });

  try {
    const key = `evr-images/${crypto.randomUUID()}.webp`;
    const uploadUrl = await getSignedUrl(config.client, new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: body.contentType,
      ContentLength: body.size,
      CacheControl: 'public, max-age=31536000, immutable'
    }), {
      expiresIn: 300,
      signableHeaders: new Set(['content-type'])
    });
    return response.status(200).json({
      key,
      uploadUrl,
      imageUrl: publicObjectUrl(config.publicBaseUrl, key)
    });
  } catch (error) {
    console.error('Unable to authorize EVR R2 image upload:', error);
    return response.status(502).json({ error: 'Cloudflare R2 could not authorize this image upload.' });
  }
};

module.exports.maxImageBytes = maxImageBytes;
