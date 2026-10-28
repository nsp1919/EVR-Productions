const { test, expect } = require('@playwright/test');

test('text and background edits persist and reload', async ({ page }) => {
  await page.goto('/#/admin');
  try {
  await page.locator('#admin-preview-page').selectOption('home');
  await page.locator('[data-admin-mode="text"]').click();
  await page.locator('#home h1 em').click();
  await expect(page.locator('#home h1 em')).toHaveAttribute('contenteditable', 'true');
  await page.locator('#home h1 em').fill('Runtime verified stories');
  await page.locator('[data-admin-mode="background"]').click();
  const backgroundTarget = page.locator('#home > div > div > div > div').first();
  await backgroundTarget.click({ position: { x: 100, y: 100 } });
  await page.locator('#admin-background-color').fill('#123456');
  await page.locator('#admin-save').click();
  await expect(page.locator('#admin-status')).toContainText('Changes saved');

  await page.reload();
  await page.locator('#admin-preview-page').selectOption('home');
  await expect(page.locator('#home h1 em')).toHaveText('Runtime verified stories');
  await expect(page.locator('#home > div > div > div > div').first()).toHaveCSS('background-color', 'rgb(18, 52, 86)');

  } finally {
    await page.evaluate(() => localStorage.removeItem('evr-site-content'));
  }
});
