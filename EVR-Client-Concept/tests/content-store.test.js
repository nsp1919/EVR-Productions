'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const blobSdk = require('@vercel/blob');

const originalList = blobSdk.list;
const originalPut = blobSdk.put;
const originalFetch = global.fetch;
const blobContents = new Map();
const storedBlobs = [];
const uploadOptions = [];
const fetchedContentUrls = [];
const contentPrefix = 'evr/site-content-v1';
let putCount = 0;
let listCalls = 0;

blobSdk.list = async ({ prefix, limit, cursor }) => {
  listCalls += 1;
  assert.equal(prefix, contentPrefix);
  const start = Number(cursor || 0);
  const matches = storedBlobs
    .filter(blob => blob.pathname.startsWith(prefix))
    .sort((left, right) => left.uploadedAt - right.uploadedAt);
  const blobs = matches.slice(start, start + limit);
  const next = start + blobs.length;
  const hasMore = next < matches.length;
  return { blobs, hasMore, cursor: hasMore ? String(next) : undefined };
};

blobSdk.put = async (pathname, body, options) => {
  const versionedPath = `${pathname.slice(0, -'.json'.length)}-${++putCount}.json`;
  const blob = {
    pathname: versionedPath,
    url: `https://blob.test/${versionedPath}`,
    uploadedAt: new Date(Date.UTC(2026, 10, 2, 0, 0, putCount))
  };
  storedBlobs.push(blob);
  blobContents.set(blob.url, body);
  uploadOptions.push(options);
  return blob;
};

global.fetch = async url => {
  const parsedUrl = new URL(String(url));
  fetchedContentUrls.push(parsedUrl.href);
  parsedUrl.searchParams.delete('v');
  const body = blobContents.get(parsedUrl.href);
  if (!body) return new Response('Not found', { status: 404 });
  return new Response(body, { status: 200 });
};

const { readContent, writeContent } = require('../server/content-store');

test.after(() => {
  blobSdk.list = originalList;
  blobSdk.put = originalPut;
  global.fetch = originalFetch;
});

test('content saves use fresh blob URLs and reads return the newest version immediately', async () => {
  const legacyContent = { version: 1, entries: { headline: { type: 'text', value: 'Legacy' } } };
  storedBlobs.push({
    pathname: 'evr/site-content-v1.json',
    url: 'https://blob.test/legacy-content.json',
    uploadedAt: new Date('2026-10-01T00:00:00.000Z')
  });
  blobContents.set('https://blob.test/legacy-content.json', JSON.stringify(legacyContent));
  assert.deepEqual(await readContent(), legacyContent);
  assert.equal(new URL(fetchedContentUrls[0]).searchParams.get('v'),
    String(Date.parse('2026-10-01T00:00:00.000Z')));

  const firstVersion = { version: 1, entries: { headline: { type: 'text', value: 'First update' } } };
  const secondVersion = { version: 1, entries: { headline: { type: 'text', value: 'Latest update' } } };
  await writeContent(firstVersion);
  const firstSavedContent = await readContent();
  await writeContent(secondVersion);
  const latestSavedContent = await readContent();

  assert.deepEqual(firstSavedContent, firstVersion);
  assert.deepEqual(latestSavedContent, secondVersion);
  assert.equal(new Set(storedBlobs.map(blob => blob.url)).size, storedBlobs.length);
  assert.equal(uploadOptions.every(options =>
    options.addRandomSuffix === true &&
    options.allowOverwrite !== true &&
    options.cacheControlMaxAge === 60
  ), true);
});

test('content reads paginate through all versions before selecting the newest', async () => {
  const olderContent = { version: 1, entries: {} };
  const latestContent = { version: 1, entries: { title: { type: 'text', value: 'Newest' } } };
  for (let index = 0; index < 1000; index += 1) {
    const url = `https://blob.test/older-${index}.json`;
    storedBlobs.push({
      pathname: `${contentPrefix}-older-${index}.json`,
      url,
      uploadedAt: new Date(Date.UTC(2026, 0, 1) + index)
    });
    blobContents.set(url, JSON.stringify(olderContent));
  }
  const latestUrl = 'https://blob.test/latest-version.json';
  storedBlobs.push({
    pathname: `${contentPrefix}-latest.json`,
    url: latestUrl,
    uploadedAt: new Date('2027-01-01T00:00:00.000Z')
  });
  blobContents.set(latestUrl, JSON.stringify(latestContent));

  const before = listCalls;
  assert.deepEqual(await readContent(), latestContent);
  assert.equal(listCalls - before, 2);
});
