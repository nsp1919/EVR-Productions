const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { mockAdminApi } = require('./admin-api-mock');

const fixture = path.resolve(__dirname, '..', 'assets', 'demo-wedding.mp4');

test('valid MP4 survives save, export, reset, import, and reload', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.route('https://media.example.com/**', route => route.fulfill({
    body: fs.readFileSync(fixture),
    headers: { 'access-control-allow-origin': '*', 'content-type': 'video/mp4' }
  }));
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('corporate');
  await page.locator('[data-admin-mode="video"]').click();
  await page.locator('#admin-video-target').selectOption({ index: 0 });
  await page.locator('#admin-video-file').setInputFiles(fixture);
  await expect(page.locator('#admin-status')).toContainText('Video uploaded to Cloudflare R2');
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(Object.values(api.getContent().entries).some(entry => entry.type === 'video' && entry.value === 'https://media.example.com/evr-videos/test-video.mp4')).toBe(true);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#admin-export').click();
  const download = await downloadPromise;
  const exportPath = test.info().outputPath('evr-export.json');
  await download.saveAs(exportPath);

  page.once('dialog', dialog => dialog.accept());
  const resetLoad = page.waitForEvent('load');
  await page.locator('#admin-reset').click();
  await resetLoad;

  const importLoad = page.waitForEvent('load');
  await page.locator('#admin-import-file').setInputFiles(exportPath);
  await importLoad;
  await expect.poll(() => Object.values(api.getContent().entries)).toHaveLength(1);
  expect(Object.values(api.getContent().entries)[0].type).toBe('video');
  expect(Object.values(api.getContent().entries)[0].value).toContain('/evr-videos/test-video.mp4');
});

test('browser uploader sends signed multipart chunks directly to Cloudflare R2', async ({ page }) => {
  await mockAdminApi(page, undefined, true, { mockUploader: false });
  const key = 'evr-videos/12345678-1234-4234-8234-123456789abc.mp4';
  const playbackUrl = `https://media.example.com/${key}`;
  const actions = [];
  await page.route('**/api/r2-video-upload', async route => {
    const body = route.request().postDataJSON();
    actions.push(body.action);
    if (body.action === 'create') {
      return route.fulfill({ json: {
        key,
        uploadId: 'test-r2-upload-id',
        playbackUrl
      } });
    }
    if (body.action === 'sign-part') {
      return route.fulfill({ json: { uploadUrl: 'https://uploads.example.com/part?signature=test' } });
    }
    return route.fulfill({ json: { playbackUrl } });
  });
  let uploadRequest;
  await page.route('https://uploads.example.com/**', async route => {
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'PUT',
      'access-control-allow-headers': 'content-type',
      'access-control-expose-headers': 'ETag',
      'access-control-max-age': '86400'
    };
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    uploadRequest = {
      method: route.request().method(),
      contentType: route.request().headers()['content-type'],
      body: route.request().postDataBuffer()
    };
    return route.fulfill({ headers: { ...corsHeaders, etag: '"0123456789abcdef0123456789abcdef"' } });
  });
  await page.addInitScript(() => {
    window.__hlsSources = [];
    Object.defineProperty(HTMLMediaElement.prototype, 'canPlayType', {
      configurable: true,
      value: () => ''
    });
    window.evrHls = class {
      static isSupported() { return true; }
      loadSource(source) { window.__hlsSources.push(source); }
      attachMedia() {}
      destroy() {}
    };
  });

  await page.goto('/#/admin');
  await expect.poll(() => page.evaluate(() => typeof window.evrUploadR2Video)).toBe('function');
  await page.locator('#admin-preview-page').selectOption('corporate');
  await page.locator('[data-admin-mode="video"]').click();
  await page.locator('#admin-video-target').selectOption({ index: 0 });
  await page.locator('#admin-video-file').setInputFiles(fixture);
  await expect(page.locator('#admin-status')).toContainText('Video uploaded to Cloudflare R2');
  expect(uploadRequest.method).toBe('PUT');
  expect(uploadRequest.contentType).toContain('video/mp4');
  expect(uploadRequest.body.length).toBeGreaterThan(0);
  expect(actions).toEqual(['create', 'sign-part', 'complete']);
  await expect(page.locator('#admin-video-target')).toHaveValue('0');
});
