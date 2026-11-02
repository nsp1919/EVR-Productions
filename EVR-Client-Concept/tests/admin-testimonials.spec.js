const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { mockAdminApi } = require('./admin-api-mock');
const { clickContextualMediaAction } = require('./admin-media-helpers');

const fixture = path.resolve(__dirname, '..', 'assets', 'demo-wedding.mp4');

test('admin can save testimonial text and an optional R2 video on the same review', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.route('https://media.example.com/**', route => route.fulfill({
    body: fs.readFileSync(fixture),
    headers: { 'access-control-allow-origin': '*', 'content-type': 'video/mp4' }
  }));
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('home');

  const quote = page.locator('#home .voice-grid article').first().locator('blockquote');
  await page.locator('[data-admin-mode="text"]').click();
  await quote.click();
  await expect(quote).toHaveAttribute('contenteditable', 'true');
  await quote.fill('Our edited testimonial text.');
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(Object.values(api.getContent().entries).some(entry =>
    entry.type === 'text' && entry.value.includes('Our edited testimonial text.')
  )).toBe(true);

  await clickContextualMediaAction(page, '#home .voice-grid article:first-child', 'Replace video');
  await page.locator('#admin-video-file').setInputFiles(fixture);
  await expect(page.locator('#admin-status')).toContainText('Video uploaded to Cloudflare R2');
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(Object.values(api.getContent().entries).some(entry =>
    entry.type === 'video' && entry.value === 'https://media.example.com/evr-videos/test-video.mp4'
  )).toBe(true);

  await page.goto('/#/home');
  await expect(quote).toHaveText('Our edited testimonial text.');
  const video = page.locator('#home .voice-grid article').first().locator('video');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('src', 'https://media.example.com/evr-videos/test-video.mp4');
});
