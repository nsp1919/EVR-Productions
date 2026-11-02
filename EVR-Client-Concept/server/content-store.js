'use strict';

const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getR2Configuration } = require('./r2-storage');

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
  const config = getR2Configuration();
  if (config.error) throw new Error(config.error);
  try {
    const response = await config.client.send(new GetObjectCommand({
      Bucket: config.bucket,
      Key: contentPath
    }));
    return validateContent(JSON.parse(await response.Body.transformToString()));
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return emptyContent;
    }
    throw error;
  }
}

async function writeContent(content) {
  const validated = validateContent(content);
  const body = JSON.stringify(validated);
  if (Buffer.byteLength(body, 'utf8') > 4_000_000) throw new Error('Content is too large to save. Remove large inline images and try again.');
  const config = getR2Configuration();
  if (config.error) throw new Error(config.error);
  await config.client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: contentPath,
    Body: body,
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-store'
  }));
  return validated;
}

module.exports = { readContent, validateContent, writeContent };
