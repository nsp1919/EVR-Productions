'use strict';

const { randomUUID } = require('node:crypto');
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { createInvitationId, getInvitationStorageId } = require('../server/invitation-links');
const { getR2Configuration } = require('../server/r2-storage');
const {
  hasInvitationEditorSession,
  isInvitationEditorAuthenticated,
  rejectCrossOrigin,
  setPrivateHeaders
} = require('../server/auth');
const { readInvitationPasscode } = require('../server/invitation-passcode');

const maxInviteBytes = 4 * 1024 * 1024;
const startMarker = '/* WEDDING_CONFIG_START */';
const endMarker = '/* WEDDING_CONFIG_END */';
const metaStartMarker = '<!-- INVITATION_META_START -->';
const metaEndMarker = '<!-- INVITATION_META_END -->';

function errorResponse(response, message, status) {
  return response.status(status).json({ error: message });
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#39;');
}

function isValidInvitation(config) {
  return config && typeof config === 'object' && !Array.isArray(config)
    && typeof config.coupleNames === 'string'
    && typeof config.date === 'string'
    && typeof config.welcomeMessage === 'string'
    && typeof config.venueName === 'string'
    && typeof config.venueAddress === 'string'
    && typeof config.heroImage === 'string'
    && Array.isArray(config.gallery)
    && Array.isArray(config.events);
}

function getDeploymentOrigin(request) {
  const headers = request.headers || {};
  const host = (headers.host || process.env.VERCEL_URL || '').split(',')[0].trim();
  const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  if (!localHost && !/^(?:[a-z\d-]+\.)*(?:evrproductions\.in|vercel\.app)(?::\d+)?$/i.test(host)) {
    throw new Error('Invitation request host is not trusted.');
  }
  const forwardedProtocol = headers['x-forwarded-proto']?.split(',')[0].trim().toLowerCase();
  return new URL(`${localHost && forwardedProtocol !== 'https' ? 'http' : 'https'}://${host}`);
}

function getInvitationId(request) {
  const url = new URL(request.url, getDeploymentOrigin(request));
  return url.searchParams.get('id');
}

module.exports = async function invitationHandler(request, response) {
  setPrivateHeaders(response);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method === 'POST' && rejectCrossOrigin(request, response)) return;

  try {
    if (request.method === 'POST') {
      if (!hasInvitationEditorSession(request)) {
        return errorResponse(response, 'Enter the invitation editor passcode to save wedding invitations.', 401);
      }
      const savedPasscode = await readInvitationPasscode();
      if (!savedPasscode || !isInvitationEditorAuthenticated(request, savedPasscode.hash)) {
        return errorResponse(response, 'Enter the invitation editor passcode to save wedding invitations.', 401);
      }

      const config = request.body;
      if (!isValidInvitation(config)) return errorResponse(response, 'Invitation details are incomplete.', 400);
      if (Buffer.byteLength(JSON.stringify(config), 'utf8') > maxInviteBytes) {
        return errorResponse(response, 'This invitation is too large to store. Use smaller photos or music.', 413);
      }

      const storage = getR2Configuration();
      if (storage.error) return errorResponse(response, storage.error, 503);
      const id = createInvitationId(config.coupleNames, randomUUID());
      await storage.client.send(new PutObjectCommand({
        Bucket: storage.bucket,
        Key: `invitations/${getInvitationStorageId(id)}.json`,
        Body: JSON.stringify(config),
        ContentType: 'application/json; charset=utf-8',
        CacheControl: 'no-store'
      }));
      return response.status(201).json({ id });
    }

    if (request.method === 'GET') {
      const id = getInvitationId(request);
      const storageId = getInvitationStorageId(id);
      if (!storageId) return errorResponse(response, 'Invitation link is invalid.', 400);

      const storage = getR2Configuration();
      if (storage.error) return errorResponse(response, storage.error, 503);
      let stored;
      try {
        stored = await storage.client.send(new GetObjectCommand({
          Bucket: storage.bucket,
          Key: `invitations/${storageId}.json`
        }));
      } catch (error) {
        if (error.name === 'NoSuchKey' || error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          return response.status(404).end('Invitation not found.');
        }
        throw error;
      }
      if (!stored?.Body) {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return response.status(404).end('Invitation not found.');
      }
      const config = JSON.parse(await stored.Body.transformToString());
      if (!isValidInvitation(config)) return errorResponse(response, 'Stored invitation data is invalid.', 500);

      const templateUrl = new URL('/invitation/index.html', getDeploymentOrigin(request));
      const templateResponse = await fetch(templateUrl, { cache: 'no-store' });
      if (!templateResponse.ok) return errorResponse(response, 'Could not load the invitation template.', 502);
      const template = await templateResponse.text();
      const start = template.indexOf(startMarker);
      const end = template.indexOf(endMarker, start);
      if (start < 0 || end < 0) return errorResponse(response, 'Invitation template markers are missing.', 500);
      const metaStart = template.indexOf(metaStartMarker);
      const metaEnd = template.indexOf(metaEndMarker, metaStart);
      if (metaStart < 0 || metaEnd < 0) return errorResponse(response, 'Invitation metadata markers are missing.', 500);

      const safeConfig = JSON.stringify(config).replaceAll('<', '\\u003c');
      const configuredTemplate = `${template.slice(0, start)}const WEDDING = ${safeConfig};${template.slice(end + endMarker.length)}`;
      const title = escapeHtml(`${config.coupleNames} Invitation | EVR Productions`);
      const description = escapeHtml(`Join ${config.coupleNames} as they celebrate their wedding. View their invitation, event details, and venue.`);
      const invitationUrl = new URL(`/invitation/${encodeURIComponent(id)}`, getDeploymentOrigin(request)).href;
      let heroImage = '';
      try {
        const imageUrl = new URL(config.heroImage);
        if (imageUrl.protocol === 'https:') heroImage = imageUrl.href;
      } catch {
        heroImage = '';
      }
      const metadata = [
        metaStartMarker,
        `<title>${title}</title>`,
        `<meta name="description" content="${description}">`,
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="EVR Productions">',
        `<meta property="og:url" content="${escapeHtml(invitationUrl)}">`,
        `<meta property="og:title" content="${title}">`,
        `<meta property="og:description" content="${description}">`,
        ...(heroImage ? [`<meta property="og:image" content="${escapeHtml(heroImage)}">`] : []),
        `<meta name="twitter:card" content="${heroImage ? 'summary_large_image' : 'summary'}">`,
        `<meta name="twitter:title" content="${title}">`,
        `<meta name="twitter:description" content="${description}">`,
        ...(heroImage ? [`<meta name="twitter:image" content="${escapeHtml(heroImage)}">`] : []),
        metaEndMarker
      ].join('\n  ');
      const page = `${configuredTemplate.slice(0, metaStart)}${metadata}${configuredTemplate.slice(metaEnd + metaEndMarker.length)}`;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'private, no-store');
      return response.status(200).end(page);
    }

    response.setHeader('Allow', 'GET, POST');
    return errorResponse(response, 'Method not allowed.', 405);
  } catch (error) {
    console.error('Unable to load or save a wedding invitation:', error);
    return errorResponse(response, 'Invitation storage failed. Check the Cloudflare R2 configuration and connection.', 500);
  }
};
