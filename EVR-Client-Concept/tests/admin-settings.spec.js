const { test, expect } = require('@playwright/test');
const { mockAdminApi } = require('./admin-api-mock');

test('settings provides backup, restore access, and a reset to original content', async ({ page }) => {
  const api = await mockAdminApi(page, {
    version: 1,
    entries: { '#home/H1:0/EM:0': { type: 'text', value: 'Shared website edit' } }
  });
  await page.goto('/#/admin');

  const controls = page.locator('.admin-controls');
  const settings = page.locator('#admin-settings');
  await page.locator('#admin-settings-open').click();
  await expect(controls).toBeHidden();
  await expect(settings).toBeVisible();
  await expect(page.locator('#admin-settings-import')).toBeVisible();
  await expect(page.locator('#admin-logout')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#admin-settings-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('evr-site-content.json');
  await expect(page.locator('#admin-settings-status')).toContainText('exported');

  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#admin-settings-import').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{')
  });
  await expect(page.locator('#admin-status')).toContainText('Could not import this file');

  await page.locator('#admin-settings-close').click();
  await expect(controls).toBeVisible();
  await expect(settings).toBeHidden();

  await page.locator('#admin-settings-open').click();
  page.once('dialog', dialog => dialog.accept());
  const reloadPromise = page.waitForEvent('load');
  await page.locator('#admin-settings-reload').click();
  await reloadPromise;
  await expect.poll(() => api.getContent().entries).toEqual({});
});
