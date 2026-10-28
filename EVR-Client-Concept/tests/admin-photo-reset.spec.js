const { test, expect } = require('@playwright/test');
const path = require('path');

const photoFixture = path.resolve(__dirname, '..', 'assets', 'demo-wedding-poster.png');

test('photo replacement persists and reset restores defaults', async ({ page }) => {
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('home');
  await page.locator('[data-admin-mode="image"]').click();
  await page.locator('#admin-image-target').selectOption({ index: 0 });
  await page.locator('#admin-photo-file').setInputFiles(photoFixture);
  await expect(page.locator('#admin-status')).toContainText('Unsaved photo edit');
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');

  const saved = await page.evaluate(() => localStorage.getItem('evr-site-content'));
  expect(saved).toContain('data:image');

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#admin-reset').click();
  await page.waitForLoadState('load');
  await expect(page.evaluate(() => localStorage.getItem('evr-site-content'))).resolves.toBeNull();
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
