'use strict';

const { test, expect } = require('@playwright/test');

async function mockQuoteAuth(page) {
  let authenticated = false;
  await page.route('**/api/auth', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({ json: { configured: true, authenticated } });
    }
    const body = request.postDataJSON();
    if (body.action === 'logout') {
      authenticated = false;
      return route.fulfill({ json: { authenticated } });
    }
    authenticated = body.action === 'login' && body.password === 'test-only-password';
    return route.fulfill({
      status: authenticated ? 200 : 401,
      json: authenticated ? { authenticated } : { error: 'The password was not accepted.' }
    });
  });
}

test('quotation studio requires sign-in and creates a priced EVR PDF preview', async ({ page }) => {
  await mockQuoteAuth(page);
  await page.goto('/#/studio');

  await expect(page.locator('#quote-studio-login')).toBeVisible();
  await expect(page.locator('#quote-studio-app')).toBeHidden();
  await page.locator('#quote-studio-password').fill('test-only-password');
  await page.locator('#quote-studio-login button[type="submit"]').click();
  await expect(page.locator('#quote-studio-app')).toBeVisible();

  await page.locator('.quote-settings summary').click();
  await page.locator('[data-rate-key="wedding:crew:traditional-photo"]').fill('12500');
  await page.locator('#quote-reviewed').check();
  await page.locator('#quote-save-settings').click();

  await page.locator('#quote-client').fill('Asha Rao');
  await page.locator('#quote-project').fill('Wedding coverage');
  await page.locator('#quote-event-choices label').filter({ hasText: 'Engagement' }).locator('input').check();
  await page.getByLabel('Engagement, day 1, Traditional photographer / day quantity').fill('2');

  await expect(page.locator('#quote-subtotal')).toHaveText('INR 25,000.00');
  await expect(page.locator('#quote-preview')).toBeEnabled();
  await page.locator('#quote-preview').click();

  await expect(page.locator('#quote-print-dialog')).toBeVisible();
  await expect(page.locator('#print-client')).toHaveText('Asha Rao');
  await expect(page.locator('#print-project')).toHaveText('Wedding coverage');
  await expect(page.locator('#print-rows')).toContainText('INR 25,000.00');
  await expect(page.locator('#print-terms')).toContainText('EVR Productions');
});

test('quotation studio rejects a wrong password', async ({ page }) => {
  await mockQuoteAuth(page);
  await page.goto('/#/studio');
  await page.locator('#quote-studio-password').fill('wrong-password');
  await page.locator('#quote-studio-login button[type="submit"]').click();

  await expect(page.locator('#quote-studio-login-status')).toContainText('not accepted');
  await expect(page.locator('#quote-studio-app')).toBeHidden();
});

test('standalone EVR quotation file saves approved local rates and previews a quote', async ({ page }) => {
  await page.goto('/EVR-Productions-Quotation-Studio.html');
  await expect(page).toHaveTitle('EVR Productions | Quotation Studio');
  await expect(page.locator('.brand-name')).toContainText('EVR');

  await page.locator('.settings summary').click();
  await page.locator('[data-rate-key="wedding:crew:traditional-photo"]').fill('12500');
  await page.locator('#reviewed').check();
  await page.locator('#save-settings').click();

  await page.locator('#client').fill('Asha Rao');
  await page.locator('#project').fill('Wedding coverage');
  await page.locator('.choice').filter({ hasText: 'Engagement' }).locator('input').check();
  await page.getByLabel('Traditional photographer / day, day 1, quantity').fill('2');

  await expect(page.locator('#total')).toHaveText('INR 25,000.00');
  await expect(page.locator('#preview')).toBeEnabled();
  await page.locator('#save-draft').click();
  await page.locator('#client').fill('');
  await page.locator('#load-draft').click();
  await expect(page.locator('#client')).toHaveValue('Asha Rao');
  await page.locator('#preview').click();

  await expect(page.locator('#print-dialog')).toBeVisible();
  await expect(page.locator('#print-client')).toHaveText('Asha Rao');
  await expect(page.locator('#print-rows')).toContainText('INR 25,000.00');
  await expect(page.locator('#print-terms')).toContainText('EVR Productions');
});
