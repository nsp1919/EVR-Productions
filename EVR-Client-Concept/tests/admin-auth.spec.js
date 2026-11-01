const { test, expect } = require('@playwright/test');
const { mockAdminApi } = require('./admin-api-mock');

test('editor requires sign-in and hides edit controls after signing out', async ({ page }) => {
  await mockAdminApi(page, { version: 1, entries: {} }, false);
  await page.goto('/#/admin');

  await expect(page.locator('#admin-login')).toBeVisible();
  await expect(page.locator('.admin-controls')).toBeHidden();
  await page.locator('#admin-password').fill('admin test password');
  await page.locator('#admin-login button[type="submit"]').click();

  await expect(page.locator('.admin-controls')).toBeVisible();
  await page.locator('#admin-settings-open').click();
  await page.locator('#admin-logout').click();
  await expect(page.locator('#admin-login')).toBeVisible();
  await expect(page.locator('.admin-controls')).toBeHidden();
});
