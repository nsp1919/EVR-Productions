'use strict';

const { list, put } = require('@vercel/blob');

const contentPath = 'evr/site-content-v1.json';
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
  const { blobs } = await list({ prefix: contentPath, limit: 1 });
  if (!blobs.length) return emptyContent;

  const response = await fetch(blobs[0].url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not read the saved content (${response.status}).`);
  return validateContent(await response.json());
}

async function writeContent(content) {
  const validated = validateContent(content);
  const body = JSON.stringify(validated);
  if (Buffer.byteLength(body, 'utf8') > 4_000_000) throw new Error('Content is too large to save. Remove large inline images and try again.');
  await put(contentPath, body, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 60
  });
  return validated;
}

module.exports = { readContent, validateContent, writeContent };
