const { test, expect } = require('@playwright/test');
const { mockAdminApi } = require('./admin-api-mock');

test('previous browser-only edits can be migrated to shared content', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('legacy-content-seeded')) return;
    localStorage.setItem('evr-site-content', JSON.stringify({
      version: 1,
      entries: { '#home/h1:0/em:0': { type: 'text', value: 'Migrated shared edit' } }
    }));
    sessionStorage.setItem('legacy-content-seeded', 'true');
  });
  await page.goto('/#/admin');
  await expect(page.locator('#admin-migrate-local')).toBeVisible();

  const reload = page.waitForEvent('load');
  await page.locator('#admin-migrate-local').click();
  await reload;

  expect(Object.values(api.getContent().entries)).toContainEqual({ type: 'text', value: 'Migrated shared edit' });
  await expect(page.locator('#admin-status')).toContainText('Shared website content loaded');
  await expect(page.locator('#admin-migrate-local')).toBeHidden();
  await expect(page.evaluate(() => localStorage.getItem('evr-site-content'))).resolves.toBeNull();
});
