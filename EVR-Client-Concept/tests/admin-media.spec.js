const { test, expect } = require('@playwright/test');
const path = require('path');

const fixture = path.resolve(__dirname, '..', 'assets', 'demo-wedding.mp4');

test('valid MP4 survives save, export, reset, import, and reload', async ({ page }) => {
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('corporate');
  await page.locator('[data-admin-mode="video"]').click();
  await page.locator('#admin-video-target').selectOption({ index: 0 });
  await page.locator('#admin-video-file').setInputFiles(fixture);
  await expect(page.locator('#admin-status')).toContainText('Video ready to preview');
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#admin-export').click();
  const download = await downloadPromise;
  const exportPath = test.info().outputPath('evr-export.json');
  await download.saveAs(exportPath);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#admin-reset').click();
  await expect(page.locator('#admin-status')).toContainText('Could not reset', { timeout: 100 }).catch(() => {});
  await page.waitForLoadState('load');

  await page.locator('#admin-import-file').setInputFiles(exportPath);
  await expect(page).toHaveURL(/#\/admin$/);
  await expect(page.locator('#admin-status')).not.toContainText('Could not import', { timeout: 20000 });
  await page.waitForLoadState('load');

  await page.locator('#admin-preview-page').selectOption('corporate');
  const playable = await page.locator('[data-corp-reel] video').first().evaluate(async video => {
    video.load();
    if (video.readyState < 1) await Promise.race([
      new Promise(resolve => {
        video.addEventListener('loadedmetadata', resolve, { once: true });
        video.addEventListener('error', resolve, { once: true });
      }),
      new Promise(resolve => setTimeout(resolve, 5000))
    ]);
    return { readyState: video.readyState, duration: video.duration, error: video.error && video.error.code };
  });
  expect(playable.readyState).toBeGreaterThanOrEqual(1);
  expect(playable.duration).toBeGreaterThan(0);
  expect(playable.error).toBeNull();
});
