const { test, expect } = require('@playwright/test');
const { mockAdminApi } = require('./admin-api-mock');

test('admin can edit review text without media settings appearing on quote cards', async ({ page }) => {
  const api = await mockAdminApi(page);
  await page.goto('/#/admin');
  await page.locator('#admin-preview-page').selectOption('home');

  const quote = page.locator('#home .voice-grid article').first().locator('blockquote');
  await page.locator('[data-admin-mode="text"]').click();
  await quote.click();
  await expect(quote).toHaveAttribute('contenteditable', 'true');
  await quote.fill('Our edited testimonial text.');
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');
  expect(Object.values(api.getContent().entries).some(entry =>
    entry.type === 'text' && entry.value.includes('Our edited testimonial text.')
  )).toBe(true);
  await expect(page.locator('#home .voice-grid .admin-media-actions')).toHaveCount(0);
  await page.reload();
  await page.locator('#admin-preview-page').selectOption('home');
  await expect(quote).toHaveText('Our edited testimonial text.');
  await expect(page.locator('#home .voice-grid .admin-media-actions')).toHaveCount(0);
});
