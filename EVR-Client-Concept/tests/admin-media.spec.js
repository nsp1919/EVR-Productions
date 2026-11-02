const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { mockAdminApi } = require('./admin-api-mock');
const { clickContextualMediaAction, clickFirstContextualMediaAction } = require('./admin-media-helpers');

const fixture = path.resolve(__dirname, '..', 'assets', 'demo-wedding.mp4');

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
    'Other functions'
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
  await expect(page.locator('#work .admin-managed-work-item video')).toBeVisible();
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
  await card.getByRole('button', { name: 'Replace photo' }).click();
  await expect(card.getByRole('button', { name: 'Replace photo' })).toHaveText('');
  await card.locator('input[type="file"][accept="image/*"]').setInputFiles(photo);
  await expect(card.locator('img')).toHaveAttribute('src', 'https://blob.test/media-1.webp');
  await expect(card.getByRole('button', { name: 'Revert photo' })).toBeVisible();
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
  await card.getByRole('button', { name: 'Revert photo' }).click();
  await expect(card.locator('img')).toHaveAttribute('src', 'https://blob.test/original-cover.webp');
  await expect(card.getByRole('button', { name: 'Revert photo' })).toHaveCount(0);
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
