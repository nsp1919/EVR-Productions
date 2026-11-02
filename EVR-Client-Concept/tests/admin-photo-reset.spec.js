const { test, expect } = require('@playwright/test');
const path = require('path');
const { mockAdminApi } = require('./admin-api-mock');
const { clickFirstContextualMediaAction } = require('./admin-media-helpers');

const photoFixture = path.resolve(__dirname, '..', 'assets', 'demo-wedding-poster.png');

test('photo replacement persists and reset restores defaults', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('home');
  await clickFirstContextualMediaAction(page, 'Replace photo');
  await page.locator('#admin-photo-file').setInputFiles(photoFixture);
  await expect(page.locator('#admin-status')).toContainText('Photo uploaded');
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');

  expect(Object.values(api.getContent().entries).some(entry => entry.type === 'image' && entry.value.startsWith('https://blob.test/'))).toBe(true);

  page.once('dialog', dialog => dialog.accept());
  const reloadPromise = page.waitForEvent('load');
  await page.locator('#admin-reset').click();
  await reloadPromise;
  expect(api.getContent().entries).toEqual({});
  const storedCount = await page.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('evr-site-content-assets', 1);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction('videos').objectStore('videos').count();
      request.onsuccess = () => resolve(request.result);
    };
  }));
  expect(storedCount).toBe(0);
});
