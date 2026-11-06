'use strict';

const { randomUUID } = require('node:crypto');
const { get, put } = require('@vercel/blob');
const { createInvitationId, getInvitationStorageId } = require('../server/invitation-links');

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
  const host = (process.env.VERCEL_URL || headers.host || '').split(',')[0].trim();
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
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    if (request.method === 'POST') {
      const adminKey = process.env.INVITATION_ADMIN_KEY;
      if (!adminKey) return errorResponse(response, 'Invitation storage is not configured yet.', 503);
      if (request.headers.authorization !== `Bearer ${adminKey}`) {
        return errorResponse(response, 'The invitation admin key is incorrect.', 401);
      }

      const config = request.body;
      if (!isValidInvitation(config)) return errorResponse(response, 'Invitation details are incomplete.', 400);
      if (Buffer.byteLength(JSON.stringify(config), 'utf8') > maxInviteBytes) {
        return errorResponse(response, 'This invitation is too large to store. Use smaller photos or music.', 413);
      }

      const id = createInvitationId(config.coupleNames, randomUUID());
      await put(`invitations/${getInvitationStorageId(id)}.json`, JSON.stringify(config), {
        access: 'private',
        addRandomSuffix: false,
        contentType: 'application/json'
      });
      return response.status(201).json({ id });
    }

    if (request.method === 'GET') {
      const id = getInvitationId(request);
      const storageId = getInvitationStorageId(id);
      if (!storageId) return errorResponse(response, 'Invitation link is invalid.', 400);

      const stored = await get(`invitations/${storageId}.json`, { access: 'private' });
      if (!stored || stored.statusCode !== 200) {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return response.status(404).end('Invitation not found.');
      }
      const config = await new Response(stored.stream).json();
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
      const title = escapeHtml(`${config.coupleNames} | Wedding Invitation`);
      const description = escapeHtml(`Join ${config.coupleNames} for their wedding celebration.`);
      const metadata = [
        metaStartMarker,
        `<title>${title}</title>`,
        `<meta name="description" content="${description}">`,
        '<meta property="og:type" content="website">',
        `<meta property="og:title" content="${title}">`,
        `<meta property="og:description" content="${description}">`,
        '<meta name="twitter:card" content="summary">',
        `<meta name="twitter:title" content="${title}">`,
        `<meta name="twitter:description" content="${description}">`,
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
    return errorResponse(response, 'Invitation storage failed. Check the Vercel Blob connection.', 500);
  }
};
