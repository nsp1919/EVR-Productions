const { test, expect } = require('@playwright/test');

test('corrupt video MIME content is rejected', async ({ page }) => {
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('home');
  await page.locator('[data-admin-mode="video"]').click();
  await page.locator('#admin-video-target').selectOption({ index: 0 });
  await page.locator('#admin-video-file').setInputFiles({
    name: 'invalid.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('not playable video data')
  });
  await expect(page.locator('#admin-status')).toContainText('Could not prepare this video', { timeout: 20000 });
});

test('malformed import is non-destructive', async ({ page }) => {
  await page.goto('/#/admin');
  await page.evaluate(() => localStorage.setItem('evr-site-content', JSON.stringify({ version: 1, entries: {
    'home-heading': { type: 'text', value: 'Keep this edit' }
  } })));
  await page.reload();
  await page.locator('#admin-import-file').setInputFiles({
    name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"entries":')
  });
  await expect(page.locator('#admin-status')).toContainText('Could not import this file');
  const saved = await page.evaluate(() => localStorage.getItem('evr-site-content'));
  expect(saved).toContain('Keep this edit');
  await page.evaluate(() => localStorage.removeItem('evr-site-content'));
});
