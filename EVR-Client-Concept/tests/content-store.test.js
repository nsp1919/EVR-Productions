'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} = require('@aws-sdk/client-s3');

const originalSend = S3Client.prototype.send;
const originalEnvironment = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET_NAME,
  publicBaseUrl: process.env.R2_PUBLIC_BASE_URL
};
process.env.CLOUDFLARE_ACCOUNT_ID = '1234567890abcdef1234567890abcdef';
process.env.R2_ACCESS_KEY_ID = 'test-r2-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-only-r2-secret';
process.env.R2_BUCKET_NAME = 'evr-media';
process.env.R2_PUBLIC_BASE_URL = 'https://media.example.com';

const objects = new Map();
const commands = [];
S3Client.prototype.send = async function send(command) {
  commands.push(command);
  if (command instanceof GetObjectCommand) {
    const body = objects.get(command.input.Key);
    if (body === undefined) {
      const error = new Error('Object not found');
      error.name = 'NoSuchKey';
      throw error;
    }
    return { Body: { transformToString: async () => body } };
  }
  if (command instanceof PutObjectCommand) {
    objects.set(command.input.Key, command.input.Body);
    return {};
  }
  throw new Error(`Unexpected R2 command: ${command.constructor.name}`);
};

const { readContent, writeContent } = require('../server/content-store');

test.after(() => {
  S3Client.prototype.send = originalSend;
  for (const [name, value] of Object.entries({
    CLOUDFLARE_ACCOUNT_ID: originalEnvironment.accountId,
    R2_ACCESS_KEY_ID: originalEnvironment.accessKeyId,
    R2_SECRET_ACCESS_KEY: originalEnvironment.secretAccessKey,
    R2_BUCKET_NAME: originalEnvironment.bucket,
    R2_PUBLIC_BASE_URL: originalEnvironment.publicBaseUrl
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('shared content is stored and read from the same Cloudflare R2 object', async () => {
  const firstVersion = { version: 1, entries: { headline: { type: 'text', value: 'First update' } } };
  const secondVersion = { version: 1, entries: { headline: { type: 'text', value: 'Latest update' } } };

  assert.deepEqual(await readContent(), { version: 1, entries: {} });
  assert.deepEqual(await writeContent(firstVersion), firstVersion);
  assert.deepEqual(await readContent(), firstVersion);
  assert.deepEqual(await writeContent(secondVersion), secondVersion);
  assert.deepEqual(await readContent(), secondVersion);

  const writes = commands.filter(command => command instanceof PutObjectCommand);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].input.Key, 'evr/site-content-v1.json');
  assert.equal(writes[0].input.CacheControl, 'no-store');
  assert.equal(writes.every(command => command.input.Bucket === 'evr-media'), true);
});

test('shared content reads report corrupt JSON instead of treating it as empty', async () => {
  objects.set('evr/site-content-v1.json', '{invalid');
  await assert.rejects(readContent(), SyntaxError);
});

test('shared content validates video testimonial metadata and secure playback URLs', async () => {
  const testimonials = {
    version: 1,
    enabled: true,
    items: [{
      id: '12345678-1234-4234-8234-123456789abc',
      clientName: 'Asha & Ravi',
      caption: 'A wonderful celebration',
      videoUrl: 'https://media.example.com/evr-videos/testimonial.mp4'
    }]
  };
  const content = {
    version: 1,
    entries: { '#video-testimonials-v1': { type: 'text', value: JSON.stringify(testimonials) } }
  };

  assert.deepEqual(await writeContent(content), content);
  assert.deepEqual(await readContent(), content);

  const invalid = structuredClone(content);
  const data = JSON.parse(invalid.entries['#video-testimonials-v1'].value);
  data.items[0].videoUrl = 'http://media.example.com/testimonial.mp4';
  invalid.entries['#video-testimonials-v1'].value = JSON.stringify(data);
  assert.throws(() => require('../server/content-store').validateContent(invalid), /HTTPS/);
});
