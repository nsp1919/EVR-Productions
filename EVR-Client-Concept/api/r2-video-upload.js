'use strict';

const crypto = require('node:crypto');
const {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { getR2Configuration, publicObjectUrl } = require('../server/r2-storage');
const {
  configurationError,
  isAuthenticated,
  rejectCrossOrigin,
  setPrivateHeaders
} = require('../server/auth');

const allowedExtensions = new Set(['3gp', 'avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'webm']);
const videoKeyPattern = /^evr-videos\/[0-9a-f-]{36}\.(?:3gp|avi|m4v|mkv|mov|mp4|mpeg|mpg|webm)$/i;

function parseBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  try {
    return JSON.parse(request.body || '{}');
  } catch {
    return null;
  }
}

function validUploadId(uploadId) {
  return typeof uploadId === 'string' && uploadId.length > 0 && uploadId.length <= 2048 &&
    !/[\u0000-\u001f]/.test(uploadId);
}

module.exports = async function handler(request, response) {
  setPrivateHeaders(response);
  if (rejectCrossOrigin(request, response)) return;
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  if (!isAuthenticated(request)) return response.status(401).json({ error: 'Sign in before uploading video.' });

  const body = parseBody(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response.status(400).json({ error: 'The R2 video-upload request is invalid.' });
  }
  const action = body.action;
  if (!['create', 'sign-part', 'complete', 'abort'].includes(action)) {
    return response.status(400).json({ error: 'Choose a valid R2 video-upload action.' });
  }

  const config = getR2Configuration();
  if (config.error) return response.status(503).json({ error: config.error });
  const setupError = configurationError();
  if (setupError) return response.status(503).json({ error: setupError });

  try {
    if (action === 'create') {
      const fileName = typeof body.fileName === 'string' ? body.fileName : '';
      const extension = fileName.split('.').pop().toLowerCase();
      const contentType = typeof body.contentType === 'string' ? body.contentType : '';
      if (!allowedExtensions.has(extension) || !/^video\/[a-z0-9.+-]+$/i.test(contentType)) {
        return response.status(400).json({ error: 'Choose a supported video file with a valid video content type.' });
      }

      const key = `evr-videos/${crypto.randomUUID()}.${extension}`;
      const result = await config.client.send(new CreateMultipartUploadCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable'
      }));
      if (!validUploadId(result.UploadId)) {
        throw new Error('Cloudflare R2 did not return a multipart upload ID.');
      }
      return response.status(200).json({
        key,
        uploadId: result.UploadId,
        playbackUrl: publicObjectUrl(config.publicBaseUrl, key)
      });
    }

    if (!videoKeyPattern.test(body.key) || !validUploadId(body.uploadId)) {
      return response.status(400).json({ error: 'The R2 video upload identity is invalid.' });
    }
    const common = {
      Bucket: config.bucket,
      Key: body.key,
      UploadId: body.uploadId
    };

    if (action === 'sign-part') {
      if (!Number.isSafeInteger(body.partNumber) || body.partNumber < 1 || body.partNumber > 10000) {
        return response.status(400).json({ error: 'The R2 video part number is invalid.' });
      }
      const uploadUrl = await getSignedUrl(config.client, new UploadPartCommand({
        ...common,
        PartNumber: body.partNumber
      }), { expiresIn: 900 });
      return response.status(200).json({ uploadUrl });
    }

    if (action === 'complete') {
      if (!Array.isArray(body.parts) || body.parts.length < 1 || body.parts.length > 10000 ||
          body.parts.some((part, index) => !part ||
            part.partNumber !== index + 1 ||
            typeof part.eTag !== 'string' ||
            !/^"?[a-f0-9]{32}"?$/i.test(part.eTag))) {
        return response.status(400).json({ error: 'The completed R2 video parts are invalid or out of order.' });
      }
      await config.client.send(new CompleteMultipartUploadCommand({
        ...common,
        MultipartUpload: {
          Parts: body.parts.map(part => ({ PartNumber: part.partNumber, ETag: part.eTag }))
        }
      }));
      return response.status(200).json({ playbackUrl: publicObjectUrl(config.publicBaseUrl, body.key) });
    }

    await config.client.send(new AbortMultipartUploadCommand(common));
    return response.status(200).json({ aborted: true });
  } catch (error) {
    console.error('Unable to complete EVR R2 video upload:', error);
    return response.status(502).json({
      error: 'Cloudflare R2 could not complete this video-upload step. Check bucket CORS and upload state, then retry.'
    });
  }
};

module.exports.getR2Configuration = getR2Configuration;
module.exports.publicObjectUrl = publicObjectUrl;
