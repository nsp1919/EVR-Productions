'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { list } = require('@vercel/blob');
const { getR2Configuration, publicObjectUrl } = require('../server/r2-storage');
const { validateContent } = require('../server/content-store');

const contentPath = 'evr/site-content-v1.json';
const contentPrefix = contentPath.slice(0, -'.json'.length);
const managedGalleryKey = '#work-gallery-items-v1';
const mediaRevertKey = '#media-revert-state-v1';
const blobUrlPattern = /https:\/\/[^\s"'<>]+/gi;

function isMissingObject(error) {
  return error.name === 'NoSuchKey' || error.name === 'NotFound' ||
    error.$metadata?.httpStatusCode === 404;
}

async function findLatestBlobContent() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: contentPrefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    blobs.push(...page.blobs.filter(blob =>
      blob.pathname === contentPath || blob.pathname.startsWith(`${contentPrefix}-`)
    ));
    if (!page.hasMore) break;
    if (!page.cursor || page.cursor === cursor) {
      throw new Error('Could not finish listing the legacy website content versions.');
    }
    cursor = page.cursor;
  } while (true);

  blobs.sort((left, right) =>
    right.uploadedAt.getTime() - left.uploadedAt.getTime() ||
    right.pathname.localeCompare(left.pathname)
  );
  if (!blobs.length) return { version: 1, entries: {} };

  const response = await fetch(blobs[0].url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not read the legacy content (${response.status}).`);
  return validateContent(await response.json());
}

async function migrateBlobUrl(value, config, migrated) {
  const source = new URL(value);
  if (!source.hostname.endsWith('.blob.vercel-storage.com')) return value;
  if (migrated.has(value)) return migrated.get(value);

  const response = await fetch(value, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not download a legacy media object (${response.status}).`);
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
  if (!contentType.startsWith('image/')) {
    throw new Error('A legacy non-image Blob asset was found. Migrate that asset separately before removing the old store.');
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length || body.length > 30 * 1024 * 1024) {
    throw new Error('A legacy image is empty or exceeds the 30 MB migration limit.');
  }

  const extension = contentType === 'image/jpeg' ? 'jpg' :
    contentType === 'image/svg+xml' ? 'svg' :
      contentType.split('/')[1].replace(/[^a-z0-9]/gi, '') || 'bin';
  const key = `evr-images/${crypto.randomUUID()}.${extension}`;
  await config.client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable'
  }));
  const target = publicObjectUrl(config.publicBaseUrl, key);
  migrated.set(value, target);
  return target;
}

async function replaceBlobUrls(value, config, migrated) {
  if (typeof value === 'string') {
    const matches = [...value.matchAll(blobUrlPattern)];
    let updated = value;
    for (const match of matches) {
      const sourceUrl = match[0].replace(/[),.;]+$/, '');
      const targetUrl = await migrateBlobUrl(sourceUrl, config, migrated);
      if (targetUrl !== sourceUrl) updated = updated.replaceAll(sourceUrl, targetUrl);
    }
    return updated;
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map(item => replaceBlobUrls(item, config, migrated)));
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = await replaceBlobUrls(item, config, migrated);
    }
    return result;
  }
  return value;
}

async function migrateContentMedia(content, config, migrated) {
  const entries = { ...content.entries };
  for (const [key, entry] of Object.entries(entries)) {
    if (key === managedGalleryKey && entry.type === 'text') {
      const items = JSON.parse(Buffer.from(entry.value, 'base64').toString('utf8'));
      entries[key] = {
        type: 'text',
        value: Buffer.from(JSON.stringify(await replaceBlobUrls(items, config, migrated))).toString('base64')
      };
    } else if (key === mediaRevertKey && entry.type === 'text') {
      const state = JSON.parse(entry.value);
      entries[key] = {
        type: 'text',
        value: JSON.stringify(await replaceBlobUrls(state, config, migrated))
      };
    } else {
      entries[key] = await replaceBlobUrls(entry, config, migrated);
    }
  }
  return validateContent({ version: content.version, entries });
}

async function main() {
  if (!process.argv.includes('--confirm')) {
    throw new Error('This migration writes content and images to R2. Review the setup guide, then rerun with --confirm.');
  }
  if (typeof process.loadEnvFile !== 'function') {
    throw new Error('Use Node.js 20.12 or newer to load the local environment file securely.');
  }
  process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

  const config = getR2Configuration();
  if (config.error) throw new Error(config.error);
  try {
    await config.client.send(new GetObjectCommand({ Bucket: config.bucket, Key: contentPath }));
    throw new Error('R2 already contains shared content. Refusing to overwrite it; verify the destination before retrying.');
  } catch (error) {
    if (!isMissingObject(error)) throw error;
  }

  const content = await findLatestBlobContent();
  const migrated = new Map();
  const updatedContent = await migrateContentMedia(content, config, migrated);
  await config.client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: contentPath,
    Body: JSON.stringify(updatedContent),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-store'
  }));
  console.log(`Migrated shared content and ${migrated.size} image(s) to Cloudflare R2.`);
}

main().catch(error => {
  console.error(`Vercel Blob to R2 migration failed: ${error.message}`);
  process.exitCode = 1;
});
