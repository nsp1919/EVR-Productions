'use strict';

const { list, put } = require('@vercel/blob');

const contentPath = 'evr/site-content-v1.json';
const contentPrefix = contentPath.slice(0, -'.json'.length);
const emptyContent = { version: 1, entries: {} };

function validateContent(value) {
  if (!value || value.version !== 1 || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) {
    throw new Error('Content must use the supported EVR content format.');
  }

  const entries = {};
  for (const [key, entry] of Object.entries(value.entries)) {
    if (key.length > 500 || !entry || typeof entry.value !== 'string' || entry.value.length > 1_000_000) {
      throw new Error('An edit entry is invalid or too large.');
    }

    if (entry.type === 'text') entries[key] = { type: 'text', value: entry.value };
    else if (entry.type === 'image' && /^(?:https?:\/\/|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(entry.value)) {
      entries[key] = { type: 'image', value: entry.value };
    } else if (entry.type === 'video' && /^https?:\/\//i.test(entry.value)) {
      entries[key] = { type: 'video', value: entry.value };
    } else if (entry.type === 'background' && /^(?:#[\da-f]{3,8}|rgba?\([\d.,% /\-]+\)|hsla?\([\d.,% /\-]+\)|[a-z]+)$/i.test(entry.value)) {
      entries[key] = { type: 'background', value: entry.value };
    } else {
      throw new Error('An edit entry contains an unsupported value.');
    }
  }
  return { version: 1, entries };
}

async function readContent() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: contentPrefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    blobs.push(...page.blobs.filter(blob =>
      blob.pathname === contentPath || blob.pathname.startsWith(`${contentPrefix}-`)
    ));
    if (!page.hasMore) break;
    if (!page.cursor || page.cursor === cursor) {
      throw new Error('Could not finish listing the saved website content versions.');
    }
    cursor = page.cursor;
  } while (true);

  blobs.sort((left, right) =>
    right.uploadedAt.getTime() - left.uploadedAt.getTime() ||
    right.pathname.localeCompare(left.pathname)
  );
  if (!blobs.length) return emptyContent;

  const latest = blobs[0];
  const contentUrl = new URL(latest.url);
  contentUrl.searchParams.set('v', String(latest.uploadedAt.getTime()));
  const response = await fetch(contentUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not read the saved content (${response.status}).`);
  return validateContent(await response.json());
}

async function writeContent(content) {
  const validated = validateContent(content);
  const body = JSON.stringify(validated);
  if (Buffer.byteLength(body, 'utf8') > 4_000_000) throw new Error('Content is too large to save. Remove large inline images and try again.');
  await put(contentPath, body, {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 60
  });
  return validated;
}

module.exports = { readContent, validateContent, writeContent };
