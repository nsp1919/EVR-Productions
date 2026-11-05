const { test, expect } = require('@playwright/test');
const { mockAdminApi } = require('./admin-api-mock');

test('admin route opens a photography sign-in and only reveals editing after email verification', async ({ page }) => {
  await mockAdminApi(page, { version: 1, entries: {} }, false);
  await page.goto('/#/admin');

  await expect(page.locator('#admin-login-screen')).toBeVisible();
  await expect(page.locator('#admin-login')).toBeVisible();
  await expect(page.locator('.admin-login-photo img')).toHaveCount(3);
  await expect(page.locator('.admin-login-photo-one img')).toHaveAttribute('src', 'assets/admin-login-photo-1.webp');
  await expect(page.locator('.admin-login-photo-two img')).toHaveAttribute('src', 'assets/admin-login-photo-2.webp');
  await expect(page.locator('.admin-login-photo-three img')).toHaveAttribute('src', 'assets/admin-login-photo-3.webp');
  await expect(page.locator('.admin-login-photo-three figcaption')).toHaveText('THE PHOTOGRAPHER');
  await expect.poll(() => page.locator('.admin-login-photo img').evaluateAll(images =>
    images.every(image => image.complete && image.naturalWidth > 0)
  )).toBe(true);
  await expect(page.locator('footer.site-footer')).toBeHidden();
  await expect(page.locator('.site-credit')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/admin-locked/);
  await expect(page.locator('html')).not.toHaveClass(/admin-route-pending/);
  await expect(page.locator('body > header')).toBeHidden();
  await expect(page.locator('#home')).toBeHidden();
  await expect(page.locator('#work')).toBeHidden();
  await expect(page.locator('.admin-controls')).toBeHidden();
  await page.locator('#admin-email').fill('admin@example.com');
  await page.locator('#admin-request-code').click();
  await expect(page.locator('#admin-code')).toBeVisible();
  await page.locator('#admin-code').fill('12345678');
  await page.locator('#admin-login button[type="submit"]').click();

  await expect(page.locator('.admin-controls')).toBeVisible();
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#admin-login-screen')).toBeHidden();
  await expect(page.locator('body > header')).toBeVisible();
  await page.locator('#admin-settings-open').click();
  await page.locator('#admin-logout').click();
  await expect(page.locator('#admin-login-screen')).toBeVisible();
  await expect(page.locator('#admin-login')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/admin-locked/);
  await expect(page.locator('body > header')).toBeHidden();
  await expect(page.locator('#home')).toBeHidden();
  await expect(page.locator('.admin-controls')).toBeHidden();
});

test('refreshing the locked admin route keeps the site and footer hidden', async ({ page }) => {
  await mockAdminApi(page, { version: 1, entries: {} }, false);
  await page.goto('/#/admin');
  await expect(page.locator('#admin-login-screen')).toBeVisible();
  await page.reload();

  await expect(page.locator('#admin-login-screen')).toBeVisible();
  await expect(page.locator('#home')).toBeHidden();
  await expect(page.locator('#work')).toBeHidden();
  await expect(page.locator('footer.site-footer')).toBeHidden();
  await expect(page.locator('.site-credit')).toBeHidden();
  await expect(page.locator('.admin-controls')).toBeHidden();
});

test('admin route keeps the public site hidden while the session check is pending', async ({ page }) => {
  await page.route('**/api/auth', async route => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    return route.fulfill({ json: { configured: true, authenticated: false } });
  });
  await page.route('**/api/content', route => route.fulfill({ json: { version: 1, entries: {} } }));

  await page.goto('/#/admin', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#admin-login-screen')).toBeVisible();
  await expect(page.locator('#home')).toBeHidden();
  await expect(page.locator('#work')).toBeHidden();
  await expect(page.locator('footer.site-footer')).toBeHidden();
  await expect(page.locator('.site-credit')).toBeHidden();
  await expect(page.locator('.admin-controls')).toBeHidden();
});

test('quotation studio uses the email code sign-in flow', async ({ page }) => {
  await mockAdminApi(page, { version: 1, entries: {} }, false);
  await page.goto('/#/studio');

  await expect(page.locator('#quote-studio-login')).toBeVisible();
  await page.locator('#quote-studio-email').fill('admin@example.com');
  await page.locator('#quote-studio-request-code').click();
  await expect(page.locator('#quote-studio-code')).toBeVisible();
  await page.locator('#quote-studio-code').fill('12345678');
  await page.locator('#quote-studio-login button[type="submit"]').click();

  await expect(page.locator('#quote-studio-app')).toBeVisible();
});
