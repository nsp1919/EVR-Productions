const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { mockAdminApi } = require('./admin-api-mock');
const { clickContextualMediaAction, clickFirstContextualMediaAction } = require('./admin-media-helpers');

const fixture = path.resolve(__dirname, '..', 'assets', 'nbrands-case-study-cphtij.mp4');

test('valid MP4 survives save, export, reset, import, and reload', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.route('https://media.example.com/**', route => route.fulfill({
    body: fs.readFileSync(fixture),
    headers: { 'access-control-allow-origin': '*', 'content-type': 'video/mp4' }
  }));
  await page.goto('/#/admin');
  await expect(page.locator('[data-admin-mode="image"], [data-admin-mode="video"], #admin-image-target, #admin-video-target')).toHaveCount(0);
  await page.locator('#admin-preview-page').selectOption('corporate');
  await clickFirstContextualMediaAction(page, 'Replace video');
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
  await clickFirstContextualMediaAction(page, 'Replace video');
  await page.locator('#admin-video-file').setInputFiles(fixture);
  await expect(page.locator('#admin-status')).toContainText('Video uploaded to Cloudflare R2');
  expect(uploadRequest.method).toBe('PUT');
  expect(uploadRequest.contentType).toContain('video/mp4');
  expect(uploadRequest.body.length).toBeGreaterThan(0);
  expect(actions).toEqual(['create', 'sign-part', 'complete']);
});

test('browser image uploader requests a signed R2 URL and uploads directly to R2', async ({ page }) => {
  await mockAdminApi(page, undefined, true, { mockUploader: false });
  const photo = path.resolve(__dirname, '..', 'assets', 'process-cards', 'process-card-01-your-moments.png');
  let authorization;
  let uploadRequest;
  await page.route('**/api/r2-image-upload', async route => {
    authorization = route.request().postDataJSON();
    return route.fulfill({ json: {
      key: 'evr-images/12345678-1234-4234-8234-123456789abc.webp',
      uploadUrl: 'https://uploads.example.com/image?signature=test',
      imageUrl: 'https://media.example.com/evr-images/12345678-1234-4234-8234-123456789abc.webp'
    } });
  });
  await page.route('https://uploads.example.com/**', async route => {
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'PUT',
      'access-control-allow-headers': 'content-type'
    };
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    uploadRequest = {
      method: route.request().method(),
      contentType: route.request().headers()['content-type'],
      body: route.request().postDataBuffer()
    };
    return route.fulfill({ headers: corsHeaders });
  });
  await page.route('https://media.example.com/**', route => route.fulfill({
    status: 200,
    headers: { 'content-type': 'image/webp', 'access-control-allow-origin': '*' },
    body: ''
  }));
  await page.goto('/#/admin');
  await expect.poll(() => page.evaluate(() => typeof window.evrUploadMedia)).toBe('function');
  await page.locator('#admin-preview-page').selectOption('work');
  await page.locator('#work .admin-add-work-card').click();
  await page.locator('#admin-work-title').fill('Direct R2 image upload');
  await page.locator('#admin-work-category').selectOption('celebration');
  await page.locator('#admin-work-description').fill('Image uploads go straight to Cloudflare.');
  await page.locator('input[name="admin-work-media-type"][value="image"]').check();
  await page.locator('#admin-work-image').setInputFiles(photo);
  await page.locator('#admin-work-controls button[type="submit"]').click();
  await expect(page.locator('#admin-status')).toContainText('Story uploaded');
  expect(authorization.contentType).toBe('image/webp');
  expect(authorization.size).toBeGreaterThan(0);
  expect(authorization.size).toBeLessThanOrEqual(30 * 1024 * 1024);
  expect(uploadRequest.method).toBe('PUT');
  expect(uploadRequest.contentType).toBe('image/webp');
  expect(uploadRequest.body.length).toBe(authorization.size);
  await expect(page.locator('#work .story-library .admin-managed-work-item img'))
    .toHaveAttribute('src', 'https://media.example.com/evr-images/12345678-1234-4234-8234-123456789abc.webp');
});

test('one transparent PNG replacement updates and persists every shared EVR logo', async ({ page }) => {
  const api = await mockAdminApi(page);
  const logo = path.resolve(__dirname, '..', 'assets', 'evr-productions-logo.png');
  await page.goto('/#/admin');
  expect(await page.locator('.brand-logo-plate').first().evaluate(element => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.borderWidth, style.boxShadow];
  })).toEqual(['rgba(0, 0, 0, 0)', '0px', 'none']);

  const opaquePng = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 2, 2);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await page.locator('#admin-logo-replace').click();
  await page.locator('#admin-logo-file').setInputFiles({
    name: 'opaque.png',
    mimeType: 'image/png',
    buffer: opaquePng
  });
  await expect(page.locator('#admin-status')).toContainText('must contain transparent pixels');
  expect(Object.keys(api.getContent().entries)).toHaveLength(0);

  await page.locator('#admin-logo-replace').click();
  await page.locator('#admin-logo-file').setInputFiles(logo);
  await expect(page.locator('#admin-status')).toContainText('publish both versions everywhere');
  const logoSources = await page.locator('[data-brand-logo]').evaluateAll(images =>
    images.reduce((sources, image) => {
      sources[image.dataset.brandLogo] = image.getAttribute('src');
      return sources;
    }, {})
  );
  expect(logoSources.light).toContain('media-1.webp');
  expect(logoSources.dark).toContain('media-2.webp');
  expect(await page.locator('[data-brand-logo]').evaluateAll((images, sources) =>
    images.length > 0 && images.every(image => image.getAttribute('src') === sources[image.dataset.brandLogo]),
    logoSources
  )).toBe(true);
  await expect(page.locator('.phone-top [data-brand-logo]')).toHaveAttribute('src', logoSources.light);
  await expect(page.locator('#services .service-wheel-brand [data-brand-logo]'))
    .toHaveAttribute('src', logoSources.light);
  await expect(page.locator('.footer-brand-block [data-brand-logo]').first())
    .toHaveAttribute('src', logoSources.dark);

  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(api.getContent().entries['#brand-logo-v2']).toEqual({
    type: 'text',
    value: JSON.stringify(logoSources)
  });

  await page.reload();
  await expect(page.locator('#admin-status')).toContainText('Shared website content loaded');
  await expect(page.locator('header .brand-logo-link [data-brand-logo]'))
    .toHaveAttribute('src', logoSources.light);
  await expect(page.locator('.footer-brand-block [data-brand-logo]').first())
    .toHaveAttribute('src', logoSources.dark);
  await expect(page.locator('#quote-print-document .quote-print-brand [data-brand-logo]'))
    .toHaveAttribute('src', logoSources.light);
  await expect(page.locator('#quote-print-document .quote-print-footer [data-brand-logo]'))
    .toHaveAttribute('src', logoSources.dark);
  await page.goto('/#/estimate');
  const publicBuilder = page.locator('#wedding-quotation-builder');
  await publicBuilder.locator('.builder-grid label').filter({ hasText: 'Client name' }).locator('input').fill('Asha Rao');
  await publicBuilder.locator('.builder-choices label').filter({ hasText: 'Engagement' }).locator('input').check();
  await publicBuilder.locator('[data-item="photographer"]').first().fill('1');
  await publicBuilder.getByRole('button', { name: 'Preview / print estimate' }).click();
  await expect(page.locator('#quote-print-dialog')).toBeVisible();
  await expect(page.locator('#quote-print-document .quote-print-brand [data-brand-logo]'))
    .toHaveAttribute('src', logoSources.light);
  await expect(page.locator('#quote-print-document .quote-print-footer [data-brand-logo]'))
    .toHaveAttribute('src', logoSources.dark);

  await page.locator('#quote-print-close').click();
  await page.goto('/#/studio');
  await expect(page.locator('#quote-studio-app')).toBeVisible();
  await page.locator('.quote-settings summary').click();
  await page.locator('[data-rate-key="wedding:crew:traditional-photo"]').fill('12500');
  await page.locator('#quote-reviewed').check();
  await page.locator('#quote-save-settings').click();
  await page.locator('#quote-client').fill('Asha Rao');
  await page.locator('#quote-project').fill('Wedding coverage');
  await page.locator('#quote-event-choices label').filter({ hasText: 'Engagement' }).locator('input').check();
  await page.getByLabel('Engagement, day 1, Traditional photographer / day quantity').fill('1');
  await page.locator('#quote-preview').click();
  await expect(page.locator('#quote-print-dialog')).toBeVisible();
  await expect(page.locator('#quote-print-document .quote-print-brand [data-brand-logo]'))
    .toHaveAttribute('src', logoSources.light);
  await expect(page.locator('#quote-print-document .quote-print-footer [data-brand-logo]'))
    .toHaveAttribute('src', logoSources.dark);

  await page.goto('/sample-quotation.html');
  await expect(page.locator('[data-brand-logo]').first()).toHaveAttribute('src', logoSources.light);
  await page.goto('/EVR-Productions-Quotation-Studio.html');
  await expect(page.locator('.masthead [data-brand-logo]')).toHaveAttribute('src', logoSources.dark);
  await expect(page.locator('.quotation-head [data-brand-logo]')).toHaveAttribute('src', logoSources.light);
  await expect(page.locator('.proposal-footer [data-brand-logo]')).toHaveAttribute('src', logoSources.light);
  await page.locator('.settings summary').click();
  await page.locator('[data-rate-key="wedding:crew:traditional-photo"]').fill('12500');
  await page.locator('#reviewed').check();
  await page.locator('#save-settings').click();
  await page.locator('#client').fill('Asha Rao');
  await page.locator('#project').fill('Wedding coverage');
  await page.locator('.choice').filter({ hasText: 'Engagement' }).locator('input').check();
  await page.getByLabel('Traditional photographer / day, day 1, quantity').fill('1');
  await page.locator('#preview').click();
  await expect(page.locator('#print-dialog')).toBeVisible();
  await expect(page.locator('.quotation-head [data-brand-logo]')).toHaveAttribute('src', logoSources.light);
  await expect(page.locator('.proposal-footer [data-brand-logo]')).toHaveAttribute('src', logoSources.light);
});

test('admin can replace a Work portfolio card video from its contextual control', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.goto('/#/admin');
  await expect(page.locator('.admin-controls')).toBeVisible();
  await page.locator('#admin-preview-page').selectOption('work');
  const firstPortfolioCard = page.locator('#work .story-library article').first();
  await firstPortfolioCard.scrollIntoViewIfNeeded();
  const portfolioMediaActions = page.locator('.admin-media-actions').filter({
    has: page.getByRole('button', { name: 'Delete story' })
  });
  const firstCardActions = portfolioMediaActions.first();
  await expect(firstCardActions.getByRole('button', { name: 'Replace video' })).toBeVisible();
  await expect(portfolioMediaActions.first().getByRole('button', { name: 'Replace photo' })).toHaveCount(0);
  const previousVideoUrl = await firstPortfolioCard.locator('.preview-media').getAttribute('data-r2-video-url');

  await firstCardActions.getByRole('button', { name: 'Replace video' }).click();
  await page.locator('#admin-video-file').setInputFiles(fixture);
  await expect(page.locator('#admin-status')).toContainText('Video uploaded to Cloudflare R2');
  await expect(firstCardActions.getByRole('button', { name: 'Revert video' })).toBeVisible();
  const portfolioVideo = page.locator('#work .story-library article').first().locator('video');
  await expect(portfolioVideo).toBeVisible();
  expect(await portfolioVideo.evaluate(video => video.controls)).toBe(false);
  expect(await portfolioVideo.evaluate(video => video.muted)).toBe(true);
  expect(await portfolioVideo.evaluate(video => video.loop)).toBe(true);

  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  await firstPortfolioCard.scrollIntoViewIfNeeded();
  await expect(firstCardActions.getByRole('button', { name: 'Revert video' })).toBeVisible();

  const savedEntries = Object.values(api.getContent().entries);
  expect(savedEntries.some(entry => entry.type === 'video' && entry.value === 'https://media.example.com/evr-videos/test-video.mp4')).toBe(true);
  expect(savedEntries.some(entry => entry.type === 'text' && entry.value.includes(previousVideoUrl))).toBe(true);

  await page.reload();
  await page.locator('#admin-preview-page').selectOption('work');
  const reloadedCard = page.locator('#work .story-library article').first();
  await reloadedCard.scrollIntoViewIfNeeded();
  const reloadedActions = page.locator('.admin-media-actions').filter({
    has: page.getByRole('button', { name: 'Delete story' })
  }).first();
  await expect(reloadedActions.getByRole('button', { name: 'Revert video' })).toBeVisible();
  await reloadedActions.getByRole('button', { name: 'Revert video' }).click();
  await expect(reloadedCard.locator('video')).toHaveAttribute('src', previousVideoUrl);
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(Object.values(api.getContent().entries).some(entry => entry.type === 'video' && entry.value === previousVideoUrl)).toBe(true);
  expect(Object.keys(api.getContent().entries)).not.toContain('#media-revert-state-v1');
});

test('admin can set and revert a cover for an existing video', async ({ page }) => {
  const api = await mockAdminApi(page);
  const photo = path.resolve(__dirname, '..', 'assets', 'process-cards', 'process-card-01-your-moments.png');
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('work');

  const card = page.locator('#work .story-library article').first();
  const media = card.locator('.preview-media');
  await clickContextualMediaAction(page, '#work .story-library article:first-child .preview-media', 'Replace cover');
  await page.locator('#admin-photo-file').setInputFiles(photo);
  await expect(page.locator('#admin-status')).toContainText('Video cover uploaded');
  await expect(media.locator('img')).toHaveAttribute('src', 'https://blob.test/media-1.webp');
  await expect(media.locator('video')).toHaveJSProperty('poster', 'https://blob.test/media-1.webp');

  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  const coverEntry = Object.entries(api.getContent().entries)
    .find(([, entry]) => entry.type === 'video-cover');
  expect(coverEntry?.[1].value).toBe('https://blob.test/media-1.webp');
  expect(api.getContent().entries['#media-revert-state-v1'].value).toContain(coverEntry[0]);

  await page.reload();
  await page.locator('#admin-preview-page').selectOption('work');
  const reloadedCard = page.locator('#work .story-library article').first();
  await reloadedCard.scrollIntoViewIfNeeded();
  await expect(reloadedCard.locator('.preview-media img')).toHaveAttribute('src', 'https://blob.test/media-1.webp');
  await expect(reloadedCard.locator('.preview-media video')).toHaveJSProperty('poster', 'https://blob.test/media-1.webp');
  await clickContextualMediaAction(page, '#work .story-library article:first-child .preview-media', 'Revert cover');
  await expect(reloadedCard.locator('.preview-media img')).not.toHaveAttribute('src', 'https://blob.test/media-1.webp');
});

test('admin can add and publish a new celebration story with an image', async ({ page }) => {
  const api = await mockAdminApi(page);
  const photo = path.resolve(__dirname, '..', 'assets', 'process-cards', 'process-card-01-your-moments.png');
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('work');
  await page.locator('#work .admin-add-work-card').click();
  await expect(page.locator('#admin-work-dialog')).toBeVisible();
  await expect(page.locator('#admin-work-image-upload')).toBeHidden();
  await expect(page.locator('#admin-work-video-upload')).toBeHidden();
  await expect(page.locator('#admin-work-category option')).toHaveText([
    'Wedding day',
    'Pre-wedding',
    'Celebrations',
    'Birthdays',
    'Maternity',
    'Half Saree',
    'Engagement parties',
    'Other events'
  ]);
  await page.locator('#admin-work-title').fill('A new family celebration');
  await page.locator('#admin-work-category').selectOption('celebration');
  await page.locator('#admin-work-description').fill('A personal story with family and friends.');
  await page.locator('input[name="admin-work-media-type"][value="image"]').check();
  await expect(page.locator('#admin-work-image-upload')).toBeVisible();
  await expect(page.locator('#admin-work-video-upload')).toBeHidden();
  expect(await page.locator('#admin-work-image').evaluate(input => input.required)).toBe(true);
  expect(await page.locator('#admin-work-video').evaluate(input => input.required)).toBe(false);
  await page.locator('#admin-work-image').setInputFiles(photo);
  await page.locator('#admin-work-controls button[type="submit"]').click();

  await expect(page.locator('#admin-status')).toContainText('Story uploaded');
  await expect(page.locator('#admin-work-dialog')).toBeHidden();
  const addedCard = page.locator('#work .story-library .admin-managed-work-item');
  await expect(addedCard).toContainText('A new family celebration');
  await expect(addedCard.locator('img')).toHaveAttribute('src', 'https://blob.test/media-1.webp');
  await expect(addedCard.locator('video')).toBeHidden();
  await expect(addedCard.getByRole('button', { name: 'Replace photo' })).toBeVisible();
  await expect(addedCard.getByRole('button', { name: 'Add video' })).toBeVisible();
  await expect(addedCard.getByRole('button', { name: 'Delete story' })).toBeVisible();

  await addedCard.getByRole('button', { name: 'Replace photo' }).click();
  await addedCard.locator('input[type="file"][accept="image/*"]').setInputFiles(photo);
  await expect(addedCard.locator('img')).toHaveAttribute('src', 'https://blob.test/media-2.webp');
  await addedCard.getByRole('button', { name: 'Add video' }).click();
  await addedCard.locator('input[type="file"][accept="video/*"]').setInputFiles(fixture);
  await expect(page.locator('#admin-status')).toContainText('Video attached');
  await expect(addedCard.getByRole('button', { name: 'Replace video' })).toBeVisible();

  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  const galleryEntry = api.getContent().entries['#work-gallery-items-v1'];
  expect(galleryEntry.type).toBe('text');
  const savedStories = JSON.parse(Buffer.from(galleryEntry.value, 'base64').toString('utf8'));
  expect(savedStories).toHaveLength(1);
  expect(savedStories[0]).toMatchObject({
    title: 'A new family celebration',
    category: 'celebration',
    description: 'A personal story with family and friends.',
    imageUrl: 'https://blob.test/media-2.webp',
    videoUrl: 'https://media.example.com/evr-videos/test-video.mp4'
  });

  await page.reload();
  await page.locator('#admin-preview-page').selectOption('work');
  const reloadedCard = page.locator('#work .story-library .admin-managed-work-item');
  await expect(reloadedCard).toContainText('A new family celebration');
  await expect(reloadedCard.getByRole('button', { name: 'Replace photo' })).toBeVisible();
  await expect(reloadedCard.getByRole('button', { name: 'Replace video' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await reloadedCard.getByRole('button', { name: 'Delete story' }).click();
  await expect(reloadedCard).toHaveCount(0);
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  const finalGalleryEntry = api.getContent().entries['#work-gallery-items-v1'];
  expect(JSON.parse(Buffer.from(finalGalleryEntry.value, 'base64').toString('utf8'))).toEqual([]);
  await page.reload();
  await page.locator('#admin-preview-page').selectOption('work');
  await expect(page.locator('#work .story-library .admin-managed-work-item')).toHaveCount(0);
  await expect(page.locator('#work [data-filter="birthday"]')).toContainText('Birthdays');
});

test('admin can create and publish a custom Work category', async ({ page }) => {
  const api = await mockAdminApi(page);
  const photo = path.resolve(__dirname, '..', 'assets', 'process-cards', 'process-card-01-your-moments.png');
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('work');
  await page.locator('#work .admin-add-work-card').click();

  await page.locator('#admin-work-new-category').fill('Baby shower');
  await page.locator('#admin-work-add-category').click();
  await expect(page.locator('#admin-work-category')).toHaveValue('baby-shower');
  await expect(page.locator('#admin-work-dialog-status')).toContainText('Baby shower added');
  await page.locator('input[name="admin-work-media-type"][value="image"]').check();
  await page.locator('#admin-work-image').setInputFiles(photo);
  await page.locator('#admin-work-title').fill('A new beginning');
  await page.locator('#admin-work-description').fill('A family celebration welcoming a little one.');
  await page.locator('#admin-work-controls button[type="submit"]').click();

  const story = page.locator('#work .admin-managed-work-item[data-category="baby-shower"]');
  await expect(story).toContainText('A new beginning');
  await expect(page.locator('#work [data-filter="baby-shower"]')).toBeVisible();
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(JSON.parse(api.getContent().entries['#work-gallery-categories-v1'].value)).toContainEqual({
    slug: 'baby-shower',
    label: 'Baby shower'
  });

  await page.reload();
  await page.locator('#admin-preview-page').selectOption('work');
  await page.locator('#work [data-filter="baby-shower"]').click();
  await expect(page.locator('#work .admin-managed-work-item[data-category="baby-shower"]')).toBeVisible();
});

test('admin can manage EVR Brand Studio work, add categories, and delete gallery items', async ({ page }) => {
  const api = await mockAdminApi(page);
  const photo = path.resolve(__dirname, '..', 'assets', 'process-cards', 'process-card-01-your-moments.png');
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function() {
      this.dataset.playCount = String(Number(this.dataset.playCount || 0) + 1);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function() {
      this.dataset.pauseCount = String(Number(this.dataset.pauseCount || 0) + 1);
    };
  });
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('brand-work');
  const addStory = page.locator('#brand-work .admin-add-work-card');
  await expect(addStory).toBeVisible();
  const existingStory = page.locator('#brand-work article[data-category="event"]').first();
  page.once('dialog', dialog => dialog.accept());
  await clickContextualMediaAction(
    page,
    '#brand-work article[data-category="event"] .story-cover img',
    'Delete story'
  );
  await expect(existingStory).toBeHidden();
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(JSON.parse(api.getContent().entries['#brand-work-gallery-hidden-cards-v1'].value))
    .toContain('portfolio:brand-work:corporate-event-detail');

  await addStory.click();
  await expect(page.locator('#admin-work-dialog-title')).toHaveText('Add an EVR Brand Studio story.');
  await expect(page.locator('#admin-work-category option')).toHaveText(['Events', 'Healthcare']);

  await page.locator('#admin-work-new-category').fill('Campaigns');
  await page.locator('#admin-work-add-category').click();
  await page.locator('#admin-work-title').fill('A new brand campaign');
  await page.locator('#admin-work-description').fill('A concise campaign film for a product launch.');
  await page.locator('input[name="admin-work-media-type"][value="image"]').check();
  await page.locator('#admin-work-image').setInputFiles(photo);
  await page.locator('#admin-work-controls button[type="submit"]').click();

  const imageCard = page.locator('#brand-work .admin-managed-work-item[data-category="campaigns"]');
  await expect(imageCard).toContainText('A new brand campaign');
  await expect(page.locator('#brand-work [data-filter="campaigns"]')).toBeVisible();
  await expect(imageCard.getByRole('button', { name: 'Delete story' })).toBeVisible();

  await page.locator('#brand-work .admin-add-work-card').click();
  await page.locator('#admin-work-category').selectOption('healthcare');
  await page.locator('#admin-work-title').fill('A new healthcare film');
  await page.locator('#admin-work-description').fill('An expert-led healthcare explainer.');
  await page.locator('input[name="admin-work-media-type"][value="video"]').check();
  await page.locator('#admin-work-video').setInputFiles(fixture);
  await page.locator('#admin-work-controls button[type="submit"]').click();

  const videoCard = page.locator('#brand-work .admin-managed-work-item[data-category="healthcare"]');
  const addedVideo = videoCard.locator('video');
  await expect(videoCard).toContainText('A new healthcare film');
  await expect(addedVideo).toHaveAttribute('data-viewport-autoplay', 'true');
  expect(await addedVideo.evaluate(video => video.autoplay)).toBe(false);
  const pausesBeforeLeaving = Number(await addedVideo.getAttribute('data-pause-count') || 0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => addedVideo.evaluate(video => Number(video.dataset.pauseCount || 0)))
    .toBeGreaterThan(pausesBeforeLeaving);
  const playsBeforeEntering = Number(await addedVideo.getAttribute('data-play-count') || 0);
  await addedVideo.scrollIntoViewIfNeeded();
  await expect.poll(() => addedVideo.evaluate(video => Number(video.dataset.playCount || 0)))
    .toBeGreaterThan(playsBeforeEntering);

  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  const entries = api.getContent().entries;
  expect(JSON.parse(Buffer.from(entries['#brand-work-gallery-items-v1'].value, 'base64').toString('utf8')))
    .toHaveLength(2);
  expect(JSON.parse(entries['#brand-work-gallery-categories-v1'].value)).toContainEqual({
    slug: 'campaigns',
    label: 'Campaigns'
  });
  expect(entries).not.toHaveProperty('#work-gallery-items-v1');

  await page.reload();
  await page.locator('#admin-preview-page').selectOption('brand-work');
  await page.locator('#brand-work [data-filter="campaigns"]').click();
  const reloadedImage = page.locator('#brand-work .admin-managed-work-item[data-category="campaigns"]');
  await expect(reloadedImage).toContainText('A new brand campaign');
  page.once('dialog', dialog => dialog.accept());
  await reloadedImage.getByRole('button', { name: 'Delete story' }).click();
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(JSON.parse(Buffer.from(api.getContent().entries['#brand-work-gallery-items-v1'].value, 'base64').toString('utf8')))
    .toHaveLength(1);
});

test('admin can add a video to a photo-only Work story later', async ({ page }) => {
  const api = await mockAdminApi(page);
  const photo = path.resolve(__dirname, '..', 'assets', 'process-cards', 'process-card-01-your-moments.png');
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('work');
  await page.locator('#work .admin-add-work-card').click();
  await page.locator('#admin-work-title').fill('A photo-first story');
  await page.locator('#admin-work-category').selectOption('wedding');
  await page.locator('#admin-work-description').fill('A new story with a video added later.');
  await page.locator('input[name="admin-work-media-type"][value="image"]').check();
  await page.locator('#admin-work-image').setInputFiles(photo);
  await page.locator('#admin-work-controls button[type="submit"]').click();
  await expect(page.locator('#admin-status')).toContainText('Story uploaded');
  const photoStory = page.locator('#work .admin-managed-work-item').filter({ hasText: 'A photo-first story' });
  await photoStory.getByRole('button', { name: 'Add video' }).click();
  await photoStory.locator('input[type="file"][accept="video/*"]').setInputFiles(fixture);
  await expect(page.locator('#admin-status')).toContainText('Video attached');
  await expect(photoStory.locator('img')).toBeVisible();
  await expect(photoStory.locator('video')).toBeHidden();
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  const galleryEntry = api.getContent().entries['#work-gallery-items-v1'];
  const savedStories = JSON.parse(Buffer.from(galleryEntry.value, 'base64').toString('utf8'));
  expect(savedStories.find(story => story.title === 'A photo-first story').videoUrl)
    .toBe('https://media.example.com/evr-videos/test-video.mp4');
});

test('admin can add and publish a video-only Work story', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('work');
  await page.locator('#work .admin-add-work-card').click();
  await page.locator('#admin-work-title').fill('A film-only story');
  await page.locator('#admin-work-category').selectOption('celebration');
  await page.locator('#admin-work-description').fill('A celebration captured on video.');
  await page.locator('input[name="admin-work-media-type"][value="video"]').check();
  await expect(page.locator('#admin-work-video-upload')).toBeVisible();
  await expect(page.locator('#admin-work-image-upload')).toBeHidden();
  expect(await page.locator('#admin-work-video').evaluate(input => input.required)).toBe(true);
  expect(await page.locator('#admin-work-image').evaluate(input => input.required)).toBe(false);
  await page.locator('#admin-work-video').setInputFiles(fixture);
  await page.locator('#admin-work-controls button[type="submit"]').click();
  await expect(page.locator('#admin-status')).toContainText('Story uploaded');

  const videoStory = page.locator('#work .admin-managed-work-item').filter({ hasText: 'A film-only story' });
  await expect(videoStory.locator('img')).toBeHidden();
  await expect(videoStory.locator('video')).toHaveAttribute('src', 'https://media.example.com/evr-videos/test-video.mp4');
  await expect(videoStory.getByRole('button', { name: 'Remove video' })).toHaveCount(0);
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');

  const galleryEntry = api.getContent().entries['#work-gallery-items-v1'];
  const savedStories = JSON.parse(Buffer.from(galleryEntry.value, 'base64').toString('utf8'));
  expect(savedStories.find(story => story.title === 'A film-only story')).toMatchObject({
    imageUrl: '',
    videoUrl: 'https://media.example.com/evr-videos/test-video.mp4'
  });
  await page.reload();
  await page.locator('#admin-preview-page').selectOption('work');
  const reloadedVideoStory = page.locator('#work .admin-managed-work-item').filter({ hasText: 'A film-only story' });
  await expect(reloadedVideoStory.locator('img')).toBeHidden();
  await expect(reloadedVideoStory.locator('video')).toHaveAttribute('src', 'https://media.example.com/evr-videos/test-video.mp4');
});

test('admin can optionally upload a cover with a new video story', async ({ page }) => {
  const api = await mockAdminApi(page);
  const photo = path.resolve(__dirname, '..', 'assets', 'process-cards', 'process-card-01-your-moments.png');
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('work');
  await page.locator('#work .admin-add-work-card').click();
  await page.locator('#admin-work-title').fill('A video with a cover');
  await page.locator('#admin-work-category').selectOption('celebration');
  await page.locator('#admin-work-description').fill('A video story with an optional cover image.');
  await page.locator('input[name="admin-work-media-type"][value="video"]').check();
  await expect(page.locator('#admin-work-cover-upload')).toBeVisible();
  expect(await page.locator('#admin-work-cover').evaluate(input => input.required)).toBe(false);
  await page.locator('#admin-work-video').setInputFiles(fixture);
  await page.locator('#admin-work-cover').setInputFiles(photo);
  await page.locator('#admin-work-controls button[type="submit"]').click();

  const story = page.locator('#work .admin-managed-work-item').filter({ hasText: 'A video with a cover' });
  await expect(story.locator('img')).toHaveAttribute('src', 'https://blob.test/media-1.webp');
  await expect(story.locator('video')).toHaveJSProperty('poster', 'https://blob.test/media-1.webp');
  await story.locator('video').evaluate(video => video.dispatchEvent(new Event('error')));
  await expect(story.locator('img')).toBeVisible();
  await expect(story.locator('video')).toBeHidden();
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  const savedStories = JSON.parse(Buffer.from(
    api.getContent().entries['#work-gallery-items-v1'].value,
    'base64'
  ).toString('utf8'));
  expect(savedStories.find(item => item.title === 'A video with a cover')).toMatchObject({
    imageUrl: 'https://blob.test/media-1.webp',
    videoUrl: 'https://media.example.com/evr-videos/test-video.mp4'
  });
});

test('admin can replace a managed story cover, replace or remove its video, and delete the story', async ({ page }) => {
  const story = {
    id: 'managed-story-1',
    title: 'A family celebration',
    category: 'celebration',
    description: 'A story shared with family and friends.',
    imageUrl: 'https://blob.test/original-cover.webp',
    videoUrl: 'https://media.example.com/evr-videos/original-video.mp4'
  };
  const initialContent = {
    version: 1,
    entries: {
      '#work-gallery-items-v1': {
        type: 'text',
        value: Buffer.from(JSON.stringify([story]), 'utf8').toString('base64')
      }
    }
  };
  const api = await mockAdminApi(page, initialContent);
  const photo = path.resolve(__dirname, '..', 'assets', 'process-cards', 'process-card-01-your-moments.png');
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('work');

  const card = page.locator('#work .admin-managed-work-item[data-admin-managed-work-item="managed-story-1"]');
  await expect(card).toContainText('A family celebration');
  await card.getByRole('button', { name: 'Replace cover' }).click();
  await expect(card.getByRole('button', { name: 'Replace cover' })).toHaveText('');
  await card.locator('input[type="file"][accept="image/*"]').setInputFiles(photo);
  await expect(card.locator('img')).toHaveAttribute('src', 'https://blob.test/media-1.webp');
  await expect(card.getByRole('button', { name: 'Revert cover' })).toBeVisible();
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');

  let savedGallery = JSON.parse(Buffer.from(
    api.getContent().entries['#work-gallery-items-v1'].value,
    'base64'
  ).toString('utf8'));
  expect(savedGallery[0].imageUrl).toBe('https://blob.test/media-1.webp');
  expect(savedGallery[0].imageRevertUrl).toBe('https://blob.test/original-cover.webp');

  await page.reload();
  await page.locator('#admin-preview-page').selectOption('work');
  await expect(card.locator('img')).toHaveAttribute('src', 'https://blob.test/media-1.webp');
  await card.getByRole('button', { name: 'Revert cover' }).click();
  await expect(card.locator('img')).toHaveAttribute('src', 'https://blob.test/original-cover.webp');
  await expect(card.getByRole('button', { name: 'Revert cover' })).toHaveCount(0);
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  savedGallery = JSON.parse(Buffer.from(
    api.getContent().entries['#work-gallery-items-v1'].value,
    'base64'
  ).toString('utf8'));
  expect(savedGallery[0].imageUrl).toBe('https://blob.test/original-cover.webp');
  expect(savedGallery[0].imageRevertUrl).toBeUndefined();

  await card.getByRole('button', { name: 'Replace video' }).click();
  await card.locator('input[type="file"][accept="video/*"]').setInputFiles(fixture);
  await expect(card.locator('video')).toHaveAttribute('src', 'https://media.example.com/evr-videos/test-video.mp4');
  await expect(card.getByRole('button', { name: 'Replace video' })).toHaveText('');
  await expect(card.getByRole('button', { name: 'Revert video' })).toBeVisible();
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');

  await page.reload();
  await page.locator('#admin-preview-page').selectOption('work');
  await expect(card.getByRole('button', { name: 'Revert video' })).toBeVisible();
  await card.getByRole('button', { name: 'Revert video' }).click();
  await expect(card.locator('video')).toHaveAttribute('src', 'https://media.example.com/evr-videos/original-video.mp4');
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');

  await expect(card.getByRole('button', { name: 'Remove video' })).toHaveText('');
  await card.getByRole('button', { name: 'Remove video' }).click();
  await expect(card.locator('video')).toBeHidden();
  await expect(card.getByRole('button', { name: 'Remove video' })).toHaveCount(0);
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');

  await page.reload();
  await page.locator('#admin-preview-page').selectOption('work');
  await expect(card.locator('video')).toBeHidden();
  savedGallery = JSON.parse(Buffer.from(
    api.getContent().entries['#work-gallery-items-v1'].value,
    'base64'
  ).toString('utf8'));
  expect(savedGallery[0].videoUrl).toBe('');

  page.once('dialog', dialog => dialog.accept());
  await expect(card.getByRole('button', { name: 'Delete story' })).toHaveText('');
  await card.getByRole('button', { name: 'Delete story' }).click();
  await expect(card).toHaveCount(0);
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  savedGallery = JSON.parse(Buffer.from(
    api.getContent().entries['#work-gallery-items-v1'].value,
    'base64'
  ).toString('utf8'));
  expect(savedGallery).toEqual([]);

  await page.reload();
  await page.locator('#admin-preview-page').selectOption('work');
  await expect(page.locator('#work .admin-managed-work-item')).toHaveCount(0);
});

test('Work admin has contextual media guidance and an Add a story shortcut', async ({ page }) => {
  await mockAdminApi(page);
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('work');

  const addStory = page.locator('#work .admin-add-work-card');
  await expect(addStory).toBeVisible();
  const videoActions = page.locator('.admin-media-actions .admin-icon-button[aria-label="Replace video"]');
  await expect(videoActions.first()).toHaveAttribute('title', /MP4.*max 1 GB/);
  await expect(videoActions.first()).toHaveText('');
  expect(await videoActions.count()).toBeGreaterThan(0);

  await page.locator('#work [data-filter="celebration"]').click();
  await expect(page.locator('#work [data-filter="celebration"]')).toHaveClass(/active/);
  await page.setViewportSize({ width: 390, height: 844 });
  await addStory.click();
  await expect(page.locator('#work [data-filter="all"]')).toHaveClass(/active/);
  await expect(page.locator('#admin-work-dialog')).toBeVisible();
  await expect(page.locator('input[name="admin-work-media-type"][value="image"]')).toBeFocused();
  const dialogBounds = await page.locator('#admin-work-dialog').boundingBox();
  expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(390);
  expect(dialogBounds.y).toBeGreaterThanOrEqual(0);
});

test('hidden homepage image slots do not show contextual replace-photo icons', async ({ page }) => {
  await mockAdminApi(page);
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('home');

  const hiddenCards = page.locator('#home .scene-card[data-card="3"], #home .scene-card[data-card="4"], #home .scene-card[data-card="5"]');
  await expect(hiddenCards).toHaveCount(3);
  const hiddenCardControls = await page.evaluate(() => {
    const hiddenCards = new Set(document.querySelectorAll(
      '#home .scene-card[data-card="3"], #home .scene-card[data-card="4"], #home .scene-card[data-card="5"]'
    ));
    return Array.from(document.querySelectorAll('.admin-media-actions')).filter(panel =>
      hiddenCards.has(panel._mediaRoot)
    ).length;
  });
  expect(hiddenCardControls).toBe(0);
});

test('admin can delete a built-in Work card and keep it hidden after reload', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('work');

  const card = page.locator('#work .story-library > article:not(.admin-managed-work-item)').first();
  await card.scrollIntoViewIfNeeded();
  const slot = await card.locator('.preview-media').evaluate(media =>
    media.dataset.r2Slot ? `portfolio:${media.dataset.r2Slot}` : `portfolio:${media.dataset.portfolioSlot}`
  );
  let actions = page.locator('.admin-media-actions:visible').filter({
    has: page.getByRole('button', { name: 'Delete story' })
  }).first();
  await expect(actions.getByRole('button', { name: 'Replace video' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Replace photo' })).toHaveCount(0);
  await expect(actions.getByRole('button', { name: 'Delete story' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await actions.getByRole('button', { name: 'Delete story' }).click();
  await expect(card).toBeHidden();

  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(api.getContent().entries['#work-gallery-hidden-cards-v1'].value).toContain(slot);

  await page.reload();
  await page.locator('#admin-preview-page').selectOption('work');
  await expect(page.locator('#work .story-library > article').first()).toBeHidden();
});

test('admin can reposition each photo in the final phone mockup screen and keep the crop after reload', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('home');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.locator('#home [data-process-step="4"]').click();
  await expect(page.locator('#process-story')).toHaveAttribute('data-step', '4');

  const controls = page.locator('.admin-media-actions[data-gallery-image-controls="true"]');
  await expect(controls).toHaveCount(4);
  const firstImage = page.locator('#home [data-phone-screen="4"] .phone-gallery img').first();
  await controls.first().getByRole('button', { name: 'Reposition photo' }).click();
  const positionDialog = page.locator('#admin-position-dialog');
  const positionPreview = positionDialog.locator('#admin-position-preview');
  await expect(positionDialog).toBeVisible();
  await expect(positionPreview).toBeVisible();
  await expect(positionPreview).toHaveCSS('object-position', '50% 50%');
  await positionDialog.getByRole('button', { name: 'Move photo right' }).click();
  await positionDialog.getByRole('button', { name: 'Move photo up' }).click();
  await expect(firstImage).toHaveCSS('object-position', '40% 60%');
  await expect(positionPreview).toHaveCSS('object-position', '40% 60%');
  await positionDialog.getByRole('button', { name: 'Move photo left' }).click();
  await positionDialog.getByRole('button', { name: 'Move photo down' }).click();
  await expect(firstImage).toHaveCSS('object-position', '50% 50%');
  await expect(positionPreview).toHaveCSS('object-position', '50% 50%');
  await positionDialog.getByRole('button', { name: 'Move photo right' }).click();
  await expect(firstImage).toHaveCSS('object-position', '40% 50%');
  await positionDialog.getByRole('button', { name: 'Done' }).click();
  await expect(positionPreview).not.toHaveAttribute('src');

  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  const positionEntry = Object.entries(api.getContent().entries).find(([key]) =>
    key.startsWith('#phone-gallery-image-position-v1:')
  );
  expect(positionEntry).toBeTruthy();
  expect(JSON.parse(positionEntry[1].value)).toEqual({ x: 40, y: 50 });

  await page.reload();
  await page.locator('#admin-preview-page').selectOption('home');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.locator('#home [data-process-step="4"]').click();
  await expect(page.locator('#process-story')).toHaveAttribute('data-step', '4');
  await expect(page.locator('#home [data-phone-screen="4"] .phone-gallery img').first())
    .toHaveCSS('object-position', '40% 50%');
});
