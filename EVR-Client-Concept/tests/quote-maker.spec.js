'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

test('direct /quote route opens the authenticated shareable quote maker', async ({ page }) => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8'));
  expect(vercelConfig.rewrites).toContainEqual({ source: '/quote', destination: '/quote-maker.html' });

  await mockQuotePasscode(page);
  await page.route('**/quote', route => route.fulfill({
    path: path.join(__dirname, '..', 'quote-maker.html'),
    contentType: 'text/html'
  }));
  await page.goto('/quote');

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
  await expect(page.locator('.quote-auth-gate')).toBeVisible();
  await expect(page.locator('#qclient')).toBeHidden();
  await page.locator('#quote-auth-passcode').fill('valid-test-passcode');
  await page.locator('#quote-auth-submit').click();

  await expect(page.locator('.quote-auth-gate')).toBeHidden();
  await expect(page.locator('#qclient')).toBeVisible();
  await expect(page.locator('#generateQuote')).toBeVisible();
  await expect(page.locator('#quoteLinkResult')).toBeHidden();

  const quoteId = 'a'.repeat(48);
  let savedAction;
  await page.route('**/api/quote-maker/quotes', async route => {
    savedAction = route.request().postDataJSON().action;
    await route.fulfill({
      json: {
        url: `https://www.evrproductions.in/quotes/${quoteId}`,
        proposalUrl: `https://www.evrproductions.in/proposals/${quoteId}`
      }
    });
  });
  await page.evaluate(() => { window.createQuotationPDF = async () => new Blob(); });
  await page.locator('#qclient').fill('Asha Rao');
  await page.locator('#evGrid label').filter({ hasText: 'Engagement' }).click();
  await page.locator('#generateQuote').click();

  await expect(page.locator('#quoteLinkResult')).toBeVisible();
  await expect(page.locator('#quoteLink')).toHaveValue(`https://www.evrproductions.in/quotes/${quoteId}`);
  await expect(page.locator('#proposalQuoteLink')).toHaveValue(`https://www.evrproductions.in/proposals/${quoteId}`);
  expect(savedAction).toBe('create');
});

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
    if (body.action === 'request-code') {
      return route.fulfill({ json: { message: 'A sign-in code has been sent.' } });
    }
    authenticated = body.action === 'verify-code' && body.code === '12345678';
    return route.fulfill({
      status: authenticated ? 200 : 401,
      json: authenticated ? { authenticated } : { error: 'That code is invalid or expired.' }
    });
  });
}

async function mockQuotePasscode(page) {
  let authenticated = false;
  await page.route('**/api/quote-maker/access', async route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { configured: true, authenticated } });
    }
    const body = route.request().postDataJSON();
    authenticated = body.action === 'verify' && body.passcode === 'valid-test-passcode';
    return route.fulfill({
      status: authenticated ? 200 : 401,
      json: authenticated ? { authenticated } : { error: 'That passcode is incorrect. Try again.' }
    });
  });
}

test('quotation studio requires sign-in and creates a priced EVR PDF preview', async ({ page }) => {
  await mockQuoteAuth(page);
  await page.goto('/#/studio');

  await expect(page.locator('#quote-studio-login')).toBeVisible();
  await expect(page.locator('#quote-studio-app')).toBeHidden();
  await page.locator('#quote-studio-email').fill('admin@example.com');
  await page.locator('#quote-studio-request-code').click();
  await page.locator('#quote-studio-code').fill('12345678');
  await page.locator('#quote-studio-login button[type="submit"]').click();
  await expect(page.locator('#quote-studio-app')).toBeVisible();

  await page.locator('.quote-settings summary').click();
  await page.locator('[data-rate-key="wedding:crew:traditional-photo"]').fill('12500');
  await page.locator('[data-rate-key="wedding:output:album-45"]').fill('22500');
  await page.locator('#quote-reviewed').check();
  await page.locator('#quote-save-settings').click();

  await page.locator('#quote-client').fill('Asha Rao');
  await page.locator('#quote-project').fill('Wedding coverage');
  await page.locator('#quote-event-choices label').filter({ hasText: 'Engagement' }).locator('input').check();
  await page.getByLabel('Engagement, day 1, Traditional photographer / day quantity').fill('2');
  await page.locator('[data-output-key="wedding:output:album-45"]').fill('1');

  await expect(page.locator('#quote-subtotal')).toHaveText('INR 47,500.00');
  await expect(page.locator('#quote-preview')).toBeEnabled();
  await page.locator('#quote-preview').click();

  await expect(page.locator('#quote-print-dialog')).toBeVisible();
  await expect(page.locator('#print-client')).toHaveText('Asha Rao');
  await expect(page.locator('#print-project')).toHaveText('Wedding coverage');
  await expect(page.locator('#print-rows')).toContainText('Album 45');
  await expect(page.locator('#print-rows')).toContainText('INR 22,500.00');
  await expect(page.locator('#print-terms')).toContainText('EVR Productions');
});

test('quotation studio rejects an invalid email code', async ({ page }) => {
  await mockQuoteAuth(page);
  await page.goto('/#/studio');
  await page.locator('#quote-studio-email').fill('admin@example.com');
  await page.locator('#quote-studio-request-code').click();
  await page.locator('#quote-studio-code').fill('87654321');
  await page.locator('#quote-studio-login button[type="submit"]').click();

  await expect(page.locator('#quote-studio-login-status')).toContainText('invalid or expired');
  await expect(page.locator('#quote-studio-app')).toBeHidden();
});

test('standalone EVR quotation file saves approved local rates and previews a quote', async ({ page }) => {
  await page.goto('/EVR-Productions-Quotation-Studio.html');
  await expect(page).toHaveTitle('EVR Productions | Quotation Studio');
  await expect(page.locator('.brand-name')).toContainText('EVR');

  await page.locator('.settings summary').click();
  await page.locator('[data-rate-key="wedding:crew:traditional-photo"]').fill('12500');
  await page.locator('[data-rate-key="wedding:output:album-45"]').fill('22500');
  await page.locator('#reviewed').check();
  await page.locator('#save-settings').click();

  await page.locator('#client').fill('Asha Rao');
  await page.locator('#project').fill('Wedding coverage');
  await page.locator('.choice').filter({ hasText: 'Engagement' }).locator('input').check();
  await page.getByLabel('Traditional photographer / day, day 1, quantity').fill('2');
  await page.getByLabel('Album 45 quantity').fill('1');

  await expect(page.locator('#total')).toHaveText('INR 47,500.00');
  await expect(page.locator('#preview')).toBeEnabled();
  await page.locator('#save-draft').click();
  await page.locator('#client').fill('');
  await page.locator('#load-draft').click();
  await expect(page.locator('#client')).toHaveValue('Asha Rao');
  await page.locator('#preview').click();

  await expect(page.locator('#print-dialog')).toBeVisible();
  await expect(page.locator('#print-client')).toHaveText('Asha Rao');
  await expect(page.locator('#print-rows')).toContainText('Album 45');
  await expect(page.locator('#print-rows')).toContainText('INR 22,500.00');
  await expect(page.locator('#print-terms')).toContainText('EVR Productions');
});

test('public wedding estimator shows only the overall price in its estimate and PDF', async ({ page }) => {
  await page.goto('/#/estimate');
  const builder = page.locator('#wedding-quotation-builder');
  await expect(page.locator('#estimate-calculator')).toHaveCount(0);
  await builder.locator('.builder-grid label').filter({ hasText: 'Client name' }).locator('input').fill('Asha Rao');
  await builder.locator('.builder-choices label').filter({ hasText: 'Engagement' }).locator('input').check();
  await builder.locator('[data-item="photographer"]').first().fill('2');
  await builder.locator('.builder-quantities label').filter({ hasText: 'Album 25' }).locator('input').fill('1');
  await builder.locator('.builder-quantities label').filter({ hasText: 'Album 45' }).locator('input').fill('1');

  await expect.poll(() => builder.locator('.builder-total').evaluate(element => element.value))
    .toBe('Estimated total: INR 51,000.00');
  await expect(builder.locator('.builder-quantities small')).toHaveCount(0);
  await expect(builder.locator('.builder-event').nth(0)).not.toContainText('INR');
  await expect(builder.locator('.builder-summary dl')).not.toContainText('INR');
  await builder.getByRole('button', { name: 'Preview / print estimate' }).click();
  await expect(page.locator('#quote-print-dialog')).toBeVisible();
  await expect(page.locator('#print-reference')).toHaveText('EVR-WEDDING-ESTIMATE');
  await expect(page.locator('#print-rows tr')).toHaveCount(3);
  await expect(page.locator('#print-rows tr').first()).toContainText('Engagement');
  await expect(page.locator('#print-rows')).toContainText('Album 45');
  await expect(page.locator('#print-rows')).not.toContainText('INR');
  await expect(page.locator('[data-quote-price-column]')).toHaveCount(2);
  for (const column of await page.locator('[data-quote-price-column]').all()) {
    await expect(column).toBeHidden();
  }
  await expect(page.locator('#print-totals')).toContainText('INR 51,000.00');
  await expect(page.locator('#print-notes')).toContainText('not a confirmed booking');
  const logo = await page.locator('#quote-print-document .quote-print-brand img').evaluate(image => ({
    loaded: image.complete && image.naturalWidth > 0,
    source: image.currentSrc
  }));
  expect(logo.loaded).toBe(true);
  expect(logo.source).toContain('evr-productions-logo-light.png');
  const footerLogo = await page.locator('.quote-print-footer [data-brand-logo]').evaluate(image => ({
    loaded: image.complete && image.naturalWidth > 0,
    source: image.currentSrc
  }));
  expect(footerLogo.loaded).toBe(true);
  expect(footerLogo.source).toContain('evr-productions-logo-dark.png');

  await page.locator('#quote-print-close').click();
  await builder.getByRole('button', { name: 'Discuss this estimate' }).click();
  await expect(page.locator('[name="brief"]')).toHaveValue(/Estimated total: INR 51,000\.00/);
  await expect(page.locator('[name="brief"]')).not.toHaveValue(/INR 8,000\.00/);
  await expect(page.locator('[name="brief"]')).not.toHaveValue(/INR 12,500\.00/);
  await expect(page.locator('[name="brief"]')).not.toHaveValue(/INR 22,500\.00/);
});

test('public production estimator keeps pricing call-based', async ({ page }) => {
  await page.goto('/#/production-quote');
  await expect(page.locator('#estimate-calculator')).toHaveCount(0);
  const builder = page.locator('#corporate-quotation-builder');
  await expect(builder).toBeVisible();
  await page.locator('#production-quote [data-scroll-to="corporate-quotation-builder"]').click();
  await expect(builder).toBeFocused();
  await builder.locator('.builder-grid label').filter({ hasText: 'Client name' }).locator('input').fill('Asha Rao');
  await builder.locator('.builder-choices label').filter({ hasText: 'Brand / corporate film' }).locator('input').check();
  await builder.locator('[data-item="producer"]').first().fill('1');

  await expect.poll(() => builder.locator('.builder-total').evaluate(element => element.value))
    .toBe('Pricing will be discussed on a call.');
  await builder.getByRole('button', { name: 'Preview / print quote request' }).click();
  await expect(page.locator('#quote-print-dialog')).toBeVisible();
  await expect(page.locator('#print-rows')).toContainText('Discuss with EVR');
  await expect(page.locator('#print-totals')).toContainText('Discuss with EVR');
  await expect(page.locator('#print-notes')).toContainText('not a priced quotation');
});

test('public pre-wedding estimate matches the standalone three-day package rate', async ({ page }) => {
  await page.goto('/#/estimate');
  const builder = page.locator('#wedding-quotation-builder');
  await builder.locator('.builder-grid label').filter({ hasText: 'Client name' }).locator('input').fill('Asha Rao');
  await builder.locator('.builder-choices label').filter({ hasText: 'Pre-wedding shoot' }).locator('input').check();
  const packagePanel = builder.locator('.builder-event').filter({ hasText: 'Pre-wedding shoot' });
  await packagePanel.locator('select').first().selectOption('3');

  await expect.poll(() => builder.locator('.builder-total').evaluate(element => element.value))
    .toBe('Estimated total: INR 1,00,000.00');
  await expect(packagePanel).not.toContainText('INR');
  await builder.getByRole('button', { name: 'Preview / print estimate' }).click();
  await expect(page.locator('#print-rows')).toContainText('3-day package');
  await expect(page.locator('#print-rows')).not.toContainText('INR');
  await expect(page.locator('#print-totals')).toContainText('INR 1,00,000.00');
});
