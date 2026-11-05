'use strict';

const { test, expect } = require('@playwright/test');

const quoteId = 'a'.repeat(48);
const savedQuote = {
  quote: {
    version: 1,
    reference: 'EVR-2026-04',
    client: 'Asha Rao',
    groom: 'Asha',
    bride: 'Ravi',
    date: '2026-12-10',
    events: [{
      name: 'Wedding',
      date: '2026-12-10',
      session: '',
      requirements: [],
      days: [{ number: 1, date: '2026-12-10', session: 'Ceremony', requirements: ['Photography'] }]
    }],
    deliverables: ['Wedding Album'],
    total: 25000,
    terms: 'Please confirm your event details.',
    websiteSections: ['home', 'work', 'process'],
    createdAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2026-10-31T00:00:00.000Z'
  },
  accepted: false,
  responded: false,
  response: null
};

async function openProposal(page) {
  await page.route('**/api/brand-logo', route => route.fulfill({
    json: { light: '/assets/evr-productions-logo-light.png', dark: '/assets/evr-productions-logo-dark.png' }
  }));
  await page.route('**/api/quote-maker/quotes?id=*', route => route.fulfill({ json: savedQuote }));
  await page.goto(`/proposal.html?id=${quoteId}&view=proposal`);
  await expect(page.locator('#proposal-content')).toBeVisible();
}

test('proposal renders quote details and links to key EVR website sections', async ({ page }) => {
  await openProposal(page);

  await expect(page.locator('#proposal-title')).toHaveText('Asha & Ravi, your story starts here.');
  await expect(page.locator('#quote-total')).toContainText('25,000');
  await expect(page.locator('#quote-events')).toContainText('Wedding');
  await expect(page.locator('#quote-deliverables')).toContainText('Wedding Album');
  await expect(page.locator('#quote-terms')).toHaveText('Please confirm your event details.');
  await expect(page.locator('.website-links a')).toHaveCount(6);
  await expect(page.locator('.website-links a[href="/#/work"]')).toContainText('Wedding stories');
});

test('client can accept after confirming the terms', async ({ page }) => {
  let submitted;
  await openProposal(page);
  await page.route('**/api/quote-maker/quotes', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { accepted: true } });
  });

  await page.getByRole('button', { name: 'Accept quotation' }).click();
  await page.locator('#response-name').fill('Asha Rao');
  await page.locator('#accept-confirmation').check();
  await page.getByRole('button', { name: 'Confirm acceptance' }).click();

  await expect(page.locator('#response-status')).toContainText('acceptance has been recorded');
  expect(submitted).toMatchObject({
    action: 'accept',
    id: quoteId,
    name: 'Asha Rao',
    accepted: true
  });
});

test('client can submit a request for changes', async ({ page }) => {
  let submitted;
  await openProposal(page);
  await page.route('**/api/quote-maker/quotes', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { requestedChanges: true } });
  });

  await page.getByRole('button', { name: 'Request changes' }).click();
  await page.locator('#response-name').fill('Asha Rao');
  await page.locator('#response-message').fill('Please include an additional event.');
  await page.getByRole('button', { name: 'Send change request' }).click();

  await expect(page.locator('#response-status')).toContainText('requested changes have been sent');
  expect(submitted).toMatchObject({
    action: 'request-changes',
    id: quoteId,
    name: 'Asha Rao',
    message: 'Please include an additional event.'
  });
});
